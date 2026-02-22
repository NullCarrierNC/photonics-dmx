/**
 * Event-driven execution engine for node graphs.
 * Executes nodes sequentially, respecting blocking semantics.
 *
 * This module has been refactored for maintainability:
 * - dataExtractors.ts: CueData and config data extraction
 * - valueResolver.ts: ValueSource resolution and type inference
 * - logicNodeEvaluator.ts: Logic node evaluation (variable, math, conditional, loops)
 */

import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CueData } from '../../types/cueTypes'
import { CompiledYargCue, CompiledAudioCue } from '../compiler/NodeCueCompiler'
import {
  ActionEffectFactory,
  ResolvedActionTarget,
  ResolvedColorSetting,
  ResolvedActionTiming,
} from '../compiler/ActionEffectFactory'
import {
  ActionNode,
  BaseEventNode,
  EventRaiserNode,
  EventListenerNode,
  EffectRaiserNode,
  LogicNode,
  NodeActionConfig,
  VariableDefinition,
  ValueSource,
} from '../../types/nodeCueTypes'
import { TrackedLight } from '../../../types'
import { ExecutionContext } from './ExecutionContext'
import { ExecutionState, VariableValue } from './executionTypes'
import { EffectRegistry } from './EffectRegistry'
import { EffectExecutionEngine } from './EffectExecutionEngine'

// Import refactored modules
import { resolveValue, resolveLocationGroups, resolveLightTarget } from './valueResolver'
import { resolveActionTiming, resolveActionColor, resolveActionLayer } from './actionResolver'
import { evaluateLogicNode, LogicNodeEvaluatorContext } from './logicNodeEvaluator'
import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import { sendToAllWindows } from '../../../../main/utils/windowUtils'

type ChainStep = {
  action: ActionNode
  lights: TrackedLight[]
  lightIds: string
  resolvedLayer: number
  resolvedTiming: ResolvedActionTiming
  resolvedColor: ResolvedColorSetting
}

export class NodeExecutionEngine {
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
  private activeContexts: Map<string, ExecutionContext> = new Map()
  private sequencer: ILightingController
  private lightManager: DmxLightManager
  private cueLevelVarStore: Map<string, VariableValue>
  private groupLevelVarStore: Map<string, VariableValue>
  private variableDefinitions: VariableDefinition[]
  private eventListeners: Map<string, EventListenerNode[]> = new Map()
  private effectRegistry: EffectRegistry
  private activeEffectEngines: Map<string, EffectExecutionEngine> = new Map()
  /** Effect names and layers submitted via addEffect/addEffectWithCallback, for cancelAll to remove. */
  private submittedEffects: Map<string, number> = new Map()
  /** Node IDs that have emitted 'activated' but not yet 'deactivated', so cancelAll can flush them. */
  private pendingActivations: Set<string> = new Set()
  /**
   * Instance snapshot of env-based debug setting. Note that runtime toggles are handled via
   * the static global flag so existing engines can start logging immediately.
   */
  private debugEnabled: boolean

  constructor(
    compiledCue: CompiledYargCue | CompiledAudioCue,
    cueId: string,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    cueLevelVarStore: Map<string, VariableValue>,
    groupLevelVarStore: Map<string, VariableValue>,
    effectRegistry: EffectRegistry,
    variableDefinitions: VariableDefinition[] = [],
  ) {
    this.compiledCue = compiledCue
    this.cueId = cueId
    this.sequencer = sequencer
    this.lightManager = lightManager
    this.cueLevelVarStore = cueLevelVarStore
    this.groupLevelVarStore = groupLevelVarStore
    this.effectRegistry = effectRegistry
    this.variableDefinitions = variableDefinitions

    // Debug logging is opt-in to avoid noisy logs in normal operation.
    // Enable with either env var:
    // - PHOTONICS_NODE_CUE_DEBUG=1
    // - NODE_CUE_DEBUG=1
    this.debugEnabled =
      process?.env?.PHOTONICS_NODE_CUE_DEBUG === '1' || process?.env?.NODE_CUE_DEBUG === '1'

    // Register all event listeners during initialization
    this.registerEventListeners()
  }

  private debugLog(message: string, data?: unknown): void {
    // Allow enabling debug at runtime via NodeExecutionEngine.setDebugEnabled(...)
    if (!this.debugEnabled && !NodeExecutionEngine.globalDebugEnabled) return
    // Use console.log (not debug) so it shows up consistently in packaged builds.
    if (data === undefined) {
      console.log(`[NodeCue] ${this.cueId} ${message}`)
      return
    }

    console.log(`[NodeCue] ${this.cueId} ${message}`, this.debugPreview(data))
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
   * Resolve config values that may be ValueSource (e.g. startOffset for rotation).
   * Returns a copy of config with resolved numbers; non-ValueSource fields are passed through.
   */
  private resolveConfigValues(
    config: NodeActionConfig | undefined,
    context: ExecutionContext,
  ): NodeActionConfig | undefined {
    if (!config) return undefined
    const out: NodeActionConfig = { ...config }
    if (
      config.startOffset !== undefined &&
      typeof config.startOffset === 'object' &&
      config.startOffset !== null &&
      'source' in config.startOffset
    ) {
      const resolved = Number(
        resolveValue('number', config.startOffset, context, this.variableDefinitions),
      )
      out.startOffset = Math.max(0, resolved)
    }
    return out
  }

  /**
   * Register all event listeners from the compiled cue.
   */
  private registerEventListeners(): void {
    const { eventListenerMap } = this.compiledCue
    for (const listener of eventListenerMap.values()) {
      // Skip listeners with no event selected
      if (!listener.eventName) {
        continue
      }
      const listeners = this.eventListeners.get(listener.eventName) ?? []
      listeners.push(listener)
      this.eventListeners.set(listener.eventName, listeners)
    }
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
   */
  public startExecutionWithCallback(
    eventNode: BaseEventNode,
    parameters: CueData,
    onComplete?: () => void,
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
        this.activeContexts.delete(context.id)
        // Fire external completion callback if provided
        if (onComplete) {
          onComplete()
        }
      })

      this.activeContexts.set(context.id, context)

      // Get outgoing edges from event node and start execution
      const { adjacency } = this.compiledCue
      const outgoing = adjacency.get(eventNode.id) ?? []
      const nextNodes = outgoing.map((conn) => conn.to)

      if (nextNodes.length > 0) {
        this.continueExecution(nextNodes, context)
      } else {
        // No nodes to execute, context completes immediately
        context.dispose()
        this.activeContexts.delete(context.id)
        // Fire completion callback even for empty execution
        if (onComplete) {
          onComplete()
        }
      }
    } catch (error) {
      console.error(`Error starting execution for event ${eventNode.id}:`, error)
    }
  }

  private emitNodeExecution(type: 'activated' | 'deactivated', nodeId: string): void {
    if (type === 'activated') {
      this.pendingActivations.add(nodeId)
    } else {
      this.pendingActivations.delete(nodeId)
    }
    sendToAllWindows(RENDERER_RECEIVE.NODE_EXECUTION, {
      type,
      cueId: this.cueId,
      nodeId,
      timestamp: Date.now(),
    })
  }

  /**
   * Execute a single node within a context.
   * Dispatches to appropriate handler based on node type.
   */
  private executeNode(nodeId: string, context: ExecutionContext): void {
    const { actionMap, logicMap, eventRaiserMap, effectRaiserMap } = this.compiledCue

    // Prevent re-execution of any node within the same context (avoids infinite loops from cycles)
    // Exception: for-each-light is not marked visited when returning "each" so the loop can re-enter
    const logicNodeForVisit = logicMap.get(nodeId)
    const isForEachLight = logicNodeForVisit?.logicType === 'for-each-light'
    if (context.hasVisited(nodeId)) {
      this.debugLog(`skip visited nodeId=${nodeId} ctx=${context.id}`)
      return
    }

    if (!isForEachLight) {
      context.markVisited(nodeId)
    }
    this.emitNodeExecution('activated', nodeId)

    // Check if it's an action node
    const actionNode = actionMap.get(nodeId)
    if (actionNode) {
      this.debugLog(`exec action nodeId=${nodeId} ctx=${context.id}`, {
        effectType: actionNode.effectType,
        target: actionNode.target,
        color: actionNode.color,
        timing: actionNode.timing,
        layer: actionNode.layer,
      })
      this.executeActionNode(actionNode, context)
      return
    }

    // Check if it's a logic node
    const logicNode = logicMap.get(nodeId)
    if (logicNode) {
      const logicLog: Record<string, unknown> = {
        logicType: logicNode.logicType,
        nodeId,
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
      this.debugLog(`exec logic nodeId=${nodeId} ctx=${context.id}`, logicLog)
      this.executeLogicNode(logicNode, nodeId, context)
      return
    }

    // Check if it's an event raiser node
    const eventRaiserNode = eventRaiserMap.get(nodeId)
    if (eventRaiserNode) {
      this.debugLog(`exec event-raiser nodeId=${nodeId} ctx=${context.id}`, {
        eventName: eventRaiserNode.eventName,
      })
      this.executeEventRaiserNode(eventRaiserNode, context)
      return
    }

    // Check if it's an effect raiser node
    const effectRaiserNode = effectRaiserMap?.get(nodeId)
    if (effectRaiserNode) {
      this.debugLog(`exec effect-raiser nodeId=${nodeId} ctx=${context.id}`, {
        effectId: effectRaiserNode.effectId,
        parameterValues: effectRaiserNode.parameterValues,
      })
      this.executeEffectRaiserNode(effectRaiserNode, context)
      return
    }

    // Unknown node type - skip and continue
    console.warn(`Unknown node type for node ${nodeId}`)
    this.continueToNextNodes(nodeId, context)
  }

  /**
   * Execute an action node: create effect and submit to sequencer.
   * The action blocks further execution until it completes.
   */
  private executeActionNode(actionNode: ActionNode, context: ExecutionContext): void {
    try {
      // Handle blackout specially - it uses sequencer.blackout() directly
      if (actionNode.effectType === 'blackout') {
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
            console.error(`Error during blackout for action node ${actionNode.id}:`, error)
            // Continue execution despite error
            if (context.hasVisited(actionNode.id)) {
              this.emitNodeExecution('deactivated', actionNode.id)
              context.completeAction(actionNode.id)
            }
          })
        return
      }

      // Resolve target
      const resolvedTarget: ResolvedActionTarget = {
        groups: resolveLocationGroups(actionNode.target.groups, context),
        filter: resolveLightTarget(actionNode.target.filter, context),
      }

      const resolvedColor = resolveActionColor(actionNode.color, context)
      const resolvedTiming = resolveActionTiming(actionNode.timing, context)
      const resolvedLayer = resolveActionLayer(actionNode.layer, context)

      /**
       * Action chaining / pre-queueing
       * -----------------------------
       * When we have a simple linear chain of action nodes (action -> action -> ...),
       * we want those transitions to run back-to-back on the sequencer without the
       * layer being cleared between actions.
       *
       * If we wait for action A to fully complete before submitting action B, there can
       * be a visible "flash" of lower layers between them (e.g. base blue showing between
       * red and yellow). By submitting action B while action A is still active, the
       * sequencer queues it and preserves layer state, allowing smooth fades.
       */
      const buildActionChain = (): ActionNode[] => {
        const { adjacency, actionMap } = this.compiledCue
        const chain: ActionNode[] = [actionNode]
        const visitedInChain = new Set<string>([actionNode.id])

        let currentId = actionNode.id
        // Only follow the chain when there's exactly one outgoing edge
        // and it leads to another action node.
        while (true) {
          const outgoing = adjacency.get(currentId) ?? []
          if (outgoing.length !== 1) break
          const nextId = outgoing[0].to
          const nextAction = actionMap.get(nextId)
          if (!nextAction) break
          if (visitedInChain.has(nextId)) break

          chain.push(nextAction)
          visitedInChain.add(nextId)
          currentId = nextId
        }

        return chain
      }

      const actionChain = buildActionChain()

      const resolvedConfig = this.resolveConfigValues(actionNode.config, context)

      const resolvedAction = {
        ...actionNode,
        target: resolvedTarget,
        color: resolvedColor,
        timing: resolvedTiming,
        layer: resolvedLayer,
        config: resolvedConfig,
      } as ActionNode & {
        target: ResolvedActionTarget
        color: ResolvedColorSetting
        timing: ResolvedActionTiming
        layer: number
        config?: NodeActionConfig
      }

      const lights = ActionEffectFactory.resolveLights(
        this.lightManager,
        actionNode.target, // Pass the ORIGINAL target with ValueSource intact
        (varName: string) => {
          const cueVar = context.cueLevelVarStore.get(varName)
          const groupVar = context.groupLevelVarStore.get(varName)
          return cueVar ?? groupVar
        },
      )

      // Log resolved lights + any variable target
      if (actionNode.target?.groups?.source === 'variable') {
        const varName = actionNode.target.groups.name
        this.debugLog(`action target groups from var=$${varName} ctx=${context.id}`, {
          varValue: this.getVariableValue(varName, context),
          resolvedLightsCount: lights?.length ?? 0,
          resolvedLights: (lights ?? []).map((l) => ({ id: l.id, position: l.position })),
        })
      } else {
        this.debugLog(`action resolved lights ctx=${context.id}`, {
          resolvedLightsCount: lights?.length ?? 0,
          resolvedLights: (lights ?? []).map((l) => ({ id: l.id, position: l.position })),
        })
      }

      if (!lights || lights.length === 0) {
        // No lights to target, continue immediately
        this.debugLog(`action skipped (no lights) nodeId=${actionNode.id} ctx=${context.id}`)
        this.continueToNextNodes(actionNode.id, context)
        return
      }

      const getVar = (varName: string) => {
        const cueVar = context.cueLevelVarStore.get(varName)
        const groupVar = context.groupLevelVarStore.get(varName)
        return cueVar ?? groupVar
      }
      let patternBLights: TrackedLight[] | undefined
      if (actionNode.effectType === 'alternating-pattern' && actionNode.config?.patternBTarget) {
        patternBLights =
          ActionEffectFactory.resolveLights(
            this.lightManager,
            actionNode.config.patternBTarget,
            getVar,
          ) ?? []
      }

      const submitSingleAction = (): void => {
        const effect = ActionEffectFactory.buildEffect({
          action: resolvedAction,
          lights,
          waitCondition: undefined,
          waitTime: 0,
          resolvedTarget,
          resolvedColor,
          resolvedTiming,
          resolvedLayer,
          patternBLights,
        })

        if (!effect) {
          // Failed to build effect, continue immediately
          this.continueToNextNodes(actionNode.id, context)
          return
        }

        // Stable effect name so repeated submissions (e.g. cue-called) queue in the sequencer
        const effectName = `${this.cueId}:${actionNode.id}`

        this.debugLog(`submit effect nodeId=${actionNode.id} ctx=${context.id}`, {
          effectName,
          layer: resolvedLayer,
          timing: resolvedTiming,
          color: resolvedColor,
        })

        const shouldBlock = resolvedTiming.waitUntilCondition !== 'none'

        if (shouldBlock) {
          context.registerActiveAction(actionNode.id, actionNode)
          const callback = (): void => {
            this.submittedEffects.delete(effectName)
            this.emitNodeExecution('deactivated', actionNode.id)
            context.completeAction(actionNode.id)
          }
          this.submittedEffects.set(effectName, resolvedLayer)
          this.sequencer.addEffectWithCallback(effectName, effect, callback)
        } else {
          this.submittedEffects.set(effectName, resolvedLayer)
          this.sequencer.addEffect(effectName, effect)
          this.emitNodeExecution('deactivated', actionNode.id)
          this.continueToNextNodes(actionNode.id, context)
        }
      }

      // If we're not actually chaining anything, fall back to single-action behavior.
      if (actionChain.length === 1) {
        submitSingleAction()
        return
      }

      const resolveChainStep = (a: ActionNode): ChainStep | null => {
        if (
          a.effectType === 'blackout' ||
          a.effectType === 'chase' ||
          a.effectType === 'sweep' ||
          a.effectType === 'rotation' ||
          a.effectType === 'flash' ||
          a.effectType === 'cycle' ||
          a.effectType === 'dual-mode-rotation' ||
          a.effectType === 'alternating-pattern'
        ) {
          return null
        }

        const layerNum = resolveActionLayer(a.layer, context)
        const rc = resolveActionColor(a.color, context)
        const rtiming = resolveActionTiming(a.timing, context)

        const chainLights = ActionEffectFactory.resolveLights(
          this.lightManager,
          a.target,
          (varName: string) => {
            const cueVar = context.cueLevelVarStore.get(varName)
            const groupVar = context.groupLevelVarStore.get(varName)
            return cueVar ?? groupVar
          },
        )

        if (!chainLights || chainLights.length === 0) {
          return null
        }

        const lightIds = chainLights.map((light) => light.id).join(',')
        return {
          action: a,
          lights: chainLights,
          lightIds,
          resolvedLayer: layerNum,
          resolvedTiming: rtiming,
          resolvedColor: rc,
        }
      }

      const chainData = (() => {
        const steps: ChainStep[] = []
        let baseLayer: number | null = null
        let baseLightIds: string | null = null

        for (const stepAction of actionChain) {
          const step = resolveChainStep(stepAction)
          if (!step) {
            return null
          }
          if (baseLayer === null) {
            baseLayer = step.resolvedLayer
            baseLightIds = step.lightIds
          } else if (baseLayer !== step.resolvedLayer || baseLightIds !== step.lightIds) {
            return null
          }
          steps.push(step)
        }

        return { steps, baseLayer: baseLayer ?? 0, baseLights: steps[0]?.lights ?? [] }
      })()

      if (!chainData) {
        submitSingleAction()
        return
      }

      const chainEffectName = `${this.cueId}:chain:${actionChain[0].id}`
      this.debugLog(`submit action-chain ctx=${context.id}`, {
        effectName: chainEffectName,
        layer: chainData.baseLayer,
        actions: actionChain.map((a) => ({ id: a.id, effectType: a.effectType })),
      })

      // Ensure the rest of the chain nodes won't execute independently later.
      for (let i = 1; i < actionChain.length; i++) {
        context.markVisited(actionChain[i].id)
        this.emitNodeExecution('activated', actionChain[i].id)
      }

      const composedEffect = ActionEffectFactory.buildEffectChain(
        chainData.steps.map((step) => ({
          action: step.action,
          lights: chainData.baseLights,
          resolvedColor: step.resolvedColor,
          resolvedTiming: step.resolvedTiming,
          resolvedLayer: chainData.baseLayer,
          intensityScale: 1,
        })),
      )

      if (!composedEffect) {
        submitSingleAction()
        return
      }

      this.debugLog(`submit composed action-chain ctx=${context.id}`, {
        effectName: chainEffectName,
        layer: chainData.baseLayer,
        transitions: composedEffect.transitions.map((t) => ({
          waitForCondition: t.waitForCondition,
          waitForTime: t.waitForTime,
          duration: t.transform.duration,
          waitUntilCondition: t.waitUntilCondition,
          waitUntilTime: t.waitUntilTime,
        })),
      })

      const chainHasBlockingStep = chainData.steps.some(
        (step) => step.resolvedTiming.waitUntilCondition !== 'none',
      )
      const lastChainNode = actionChain[actionChain.length - 1]

      if (chainHasBlockingStep) {
        context.registerActiveAction(lastChainNode.id, lastChainNode)
        const callback = (): void => {
          this.submittedEffects.delete(chainEffectName)
          for (const a of actionChain) {
            this.emitNodeExecution('deactivated', a.id)
          }
          context.completeAction(lastChainNode.id)
        }
        this.submittedEffects.set(chainEffectName, chainData.baseLayer)
        this.sequencer.addEffectWithCallback(chainEffectName, composedEffect, callback)
      } else {
        this.submittedEffects.set(chainEffectName, chainData.baseLayer)
        this.sequencer.addEffect(chainEffectName, composedEffect)
        for (const a of actionChain) {
          this.emitNodeExecution('deactivated', a.id)
        }
        this.continueToNextNodes(lastChainNode.id, context)
      }
    } catch (error) {
      console.error(`Error executing action node ${actionNode.id}:`, error)
      // Continue execution despite error
      this.continueToNextNodes(actionNode.id, context)
    }
  }

  /**
   * Execute a logic node: evaluate at runtime and continue to next nodes.
   * Logic nodes don't block - they execute immediately.
   * Exception: Delay nodes block execution for the specified delay time.
   */
  private executeLogicNode(logicNode: LogicNode, nodeId: string, context: ExecutionContext): void {
    try {
      // Handle delay nodes specially - they block execution
      if (logicNode.logicType === 'delay') {
        this.executeDelayNode(logicNode, nodeId, context)
        return
      }

      const { adjacency } = this.compiledCue
      const edges = adjacency.get(nodeId) ?? []

      const evaluatorContext: LogicNodeEvaluatorContext = {
        cueId: this.cueId,
        lightManager: this.lightManager,
        cueLevelVarStore: this.cueLevelVarStore,
        groupLevelVarStore: this.groupLevelVarStore,
        variableDefinitions: this.variableDefinitions,
        executeNode: (nextNodeId: string, ctx: ExecutionContext) =>
          this.executeNode(nextNodeId, ctx),
        debugOutput: sendToAllWindows,
      }

      const nextNodes = evaluateLogicNode(logicNode, nodeId, edges, context, evaluatorContext)

      // for-each-light: only mark visited when we took the "done" branch (state cleared), so loop can re-enter
      if (
        logicNode.logicType === 'for-each-light' &&
        context.getForEachLightState(nodeId) === undefined
      ) {
        context.markVisited(nodeId)
      } else if (logicNode.logicType !== 'for-each-light') {
        context.markVisited(nodeId)
      }

      // Logic nodes execute immediately - continue to next nodes without waiting
      if (nextNodes.length > 0) {
        this.continueExecution(nextNodes, context)
      } else {
        // No more nodes, check if context is complete
        if (context.tryComplete()) {
          context.dispose()
        }
      }
      this.emitNodeExecution('deactivated', nodeId)
    } catch (error) {
      console.error(`Error executing logic node ${nodeId}:`, error)
      this.emitNodeExecution('deactivated', nodeId)
      // Continue to all outgoing edges despite error
      this.continueToNextNodes(nodeId, context)
    }
  }

  /**
   * Execute a delay node: wait for the specified delay time before continuing.
   * Delay nodes block execution like action nodes.
   */
  private executeDelayNode(
    delayNode: LogicNode & { logicType: 'delay'; delayTime: ValueSource },
    nodeId: string,
    context: ExecutionContext,
  ): void {
    try {
      // Resolve delay time from ValueSource
      const delayMs = Number(resolveValue('number', delayNode.delayTime, context))
      const actualDelay = Math.max(0, delayMs) // Ensure non-negative

      this.debugLog(`exec delay nodeId=${nodeId} ctx=${context.id}`, { delayMs: actualDelay })

      // Register as active to block execution
      // We use a dummy action node structure for compatibility with ExecutionContext
      const dummyAction: ActionNode = {
        id: nodeId,
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'literal', value: 'blue' },
          brightness: { source: 'literal', value: 'medium' },
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }
      context.registerActiveAction(nodeId, dummyAction)

      const timerId = setTimeout(() => {
        context.removeTimer(timerId)
        if (context.hasVisited(nodeId)) {
          this.debugLog(`delay complete nodeId=${nodeId} ctx=${context.id}`)
          this.emitNodeExecution('deactivated', nodeId)
          context.completeAction(nodeId)
        }
      }, actualDelay)
      context.addTimer(timerId)
    } catch (error) {
      console.error(`Error executing delay node ${nodeId}:`, error)
      // Continue to all outgoing edges despite error
      this.continueToNextNodes(nodeId, context)
    }
  }

  /**
   * Execute an event raiser node: raise the event and continue immediately (non-blocking).
   */
  private executeEventRaiserNode(raiserNode: EventRaiserNode, context: ExecutionContext): void {
    try {
      const { eventName } = raiserNode

      // Skip if no event selected
      if (!eventName) {
        console.warn(`Event raiser ${raiserNode.id} has no event selected, skipping`)
        this.continueToNextNodes(raiserNode.id, context)
        return
      }

      // Fire all registered listeners for this event
      const listeners = this.eventListeners.get(eventName) ?? []
      for (const listener of listeners) {
        // Create new execution context for each listener, passing cue data
        this.startListenerExecution(listener, context.cueData as CueData)
      }

      this.emitNodeExecution('deactivated', raiserNode.id)
      // Continue immediately to raiser's child (non-blocking)
      this.continueToNextNodes(raiserNode.id, context)
    } catch (error) {
      console.error(`Error executing event raiser node ${raiserNode.id}:`, error)
      // Continue execution despite error
      this.continueToNextNodes(raiserNode.id, context)
    }
  }

  /**
   * Execute an effect raiser node: trigger effect and block re-triggering until it completes.
   */
  private executeEffectRaiserNode(raiserNode: EffectRaiserNode, context: ExecutionContext): void {
    try {
      const { effectId } = raiserNode

      // Skip if no effect selected
      if (!effectId) {
        console.warn(`Effect raiser ${raiserNode.id} has no effect selected, skipping`)
        this.continueToNextNodes(raiserNode.id, context)
        return
      }

      // Check if this effect raiser already has an active execution
      const existingEngine = this.activeEffectEngines.get(raiserNode.id)
      if (existingEngine) {
        // If the existing engine still has active contexts, block re-triggering
        if (existingEngine.hasActiveContexts()) {
          this.debugLog(`Effect raiser ${raiserNode.id} blocked: effect still running`)
          // Continue to next nodes (don't block the cue execution, just skip this trigger)
          this.continueToNextNodes(raiserNode.id, context)
          return
        } else {
          // Engine exists but no active contexts - clean it up and allow new trigger
          this.debugLog(`Effect raiser ${raiserNode.id} cleaning up completed engine`)
          this.activeEffectEngines.delete(raiserNode.id)
        }
      }

      // Look up effect from registry
      const compiledEffect = this.effectRegistry.getEffect(effectId)

      if (!compiledEffect) {
        // Gracefully handle missing effect (may have been deleted)
        console.warn(
          `Effect ${effectId} not found (missing dependency), skipping effect raiser ${raiserNode.id}`,
        )
        this.emitNodeExecution('deactivated', raiserNode.id)
        this.continueToNextNodes(raiserNode.id, context)
        return
      }

      // Resolve parameter values
      const paramValues: Record<string, string | number | boolean | TrackedLight[]> = {}
      for (const [paramName, valueSource] of Object.entries(raiserNode.parameterValues ?? {})) {
        // Get parameter type from effect definition
        const paramDef = compiledEffect.parameters.get(paramName)
        const expectedType = paramDef?.type ?? 'number' // Default to number if not found
        paramValues[paramName] = resolveValue(expectedType, valueSource, context)
      }

      // Create effect execution engine
      const effectEngine = new EffectExecutionEngine(
        compiledEffect,
        this.sequencer,
        this.lightManager,
        paramValues,
        context.cueData, // Pass caller's cue data
      )

      // Set up completion callback to remove from tracking when effect becomes idle
      effectEngine.setOnIdle(() => {
        this.debugLog(`Effect raiser ${raiserNode.id} completed, removing from tracking`)
        this.activeEffectEngines.delete(raiserNode.id)
      })

      // Store the engine in active tracking
      this.activeEffectEngines.set(raiserNode.id, effectEngine)

      // Trigger effect (blocking for this raiser node, but non-blocking for cue execution)
      effectEngine.triggerEffect(context.cueData)

      this.emitNodeExecution('deactivated', raiserNode.id)
      // Continue immediately (non-blocking like EventRaiserNode)
      this.continueToNextNodes(raiserNode.id, context)
    } catch (error) {
      console.error(`Error executing effect raiser node ${raiserNode.id}:`, error)
      this.emitNodeExecution('deactivated', raiserNode.id)
      // Continue execution despite error
      this.continueToNextNodes(raiserNode.id, context)
    }
  }

  /**
   * Start execution from a listener node.
   * Creates a new execution context for the listener chain.
   */
  private startListenerExecution(listenerNode: EventListenerNode, cueData: CueData): void {
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
        this.activeContexts.delete(context.id)
      })

      this.activeContexts.set(context.id, context)

      // Get listener's outgoing edges and start execution
      const { adjacency } = this.compiledCue
      const outgoing = adjacency.get(listenerNode.id) ?? []
      const nextNodes = outgoing.map((conn) => conn.to)

      if (nextNodes.length > 0) {
        this.continueExecution(nextNodes, context)
      } else {
        // No child nodes, context completes immediately
        context.dispose()
        this.activeContexts.delete(context.id)
      }
    } catch (error) {
      console.error(`Error starting listener execution for ${listenerNode.id}:`, error)
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

    context.advancePhase()
    // Continue to next nodes after this action
    this.continueToNextNodes(nodeId, context)

    // Check if context is now complete
    if (context.tryComplete()) {
      context.dispose()
    }
  }

  /**
   * Get the next nodes after the current node and continue execution.
   */
  private continueToNextNodes(nodeId: string, context: ExecutionContext): void {
    const { adjacency } = this.compiledCue
    const outgoing = adjacency.get(nodeId) ?? []
    const nextNodes = outgoing.map((conn) => conn.to)

    if (nextNodes.length > 0) {
      this.continueExecution(nextNodes, context)
    } else {
      // No more nodes, check if context is complete
      if (context.tryComplete()) {
        context.dispose()
      }
    }
  }

  /**
   * Continue execution to the next nodes.
   */
  private continueExecution(nodeIds: string[], context: ExecutionContext): void {
    for (const nodeId of nodeIds) {
      this.executeNode(nodeId, context)
    }
  }

  /**
   * Cancel all active executions (called on cue stop).
   */
  public cancelAll(): void {
    for (const nodeId of this.pendingActivations) {
      sendToAllWindows(RENDERER_RECEIVE.NODE_EXECUTION, {
        type: 'deactivated',
        cueId: this.cueId,
        nodeId,
        timestamp: Date.now(),
      })
    }
    this.pendingActivations.clear()

    for (const context of this.activeContexts.values()) {
      context.dispose()
    }
    this.activeContexts.clear()

    // Remove all submitted effects from the sequencer so lights stop immediately
    for (const [name, layer] of this.submittedEffects) {
      this.sequencer.removeEffect(name, layer)
    }
    this.submittedEffects.clear()

    // Cancel all active effect engines
    for (const effectEngine of this.activeEffectEngines.values()) {
      effectEngine.cancelAll()
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
