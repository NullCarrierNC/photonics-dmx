/**
 * Event-driven execution engine for cue node graphs. Executes nodes
 * sequentially, respecting blocking semantics; extends
 * {@link BaseNodeExecutionEngine} with the cue-specific behaviour (strict
 * revisit policy, cue/group variable stores, effect-raiser dispatch).
 *
 * Value, logic, and data work is delegated to focused helpers:
 * - dataExtractors.ts: CueData and config data extraction
 * - valueResolver.ts: ValueSource resolution and type inference
 * - logicNodeEvaluator.ts: Logic node evaluation (variable, math, conditional, loops)
 */

import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CueData } from '../../types/cueTypes'
import { AudioCueData } from '../../types/audioCueTypes'
import { CompiledYargCue, CompiledAudioCue } from '../compiler/NodeCueCompiler'
import {
  ActionEffectFactory,
  resolvedMotionPatternSettingsEqual,
  resolvedMotionPatternSettingsEqualExceptBearing,
  trackedLightIdsEqualOrder,
} from '../compiler/ActionEffectFactory'
import {
  ActionNode,
  BaseEventNode,
  EventListenerNode,
  EffectRaiserNode,
  LogicNode,
  VariableDefinition,
  ValueSource,
  VariableType,
} from '../../types/nodeCueTypes'
import { TrackedLight, Color } from '../../../types'
import { ExecutionContext } from './ExecutionContext'
import { ExecutionState, VariableValue, NodeRuntimeCallbacks } from './executionTypes'
import { EffectRegistry } from './EffectRegistry'
import { EffectExecutionEngine } from './EffectExecutionEngine'
import { BaseNodeExecutionEngine, CompiledGraph } from './BaseNodeExecutionEngine'
import { RevisitPolicy } from './GraphExecutionPolicy'
import { ContextLifecycleEvent } from './executionStateMachineLifecycle'
import { resolveValue } from './valueResolver'
import { resolveActionTiming, resolveActionLayer, resolveMotionPattern } from './actionResolver'
import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { createLogger } from '../../../../shared/logger'
const log = createLogger('NodeExecutionEngine')

/**
 * Infer variable type from a value source when the effect parameter definition is missing.
 * Used so unknown parameters are not coerced through a numeric fallback (which would turn
 * e.g. "delay" or "yellow" into 0).
 */
function inferEffectParameterType(source: ValueSource | undefined): VariableType {
  if (!source || source.source !== 'literal') return 'string'
  const v = source.value
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  if (Array.isArray(v)) return 'light-array'
  return 'string'
}

/** Optional collaborators for a {@link NodeExecutionEngine}; omitted fields fall back to defaults. */
export interface NodeExecutionEngineOptions {
  firstSubmissionUsesSetEffectRef?: { use: boolean }
  runtimeCallbacks?: NodeRuntimeCallbacks
  consumeInitialClearPolicy?: () => boolean
  /** Invoked on each context start/complete/cancel/blocked/running so the owner can drive its ExecutionStateMachine. */
  onContextLifecycle?: (contextId: string, event: ContextLifecycleEvent) => void
  /** Re-entry policy; defaults to 'strict'. */
  revisitPolicy?: RevisitPolicy
}

export class NodeExecutionEngine extends BaseNodeExecutionEngine {
  /**
   * Global runtime toggle for node-cue debug logging.
   * This is useful in packaged builds where env vars are inconvenient.
   */
  private static globalDebugEnabled = false

  public static setDebugEnabled(enabled: boolean): void {
    NodeExecutionEngine.globalDebugEnabled = enabled
  }

  public static getDebugEnabled(): boolean {
    return NodeExecutionEngine.globalDebugEnabled
  }

  private compiledCue: CompiledYargCue | CompiledAudioCue
  private cueId: string
  private cueLevelVarStore: Map<string, VariableValue>
  private groupLevelVarStore: Map<string, VariableValue>
  private effectRegistry: EffectRegistry
  private activeEffectEngines: Map<string, EffectExecutionEngine> = new Map()
  /** Node IDs that have emitted 'activated' but not yet 'deactivated', so cancelAll can flush them. */
  private pendingActivations: Set<string> = new Set()
  private readonly revisitPolicyValue: RevisitPolicy
  /**
   * Instance snapshot of env-based debug setting. Note that runtime toggles are handled via
   * the static global flag so existing engines can start logging immediately.
   */
  private debugEnabled: boolean
  /** When set (GraphExecutionEngine supplies it), invoked on each context start/complete/cancel/blocked/running so the owner can drive its ExecutionStateMachine. */
  private readonly onContextLifecycle?: (contextId: string, event: ContextLifecycleEvent) => void

  constructor(
    compiledCue: CompiledYargCue | CompiledAudioCue,
    cueId: string,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    runtimeBroadcaster: RuntimeBroadcaster,
    cueLevelVarStore: Map<string, VariableValue>,
    groupLevelVarStore: Map<string, VariableValue>,
    effectRegistry: EffectRegistry,
    variableDefinitions: VariableDefinition[] = [],
    options: NodeExecutionEngineOptions = {},
  ) {
    super({
      sequencer,
      lightManager,
      broadcaster: runtimeBroadcaster,
      variableDefinitions,
      firstSubmissionUsesSetEffectRef: options.firstSubmissionUsesSetEffectRef,
      runtimeCallbacks: options.runtimeCallbacks,
      consumeInitialClearPolicy: options.consumeInitialClearPolicy,
    })
    this.compiledCue = compiledCue
    this.cueId = cueId
    this.cueLevelVarStore = cueLevelVarStore
    this.groupLevelVarStore = groupLevelVarStore
    this.effectRegistry = effectRegistry
    this.onContextLifecycle = options.onContextLifecycle
    this.revisitPolicyValue = options.revisitPolicy ?? 'strict'

    // Debug logging is opt-in to avoid noisy logs in normal operation.
    // Enable with either env var:
    // - PHOTONICS_NODE_CUE_DEBUG=1
    // - NODE_CUE_DEBUG=1
    this.debugEnabled =
      process?.env?.PHOTONICS_NODE_CUE_DEBUG === '1' || process?.env?.NODE_CUE_DEBUG === '1'

    // Register all event listeners during initialization
    this.registerEventListeners()
  }

  protected get compiled(): CompiledGraph {
    return this.compiledCue
  }

  protected get revisitPolicy(): RevisitPolicy {
    return this.revisitPolicyValue
  }

  protected getEmitCueId(): string {
    return this.cueId
  }

  /** Cue effect naming: `${cueId}:${nodeId}` (+ `:${iterIdx}` inside a for-each-light loop). */
  protected buildEffectName(actionNodeId: string, iterationIndex = -1): string {
    return iterationIndex >= 0
      ? `${this.cueId}:${actionNodeId}:${iterationIndex}`
      : `${this.cueId}:${actionNodeId}`
  }

  /** Cue chain naming inserts a `:chain:` infix off the first node id. */
  protected override buildChainEffectName(firstActionNodeId: string, iterationIndex = -1): string {
    return iterationIndex >= 0
      ? `${this.cueId}:chain:${firstActionNodeId}:${iterationIndex}`
      : `${this.cueId}:chain:${firstActionNodeId}`
  }

  /**
   * Blackout uses sequencer.blackout() directly (cue-only). Blocks downstream execution until the
   * blackout transition completes.
   */
  protected override handleBlackoutAction(
    actionNode: ActionNode,
    context: ExecutionContext,
  ): boolean {
    if (actionNode.effectType !== 'blackout') {
      return false
    }
    const resolvedTiming = resolveActionTiming(actionNode.timing, context)

    // Register this action as active (waiting for completion)
    context.registerActiveAction(actionNode.id, actionNode)

    // Call sequencer.blackout() which returns a Promise<void>
    this.sequencer
      .blackout(resolvedTiming.duration)
      .then(() => {
        // Blackout completed
        if (context.hasVisited(actionNode.id)) {
          this.emitNodeExecution('deactivated', actionNode.id)
          context.completeAction(actionNode.id)
        }
      })
      .catch((error) => {
        log.error(`Error during blackout for action node ${actionNode.id}:`, error)
        // Continue execution despite error
        if (context.hasVisited(actionNode.id)) {
          this.emitNodeExecution('deactivated', actionNode.id)
          context.completeAction(actionNode.id)
        }
      })
    return true
  }

  /**
   * Submit / update a motion-pattern effect on the sequencer (cue-only). Skips re-adding when the
   * resolved config already matches an active run (or updates only the bearing where possible).
   */
  protected handleMotionPatternAction(actionNode: ActionNode, context: ExecutionContext): boolean {
    if (!actionNode.motionPattern) {
      log.warn(`motion-pattern action ${actionNode.id} is missing motionPattern`)
      this.continueToNextNodes(actionNode.id, context)
      return true
    }

    const resolvedMotion = resolveMotionPattern(actionNode.motionPattern, context)
    const resolvedTiming = resolveActionTiming(actionNode.timing, context)
    const resolvedLayer = resolveActionLayer(actionNode.layer, context)

    if (
      !Number.isFinite(resolvedMotion.speedHz) ||
      resolvedMotion.speedHz <= 0 ||
      !Number.isFinite(resolvedMotion.sizeDeg) ||
      resolvedMotion.sizeDeg <= 0
    ) {
      log.warn(
        `motion-pattern action ${actionNode.id}: speed (Hz) and size (deg) must be finite and positive`,
      )
      this.continueToNextNodes(actionNode.id, context)
      return true
    }

    const lights = ActionEffectFactory.resolveLights(
      this.lightManager,
      actionNode.target,
      (varName: string) => this.lookupVar(varName, context),
    )

    if (!lights || lights.length === 0) {
      this.continueToNextNodes(actionNode.id, context)
      return true
    }

    const iterIdx = context.getForEachIterationIndex()
    const effectName = this.buildEffectName(actionNode.id, iterIdx)

    const rampUpMs = resolvedTiming.duration > 0 ? resolvedTiming.duration : 0

    const existingPattern = this.sequencer.getMotionPattern(effectName)
    if (
      existingPattern &&
      existingPattern.layer === resolvedLayer &&
      existingPattern.rampUpDurationMs === rampUpMs &&
      trackedLightIdsEqualOrder(existingPattern.lights, lights)
    ) {
      if (resolvedMotionPatternSettingsEqual(existingPattern.config, resolvedMotion)) {
        this.submittedMotionPatterns.add(effectName)
        this.emitNodeExecution('deactivated', actionNode.id)
        this.continueToNextNodes(actionNode.id, context)
        return true
      }
      if (resolvedMotionPatternSettingsEqualExceptBearing(existingPattern.config, resolvedMotion)) {
        this.sequencer.updateMotionPatternConfig(effectName, resolvedMotion)
        this.submittedMotionPatterns.add(effectName)
        this.emitNodeExecution('deactivated', actionNode.id)
        this.continueToNextNodes(actionNode.id, context)
        return true
      }
    }

    this.sequencer.cancelPanTiltClear()
    this.sequencer.addMotionPattern(effectName, resolvedMotion, lights, resolvedLayer, rampUpMs)
    this.submittedMotionPatterns.add(effectName)
    this.emitNodeExecution('deactivated', actionNode.id)
    this.continueToNextNodes(actionNode.id, context)
    return true
  }

  protected override trackActivation(type: 'activated' | 'deactivated', nodeId: string): void {
    if (type === 'activated') {
      this.pendingActivations.add(nodeId)
    } else {
      this.pendingActivations.delete(nodeId)
    }
  }

  protected override batchOptions(context: ExecutionContext): {
    onBlocked?: () => void
    onNodeError?: (nodeId: string, error: unknown) => void
  } {
    return { onBlocked: () => this.onContextLifecycle?.(context.id, 'blocked') }
  }

  protected override debugLog(message: string, data?: unknown): void {
    // Allow enabling debug at runtime via NodeExecutionEngine.setDebugEnabled(...)
    if (!this.debugEnabled && !NodeExecutionEngine.globalDebugEnabled) return
    // Use console.log (not debug) so it shows up consistently in packaged builds.
    if (data === undefined) {
      log.info(`[NodeCue] ${this.cueId} ${message}`)
      return
    }

    log.info(`[NodeCue] ${this.cueId} ${message}`, this.debugPreview(data))
  }

  private debugPreview(value: unknown): unknown {
    // Keep logs readable and avoid dumping huge arrays/objects.
    const maxArray = 12
    const maxString = 300

    const previewAny = (v: unknown): unknown => {
      if (v === null || v === undefined) return v
      if (typeof v === 'string') {
        return v.length > maxString ? `${v.slice(0, maxString)}…` : v
      }
      if (typeof v === 'number' || typeof v === 'boolean') return v
      if (Array.isArray(v)) {
        const head = v.slice(0, maxArray).map(previewAny)
        return v.length > maxArray ? { items: head, truncated: v.length - maxArray } : head
      }
      if (v && typeof v === 'object') {
        const obj = v as Record<string, unknown>
        // Special-case TrackedLight-ish objects
        if ('id' in obj && typeof obj.id === 'string') {
          const out: Record<string, unknown> = { id: obj.id }
          if ('position' in obj && typeof obj.position === 'number') out.position = obj.position
          return out
        }

        // VariableValue preview
        if ('type' in obj && 'value' in obj) {
          return { type: obj.type, value: previewAny(obj.value) }
        }

        // Generic object: shallow preview keys
        const result: Record<string, unknown> = {}
        for (const [k, val] of Object.entries(obj)) {
          result[k] = previewAny(val)
        }
        return result
      }
      return v
    }

    return previewAny(value)
  }

  private getVariableValue(name: string, context: ExecutionContext): VariableValue | undefined {
    return context.cueLevelVarStore.get(name) ?? context.groupLevelVarStore.get(name)
  }

  /**
   * Start executing a node graph from an event node.
   * Creates a new ExecutionContext and begins execution.
   */
  public startExecution(eventNode: BaseEventNode, parameters: CueData): void {
    this.startExecutionWithCallback(eventNode, parameters)
  }

  /**
   * Start executing a node graph from an event node with an optional completion callback.
   * Creates a new ExecutionContext and begins execution.
   * @param eventNode The event node to start execution from
   * @param parameters The cue data parameters
   * @param onComplete Optional callback fired when this execution context completes
   * @param options Optional: fromPort filters outgoing edges to only the given port (e.g. 'enter', 'during', 'exit' for AudioTriggerNode)
   */
  public startExecutionWithCallback(
    eventNode: BaseEventNode,
    parameters: CueData,
    onComplete?: () => void,
    options?: { fromPort?: string },
  ): void {
    try {
      const context = new ExecutionContext(
        eventNode,
        parameters,
        this.cueLevelVarStore,
        this.groupLevelVarStore,
      )

      const eventType =
        'eventType' in eventNode && typeof eventNode.eventType === 'string'
          ? eventNode.eventType
          : 'unknown'
      this.debugLog(`startExecution event=${eventType} nodeId=${eventNode.id} ctx=${context.id}`)

      // Set up completion callbacks
      context.setOnNodeComplete((nodeId: string) => {
        this.onActionComplete(context.id, nodeId)
      })

      context.setOnContextComplete(() => {
        this.onContextLifecycle?.(context.id, 'completed')
        this.activeContexts.delete(context.id)
        // Fire external completion callback if provided
        if (onComplete) {
          onComplete()
        }
      })

      this.activeContexts.set(context.id, context)

      this.onContextLifecycle?.(context.id, 'started')

      this.emitNodeExecution('activated', eventNode.id)
      this.emitNodeExecution('deactivated', eventNode.id)

      // Get outgoing edges from event node; filter by fromPort when provided (e.g. AudioTriggerNode enter/during/exit)
      const { adjacency } = this.compiledCue
      let outgoing = adjacency.get(eventNode.id) ?? []
      if (options?.fromPort !== undefined) {
        outgoing = outgoing.filter((conn) => conn.fromPort === options.fromPort)
      }
      const nextNodes = outgoing.map((conn) => conn.to)

      if (nextNodes.length > 0) {
        this.continueExecution(nextNodes, context)
      } else {
        // No nodes to execute, context completes immediately
        this.onContextLifecycle?.(context.id, 'completed')
        context.dispose()
        this.activeContexts.delete(context.id)
        // Fire completion callback even for empty execution
        if (onComplete) {
          onComplete()
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${eventNode.id}: ${msg}`)
      log.error(`Error starting execution for event ${eventNode.id}:`, error)
    }
  }

  /** Rich debug logging for a logic node before it executes (cue-only). */
  protected override logLogicNode(logicNode: LogicNode, context: ExecutionContext): void {
    if (!this.debugEnabled && !NodeExecutionEngine.globalDebugEnabled) return
    const logicLog: Record<string, unknown> = {
      logicType: logicNode.logicType,
      nodeId: logicNode.id,
      ctx: context.id,
    }
    if ('sourceVariable' in logicNode && logicNode.sourceVariable) {
      const src = logicNode.sourceVariable as string
      logicLog.sourceVariable = src
      logicLog.sourceValue = this.getVariableValue(src, context)
    }
    if ('varName' in logicNode && logicNode.varName) {
      logicLog.varName = logicNode.varName
      logicLog.varValueBefore = this.getVariableValue(logicNode.varName, context)
    }
    if ('assignTo' in logicNode && logicNode.assignTo) {
      logicLog.assignTo = logicNode.assignTo
      logicLog.assignToBefore = this.getVariableValue(logicNode.assignTo, context)
    }
    this.debugLog(`exec logic nodeId=${logicNode.id} ctx=${context.id}`, logicLog)
  }

  /** Cue-specific node kind: effect-raiser. */
  protected override dispatchSpecialNode(nodeId: string, context: ExecutionContext): boolean {
    const effectRaiserNode = this.compiledCue.effectRaiserMap?.get(nodeId)
    if (effectRaiserNode) {
      this.debugLog(`exec effect-raiser nodeId=${nodeId} ctx=${context.id}`, {
        effectId: effectRaiserNode.effectId,
        parameterValues: effectRaiserNode.parameterValues,
      })
      this.executeEffectRaiserNode(effectRaiserNode, context)
      return true
    }
    return false
  }

  /** Cue behavior for unknown nodes: skip and continue downstream. */
  protected override onUnknownNode(nodeId: string, context: ExecutionContext): void {
    this.continueToNextNodes(nodeId, context)
  }

  /** Cue marks the logic node visited after evaluation (safe under strict re-entry). */
  protected override afterLogicEval(nodeId: string, context: ExecutionContext): void {
    context.markVisited(nodeId)
  }

  /**
   * Execute an effect raiser node: trigger effect and block re-triggering until it completes.
   */
  private executeEffectRaiserNode(raiserNode: EffectRaiserNode, context: ExecutionContext): void {
    try {
      const { effectId } = raiserNode

      // Skip if no effect selected
      if (!effectId) {
        log.warn(`Effect raiser ${raiserNode.id} has no effect selected, skipping`)
        this.continueToNextNodes(raiserNode.id, context)
        return
      }

      // Inside a for-each-light loop each iteration must get its own engine instance.
      // Outside loops the iteration index is -1, so the key reduces to raiserNode.id.
      const iterIdx = context.getForEachIterationIndex()
      const engineKey = iterIdx >= 0 ? `${raiserNode.id}:${iterIdx}` : raiserNode.id

      // Check if this effect raiser already has an active execution (contexts or callback-backed effects)
      const existingEngine = this.activeEffectEngines.get(engineKey)
      if (existingEngine) {
        if (existingEngine.isBusy()) {
          this.debugLog(`Effect raiser ${raiserNode.id} blocked: effect still running`)
          this.emitNodeExecution('deactivated', raiserNode.id)
          this.continueToNextNodes(raiserNode.id, context)
          return
        }
        // Engine is idle - clean it up and allow new trigger
        this.debugLog(`Effect raiser ${raiserNode.id} cleaning up idle engine`)
        this.activeEffectEngines.delete(engineKey)
      }

      // Look up effect from registry
      const compiledEffect = this.effectRegistry.getEffect(effectId)

      if (!compiledEffect) {
        // Gracefully handle missing effect (may have been deleted)
        log.warn(
          `Effect ${effectId} not found (missing dependency), skipping effect raiser ${raiserNode.id}`,
        )
        this.emitNodeExecution('deactivated', raiserNode.id)
        this.continueToNextNodes(raiserNode.id, context)
        return
      }

      // Resolve parameter values using the effect's declared parameter types so string/color/event
      // params are not coerced through a numeric fallback.
      const paramValues: Record<string, string | number | boolean | TrackedLight[] | Color[]> = {}
      for (const [paramName, valueSource] of Object.entries(raiserNode.parameterValues ?? {})) {
        const paramDef = compiledEffect.parameters.get(paramName)
        const expectedType: VariableType =
          paramDef != null ? paramDef.type : inferEffectParameterType(valueSource)
        paramValues[paramName] = resolveValue(expectedType, valueSource, context)
      }

      // Create effect execution engine (share initial-clear policy so first submission in cue or effect uses setEffect)
      const effectEngine = new EffectExecutionEngine(
        compiledEffect,
        this.sequencer,
        this.lightManager,
        this.broadcaster,
        paramValues,
        context.cueData, // Pass caller's cue data
        {
          firstSubmissionUsesSetEffectRef: this.firstSubmissionUsesSetEffectRef,
          runtimeCallbacks: this.runtimeCallbacks,
          consumeInitialClearPolicy: this.consumeInitialClearPolicy,
        },
      )

      // Set up completion callback: when effect is idle, do cleanup/persistent logic then continue
      // to the next node. Continuing only on idle ensures delay-based stepping (e.g. Score 500ms
      // yellow, 200ms blue) is observed: the next raiser (e.g. blue) runs after this effect
      // completes instead of in the same tick (which would replace this effect via addEffect).
      effectEngine.setOnIdle(() => {
        if (raiserNode.isPersistent && this.activeEffectEngines.has(engineKey)) {
          this.debugLog(`Effect raiser ${raiserNode.id} persistent: re-triggering`)
          effectEngine.triggerEffect(context.cueData)
        } else {
          this.debugLog(`Effect raiser ${raiserNode.id} completed, removing from tracking`)
          this.activeEffectEngines.delete(engineKey)
        }
        this.emitNodeExecution('deactivated', raiserNode.id)
        this.continueToNextNodes(raiserNode.id, context)
      })

      // Store the engine in active tracking
      this.activeEffectEngines.set(engineKey, effectEngine)

      // Trigger effect; continue to next node only when effect goes idle (in setOnIdle above)
      effectEngine.triggerEffect(context.cueData)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${raiserNode.id}: ${msg}`)
      log.error(`Error executing effect raiser node ${raiserNode.id}:`, error)
      this.emitNodeExecution('deactivated', raiserNode.id)
    }
  }

  /**
   * Start execution from a listener node.
   * Creates a new execution context for the listener chain.
   */
  protected startListenerExecution(
    listenerNode: EventListenerNode,
    cueData: CueData | AudioCueData,
  ): void {
    try {
      // Create new context for listener chain (listener has id; ExecutionContext only needs event-like shape)
      const context = new ExecutionContext(
        listenerNode as unknown as BaseEventNode,
        cueData,
        this.cueLevelVarStore,
        this.groupLevelVarStore,
      )

      // Set up callbacks
      context.setOnNodeComplete((nodeId: string) => {
        this.onActionComplete(context.id, nodeId)
      })

      context.setOnContextComplete(() => {
        this.onContextLifecycle?.(context.id, 'completed')
        this.activeContexts.delete(context.id)
      })

      this.activeContexts.set(context.id, context)

      this.onContextLifecycle?.(context.id, 'started')

      this.emitNodeExecution('activated', listenerNode.id)
      this.emitNodeExecution('deactivated', listenerNode.id)

      // Get listener's outgoing edges and start execution
      const { adjacency } = this.compiledCue
      const outgoing = adjacency.get(listenerNode.id) ?? []
      const nextNodes = outgoing.map((conn) => conn.to)

      if (nextNodes.length > 0) {
        this.continueExecution(nextNodes, context)
      } else {
        // No child nodes, context completes immediately
        this.onContextLifecycle?.(context.id, 'completed')
        context.dispose()
        this.activeContexts.delete(context.id)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${listenerNode.id}: ${msg}`)
      log.error(`Error starting listener execution for ${listenerNode.id}:`, error)
    }
  }

  /**
   * Called when an action completes.
   * Continues execution to downstream nodes.
   */
  private onActionComplete(contextId: string, nodeId: string): void {
    const context = this.activeContexts.get(contextId)
    if (!context) {
      return // Context already completed or cancelled
    }

    this.onContextLifecycle?.(contextId, 'running')
    context.advancePhase()
    // Continue to next nodes after this action
    this.continueToNextNodes(nodeId, context)

    // Check if context is now complete
    if (context.tryComplete()) {
      context.dispose()
    }
  }

  /** Flush any node activations that never deactivated so the UI doesn't leave nodes lit. */
  protected override onCancelStart(): void {
    for (const nodeId of this.pendingActivations) {
      this.runtimeEmit(RENDERER_RECEIVE.NODE_EXECUTION, {
        type: 'deactivated',
        cueId: this.cueId,
        nodeId,
        timestamp: Date.now(),
      })
    }
    this.pendingActivations.clear()
  }

  protected override onContextCancelled(contextId: string): void {
    this.onContextLifecycle?.(contextId, 'cancelled')
  }

  /** Cancel nested effect engines spawned by effect-raiser nodes. */
  protected override onCancelFinish(skipEffectRemoval: boolean): void {
    for (const effectEngine of this.activeEffectEngines.values()) {
      effectEngine.cancelAll(skipEffectRemoval)
    }
    this.activeEffectEngines.clear()
  }

  /**
   * Get execution state for debugging.
   */
  public getExecutionState(): ExecutionState {
    const activeContexts = Array.from(this.activeContexts.values()).map((context) => {
      const info = context.getDebugInfo()
      return {
        id: info.id,
        eventNodeId: info.eventNodeId,
        eventType:
          'eventType' in context.eventNode && typeof context.eventNode.eventType === 'string'
            ? context.eventNode.eventType
            : 'unknown',
        startTime: info.startTime,
        visitedNodes: info.visitedNodes,
        activeNodes: info.activeNodes,
      }
    })

    return { activeContexts }
  }
}
