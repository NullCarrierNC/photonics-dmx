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
import { CompiledNetCue, CompiledAudioCue } from '../compiler/NodeCueCompiler'
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
  NodeCueMode,
} from '../../types/nodeCueTypes'
import { ExecutionContext } from './ExecutionContext'
import {
  ExecutionState,
  VariableValue,
  NodeRuntimeCallbacks,
  type NodeCueDebugSwitch,
} from './executionTypes'
import { EffectRegistry } from './EffectRegistry'
import { EffectExecutionEngine } from './EffectExecutionEngine'
import { BaseNodeExecutionEngine, CompiledGraph } from './BaseNodeExecutionEngine'
import { RevisitPolicy } from './GraphExecutionPolicy'
import { ContextLifecycleEvent } from './executionStateMachineLifecycle'
import { resolveVariableValue } from './valueResolver'
import { debugPreview } from './nodeDebugPreview'
import { resolveActionTiming, resolveActionLayer, resolveMotionPattern } from './actionResolver'
import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { createLogger } from '../../../../shared/logger'
const log = createLogger('NodeExecutionEngine')

/** A running effect engine, with the release for whatever hold its raising context took. */
interface RaisedEffect {
  engine: EffectExecutionEngine
  releaseWaiter: () => void
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
  /** Turns debug logging on at runtime. */
  debug?: NodeCueDebugSwitch
}

export class NodeExecutionEngine extends BaseNodeExecutionEngine {
  private compiledCue: CompiledNetCue | CompiledAudioCue
  private cueId: string
  private cueLevelVarStore: Map<string, VariableValue>
  private groupLevelVarStore: Map<string, VariableValue>
  private effectRegistry: EffectRegistry
  private activeEffectEngines: Map<string, RaisedEffect> = new Map()
  /** Node IDs that have emitted 'activated' but not yet 'deactivated', so cancelAll can flush them. */
  private pendingActivations: Set<string> = new Set()
  private readonly revisitPolicyValue: RevisitPolicy
  /** The env-based debug setting, read once. The injected switch covers runtime toggles. */
  private readonly envDebugEnabled: boolean
  private readonly debug?: NodeCueDebugSwitch
  /** When set (GraphExecutionEngine supplies it), invoked on each context start/complete/cancel/blocked/running so the owner can drive its ExecutionStateMachine. */
  private readonly onContextLifecycle?: (contextId: string, event: ContextLifecycleEvent) => void

  constructor(
    compiledCue: CompiledNetCue | CompiledAudioCue,
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
    this.envDebugEnabled =
      process?.env?.PHOTONICS_NODE_CUE_DEBUG === '1' || process?.env?.NODE_CUE_DEBUG === '1'
    this.debug = options.debug

    // Register all event listeners during initialization
    this.registerEventListeners()
  }

  protected get compiled(): CompiledGraph {
    return this.compiledCue
  }

  /** A cue's domain is its own, set from the directory its file was loaded from. */
  protected get mode(): NodeCueMode {
    return this.compiledCue.mode
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
        // Guard on isActionActive: another blocking node can advance the phase while this fades.
        if (context.isActionActive(actionNode.id)) {
          this.emitNodeExecution('deactivated', actionNode.id)
          context.completeAction(actionNode.id)
        }
      })
      .catch((error) => {
        log.error(`Error during blackout for action node ${actionNode.id}:`, error)
        // Continue execution despite error
        if (context.isActionActive(actionNode.id)) {
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

  private get debugging(): boolean {
    return this.envDebugEnabled || this.debug?.enabled === true
  }

  protected override debugLog(message: string, data?: unknown): void {
    if (!this.debugging) return
    // Use console.log (not debug) so it shows up consistently in packaged builds.
    if (data === undefined) {
      log.info(`[NodeCue] ${this.cueId} ${message}`)
      return
    }

    log.info(`[NodeCue] ${this.cueId} ${message}`, debugPreview(data))
  }

  private getVariableValue(name: string, context: ExecutionContext): VariableValue | undefined {
    return context.cueLevelVarStore.get(name) ?? context.groupLevelVarStore.get(name)
  }

  /**
   * Start executing a node graph from an event node.
   * Creates a new ExecutionContext and begins execution.
   */
  public startExecution(eventNode: BaseEventNode, parameters: CueData | AudioCueData): void {
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
    parameters: CueData | AudioCueData,
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
      this.emitRuntimeError(eventNode.id, msg)
      log.error(`Error starting execution for event ${eventNode.id}:`, error)
    }
  }

  /** Rich debug logging for a logic node before it executes (cue-only). */
  protected override logLogicNode(logicNode: LogicNode, context: ExecutionContext): void {
    if (!this.debugging) return
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
   *
   * A raiser with nodes after it holds its context open until the effect goes idle, so those nodes
   * run once per effect run rather than on the frame that raised it. A raiser with nothing after it
   * registers no hold, leaving the rest of the cue free to run while its effect plays.
   */
  private executeEffectRaiserNode(raiserNode: EffectRaiserNode, context: ExecutionContext): void {
    /** Release for this call's own hold, and for the hold of a run this call interrupted. */
    let releaseWaiter: (() => void) | undefined
    let releaseInterrupted: (() => void) | undefined
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
      const existing = this.activeEffectEngines.get(engineKey)
      if (existing) {
        if (existing.engine.isBusy()) {
          if (!raiserNode.interruptible) {
            this.debugLog(`Effect raiser ${raiserNode.id} blocked: effect still running`)
            this.emitNodeExecution('deactivated', raiserNode.id)
            this.continueToNextNodes(raiserNode.id, context)
            return
          }
          // Interruptible: cancel the in-flight effect so a fresh one restarts from the top.
          // Removes its submitted effects from the sequencer and clears its idle callback. The
          // cancelled run can no longer report idle, so its context is released only once the
          // replacement is tracked: releasing before that can complete a cue-called context, which
          // dispatches the frame queued behind it and re-enters this method on the same key.
          this.debugLog(
            `Effect raiser ${raiserNode.id} interruptible: cancelling running effect to restart`,
          )
          releaseInterrupted = existing.releaseWaiter
          existing.engine.cancelAll()
        } else {
          // Engine is idle - clean it up and allow new trigger. Its queued idle still runs and
          // carries the context that raised it forward, so no release here.
          this.debugLog(`Effect raiser ${raiserNode.id} cleaning up idle engine`)
        }
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

      // Each parameter the effect declares, resolved as its declared type.
      const paramValues: Record<string, VariableValue> = {}
      for (const [paramName, valueSource] of Object.entries(raiserNode.parameterValues ?? {})) {
        const paramDef = compiledEffect.parameters.get(paramName)
        if (paramDef)
          paramValues[paramName] = resolveVariableValue(paramDef.type, valueSource, context)
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
          // The raising cue's mode, so cue-data inside the effect reads the frame that raised it.
          callerMode: this.mode,
        },
      )

      // Hold the context open only when there is something after this raiser to hold it for. A
      // for-each-light iteration takes no hold: engines are keyed per iteration while a context
      // tracks a single node id, so its downstream nodes run on idle and lose per-light names.
      const holdsContext =
        iterIdx < 0 && (this.compiledCue.adjacency.get(raiserNode.id)?.length ?? 0) > 0

      // Frees the hold without stepping the graph forward, for a run being replaced rather than
      // finished. Mirrors the cancelled branch of onBlockingActionComplete.
      const release = (): void => {
        if (!holdsContext) return
        context.completeActionSilent(raiserNode.id)
        if (context.tryComplete()) {
          context.dispose()
        }
      }
      releaseWaiter = release

      // On idle: cleanup/persistent logic, then carry the raising context forward. Continuing only
      // on idle ensures delay-based stepping (e.g. Score 500ms yellow, 200ms blue) is observed.
      // Idle lands on a microtask, by which time a re-call arriving in the same pass as the beat
      // that finished the run can have retired this engine and tracked a replacement. Only the
      // tracked engine owns the slot and may darken the node, but a retired one still carries its
      // own context forward: that run did finish, and the replacement drives a different context.
      effectEngine.setOnIdle(() => {
        const tracked = this.activeEffectEngines.get(engineKey)?.engine === effectEngine
        if (tracked) {
          if (raiserNode.isPersistent) {
            this.debugLog(`Effect raiser ${raiserNode.id} persistent: re-triggering`)
            effectEngine.triggerEffect(context.cueData)
          } else {
            this.debugLog(`Effect raiser ${raiserNode.id} completed, removing from tracking`)
            this.activeEffectEngines.delete(engineKey)
          }
          this.emitNodeExecution('deactivated', raiserNode.id)
        }
        if (holdsContext) {
          // Routes through onNodeComplete -> onActionComplete: advance the phase, continue
          // downstream, complete the context. A later idle finds nothing registered.
          context.completeAction(raiserNode.id)
        } else if (tracked) {
          // A loop iteration holds nothing, so it continues on its own rather than through the
          // context. Nothing to continue for a raiser with no nodes after it.
          this.continueToNextNodes(raiserNode.id, context)
        }
      })

      if (holdsContext) {
        context.registerActiveAction(raiserNode.id, raiserNode)
      }
      this.activeEffectEngines.set(engineKey, { engine: effectEngine, releaseWaiter: release })

      effectEngine.triggerEffect(context.cueData)
      releaseInterrupted?.()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.emitRuntimeError(raiserNode.id, msg)
      log.error(`Error executing effect raiser node ${raiserNode.id}:`, error)
      releaseWaiter?.()
      releaseInterrupted?.()
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
      const context = new ExecutionContext(
        listenerNode,
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
      this.emitRuntimeError(listenerNode.id, msg)
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
    for (const raised of this.activeEffectEngines.values()) {
      raised.engine.cancelAll(skipEffectRemoval)
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
