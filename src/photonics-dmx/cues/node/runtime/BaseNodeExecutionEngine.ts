/**
 * Shared base for the two node-graph execution engines (NodeExecutionEngine for cues,
 * EffectExecutionEngine for effects). Holds the logic that is identical between them and
 * exposes protected template-method hooks for the genuine behavioral differences:
 *
 * - variable-store model (cue+group stores vs effect-local store) — `getVarStore` / `lookupVar`
 * - re-entry semantics (strict vs relaxed) — `revisitPolicy` / `shouldSkipVisited`
 * - effect naming (`cueId:nodeId` vs `effect_<defId>_<instanceId>_<nodeId>`) — `buildEffectName`,
 *   and action-chain naming (cue inserts `:chain:`) — `buildChainEffectName`
 * - blackout dispatch (cue-only, uses sequencer.blackout()) — `handleBlackoutAction`
 * - motion-pattern dispatch (cue submits a pattern; effect warns + skips) — `handleMotionPatternAction`
 * - blocking-action completion bookkeeping — `onBlockingActionComplete`
 * - pending-callback-effect tracking for isBusy() (effect-only) — `markPendingCallbackEffect`/`clearPendingCallbackEffect`
 * - idle vs context-lifecycle callbacks — `continueOrComplete`/`onContextCancelled`/`onCancelFinish`
 * - effect-raiser dispatch (cue-only) — `dispatchSpecialNode`
 * - debug logging (cue-only) — `debugLog`
 *
 * The shared `executeActionNode` dispatcher lives here; the genuine per-engine differences are
 * routed through the hooks above.
 */

import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import {
  ActionNode,
  EventRaiserNode,
  EventListenerNode,
  LogicNode,
  ValueSource,
  VariableDefinition,
} from '../../types/nodeCueTypes'
import type { Connection } from '../../types/nodeCueTypes'
import type { CueData } from '../../types/cueTypes'
import type { AudioCueData } from '../../types/audioCueTypes'
import type { TrackedLight } from '../../../types'
import { ExecutionContext } from './ExecutionContext'
import { NodeRuntimeCallbacks, VariableValue } from './executionTypes'
import {
  ActionEffectFactory,
  ResolvedActionTarget,
  ResolvedColorSetting,
  ResolvedActionTiming,
  ResolvedPositionSetting,
  buildSetPositionSubmissionFingerprint,
} from '../compiler/ActionEffectFactory'
import { RevisitPolicy } from './GraphExecutionPolicy'
import {
  resolveValue,
  getVariableStore,
  resolveLocationGroups,
  resolveLightTarget,
} from './valueResolver'
import {
  resolveActionColor,
  resolveActionTiming,
  resolveActionLayer,
  resolveActionPosition,
} from './actionResolver'
import { evaluateLogicNode, LogicNodeEvaluatorContext } from './logicNodeEvaluator'
import { collectReachableNodes } from './engineUtils'
import {
  runContextBatch,
  buildActionChain,
  markConsecutiveActionChainTailVisited,
  mapSetColorChainStepsForEffectFactory,
  resolveChainStep,
  tryBuildHomogeneousSetColorChainData,
} from './graphActionHelpers'
import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('NodeExecutionEngine')

/**
 * Narrow structural view over the fields both `CompiledNodeCue` and `CompiledEffect`
 * expose. The base engine depends only on this; subclasses supply their concrete
 * compiled object through the `compiled` getter.
 */
export interface CompiledGraph {
  definition: { id: string }
  actionMap: Map<string, ActionNode>
  logicMap: Map<string, LogicNode>
  eventRaiserMap: Map<string, EventRaiserNode>
  eventListenerMap: Map<string, EventListenerNode>
  adjacency: Map<string, Connection[]>
}

/** Constructor dependencies shared by both engines. */
export interface BaseEngineDeps {
  sequencer: ILightingController
  lightManager: DmxLightManager
  broadcaster: RuntimeBroadcaster
  variableDefinitions: VariableDefinition[]
  firstSubmissionUsesSetEffectRef?: { use: boolean }
  runtimeCallbacks?: NodeRuntimeCallbacks
  consumeInitialClearPolicy?: () => boolean
}

export abstract class BaseNodeExecutionEngine {
  protected activeContexts: Map<string, ExecutionContext> = new Map()
  protected readonly sequencer: ILightingController
  protected readonly lightManager: DmxLightManager
  protected readonly broadcaster: RuntimeBroadcaster
  protected variableDefinitions: VariableDefinition[]
  /** Effect names and layers submitted via addEffect/addEffectUnblockedNameWithCallback, for cancelAll to remove. */
  protected submittedEffects: Map<string, number> = new Map()
  /** motion-pattern effect names for cancelAll → removeMotionPattern. */
  protected submittedMotionPatterns: Set<string> = new Set()
  /** Last submitted set-position payload per effect name (idempotency after transition ends). */
  protected setPositionSubmissionFingerprint: Map<string, string> = new Map()
  protected eventListeners: Map<string, EventListenerNode[]> = new Map()
  /** When .use is true, the next effect submission must use setEffect (then set .use = false). */
  protected firstSubmissionUsesSetEffectRef?: { use: boolean }
  /** Source of the "first submission uses setEffect" decision when set (CueSession supplies it via GraphExecutionEngine); used in place of {@link firstSubmissionUsesSetEffectRef}. */
  protected readonly consumeInitialClearPolicy?: () => boolean
  protected readonly runtimeCallbacks?: NodeRuntimeCallbacks

  constructor(deps: BaseEngineDeps) {
    this.sequencer = deps.sequencer
    this.lightManager = deps.lightManager
    this.broadcaster = deps.broadcaster
    this.variableDefinitions = deps.variableDefinitions
    this.firstSubmissionUsesSetEffectRef = deps.firstSubmissionUsesSetEffectRef
    this.runtimeCallbacks = deps.runtimeCallbacks
    this.consumeInitialClearPolicy = deps.consumeInitialClearPolicy
  }

  // --- Abstract / overridable hooks for the genuine differences ---------------

  /** The concrete compiled graph (cue or effect), viewed structurally. */
  protected abstract get compiled(): CompiledGraph

  /** Re-entry policy: 'strict' (cues) skips any visited node; 'relaxed' (effects) lets actions/event-raisers re-enter. */
  protected abstract get revisitPolicy(): RevisitPolicy

  /** cueId used in NODE_EXECUTION payloads (cue: the cueId; effect: the effect definition id). */
  protected abstract getEmitCueId(): string

  /** Track activated/deactivated node ids (cue overrides to flush on cancel; effect no-op). */
  protected trackActivation(_type: 'activated' | 'deactivated', _nodeId: string): void {
    // default: no tracking
  }

  /** Opt-in debug logging (cue overrides with real logging; effect no-op). */
  protected debugLog(_message: string, _data?: unknown): void {
    // default: no-op
  }

  /** Options passed to runContextBatch (cue wires the 'blocked' lifecycle; effect wires per-node error reporting). */
  protected batchOptions(_context: ExecutionContext): {
    onBlocked?: () => void
    onNodeError?: (nodeId: string, error: unknown) => void
  } {
    return {}
  }

  /**
   * After a node has no more downstream targets to run. Default (cue): complete the
   * context if idle. Effect overrides to always re-enter continueExecution so the batch
   * wrapper handles completion.
   */
  protected continueOrComplete(targets: string[], context: ExecutionContext): void {
    if (targets.length > 0) {
      this.continueExecution(targets, context)
    } else if (context.tryComplete()) {
      context.dispose()
    }
  }

  // --- Shared logic -----------------------------------------------------------

  /** Returns whether the next effect submission should use setEffect, and consumes the policy. */
  protected getAndConsumeInitialClearPolicy(): boolean {
    if (this.consumeInitialClearPolicy) {
      return this.consumeInitialClearPolicy()
    }
    const v = this.firstSubmissionUsesSetEffectRef?.use === true
    if (this.firstSubmissionUsesSetEffectRef) {
      this.firstSubmissionUsesSetEffectRef.use = false
    }
    return v
  }

  /**
   * Whether an action with this timing should block downstream graph execution until the
   * effect completes. A `waitForCondition` gates the START of the transition and a
   * `waitUntilCondition` gates its COMPLETION; either means downstream nodes must wait for
   * the gated effect to finish (the completion callback fires only after waitFor + duration
   * + waitUntil have all elapsed).
   */
  protected isBlockingTiming(timing: ResolvedActionTiming): boolean {
    return timing.waitUntilCondition !== 'none' || timing.waitForCondition !== 'none'
  }

  protected runtimeEmit(channel: string, payload: unknown): void {
    if (this.runtimeCallbacks) {
      this.runtimeCallbacks.emit(channel, payload)
    } else {
      this.broadcaster.emit(channel, payload)
    }
  }

  protected emitNodeExecution(type: 'activated' | 'deactivated', nodeId: string): void {
    this.trackActivation(type, nodeId)
    this.runtimeEmit(RENDERER_RECEIVE.NODE_EXECUTION, {
      type,
      cueId: this.getEmitCueId(),
      nodeId,
      timestamp: Date.now(),
    })
  }

  /** Register all event listeners from the compiled graph into the listener index. */
  protected registerEventListeners(): void {
    const { eventListenerMap } = this.compiled
    for (const listener of eventListenerMap.values()) {
      if (!listener.eventName) {
        continue
      }
      const listeners = this.eventListeners.get(listener.eventName) ?? []
      listeners.push(listener)
      this.eventListeners.set(listener.eventName, listeners)
    }
  }

  /** Decide whether to skip a node that has already been visited in this context. */
  protected shouldSkipVisited(nodeId: string, context: ExecutionContext): boolean {
    if (!context.hasVisited(nodeId)) return false
    if (this.revisitPolicy === 'strict') return true
    // relaxed: actions and event-raisers may re-enter (blocking handles flow); others skip
    const isAction = this.compiled.actionMap.has(nodeId)
    const isEventRaiser = this.compiled.eventRaiserMap.has(nodeId)
    return !(isAction || isEventRaiser)
  }

  /**
   * Collect all node IDs reachable from startNodeIds, excluding excludeNodeId.
   * Delegates to shared engineUtils for de-duplication.
   */
  protected collectReachableNodes(
    adjacency: Map<string, Connection[]>,
    startNodeIds: string[],
    excludeNodeId: string,
  ): Set<string> {
    return collectReachableNodes(adjacency, startNodeIds, excludeNodeId)
  }

  /**
   * Continue execution to the next nodes.
   *
   * Wraps the dispatch loop with beginBatch/endBatch so that a dead-end branch
   * encountered partway through the batch cannot prematurely dispose the context
   * before sibling branches have had a chance to register blocking nodes (e.g. delays).
   */
  protected continueExecution(nodeIds: string[], context: ExecutionContext): void {
    runContextBatch(
      context,
      nodeIds,
      (nodeId) => this.executeNode(nodeId, context),
      this.batchOptions(context),
    )
  }

  /** Get the next nodes after the current node and continue execution. */
  protected continueToNextNodes(nodeId: string, context: ExecutionContext): void {
    const { adjacency } = this.compiled
    const outgoing = adjacency.get(nodeId) ?? []
    const nextNodes = outgoing.map((conn) => conn.to)
    this.continueOrComplete(nextNodes, context)
  }

  /**
   * Execute a single node within a context. Dispatches by node type, honoring the
   * re-entry policy. Type-specific execution is implemented by subclasses.
   */
  protected executeNode(nodeId: string, context: ExecutionContext): void {
    if (this.shouldSkipVisited(nodeId, context)) {
      this.debugLog(`skip visited nodeId=${nodeId} ctx=${context.id}`)
      return
    }
    context.markVisited(nodeId)
    this.emitNodeExecution('activated', nodeId)

    const actionNode = this.compiled.actionMap.get(nodeId)
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

    const logicNode = this.compiled.logicMap.get(nodeId)
    if (logicNode) {
      this.logLogicNode(logicNode, context)
      this.executeLogicNode(logicNode, context)
      return
    }

    const eventRaiserNode = this.compiled.eventRaiserMap.get(nodeId)
    if (eventRaiserNode) {
      this.debugLog(`exec event-raiser nodeId=${nodeId} ctx=${context.id}`, {
        eventName: eventRaiserNode.eventName,
      })
      this.executeEventRaiserNode(eventRaiserNode, context)
      return
    }

    // Engine-specific node kinds (cue: effect-raiser; effect: event-listener).
    if (this.dispatchSpecialNode(nodeId, context)) {
      return
    }

    // Unknown node type - skip and continue (cue) or drop (effect).
    log.warn(`Unknown node type for node ${nodeId}`)
    this.onUnknownNode(nodeId, context)
  }

  /** Optional rich debug logging for a logic node before it executes (cue overrides). */
  protected logLogicNode(_logicNode: LogicNode, _context: ExecutionContext): void {
    // default: no-op
  }

  /**
   * Dispatch engine-specific node kinds not handled by the shared dispatcher.
   * Returns true if the node was handled. Cue: effect-raiser. Effect: event-listener (no-op).
   */
  protected dispatchSpecialNode(_nodeId: string, _context: ExecutionContext): boolean {
    return false
  }

  /** Handle an unknown node after the warning (cue continues to next nodes; effect drops). */
  protected onUnknownNode(_nodeId: string, _context: ExecutionContext): void {
    // default: no-op
  }

  /**
   * Complete a blocking action/delay. Default (cue): completeAction lets the context's
   * onNodeComplete callback advance the phase and continue. Effect overrides to advance
   * and continue inline (its contexts have no onNodeComplete callback).
   */
  protected onBlockingActionComplete(nodeId: string, context: ExecutionContext): void {
    context.completeAction(nodeId)
  }

  /**
   * Build the stable effect name for an action submission.
   * Cue: `${cueId}:${nodeId}`; effect: `effect_${defId}_${instanceId}_${nodeId}`.
   * Inside a for-each-light loop (`iterationIndex >= 0`) the index is appended for unique per-light names.
   */
  protected abstract buildEffectName(actionNodeId: string, iterationIndex?: number): string

  /**
   * Build the stable effect name for a composed action-chain submission.
   * Cue inserts a `:chain:` infix off the first node id; effect uses a `_chain_` infix. Default
   * delegates to {@link buildEffectName} (kept overridable so subclasses control the infix).
   */
  protected buildChainEffectName(firstActionNodeId: string, iterationIndex?: number): string {
    return this.buildEffectName(firstActionNodeId, iterationIndex)
  }

  /**
   * Handle a blackout action (cue-only: uses sequencer.blackout() directly). Returns true when
   * handled so the shared dispatcher returns early. Default (effect): not handled.
   */
  protected handleBlackoutAction(_actionNode: ActionNode, _context: ExecutionContext): boolean {
    return false
  }

  /**
   * Handle a motion-pattern action. Cue submits/updates a motion pattern on the sequencer;
   * effect logs a warning and skips. Returns true when handled so the shared dispatcher returns early.
   */
  protected abstract handleMotionPatternAction(
    actionNode: ActionNode,
    context: ExecutionContext,
  ): boolean

  /**
   * Track an effect name submitted with a completion callback so isBusy() can report pending work.
   * Effect-only; cue is a no-op.
   */
  protected markPendingCallbackEffect(_effectName: string): void {
    // default: no-op
  }

  /** Clear a tracked pending-callback effect (see {@link markPendingCallbackEffect}). Effect-only. */
  protected clearPendingCallbackEffect(_effectName: string): void {
    // default: no-op
  }

  /** Look up a variable in the context's stores (cue: cue-level then group-level; effect: both are the parameter store). */
  protected lookupVar(varName: string, context: ExecutionContext): VariableValue | undefined {
    return context.cueLevelVarStore.get(varName) ?? context.groupLevelVarStore.get(varName)
  }

  /**
   * Execute a delay node: block until the delay elapses, then complete like a blocking action.
   */
  protected executeDelayNode(
    delayNode: LogicNode & { logicType: 'delay'; delayTime: ValueSource },
    context: ExecutionContext,
  ): void {
    const nodeId = delayNode.id
    try {
      const delayMs = Number(resolveValue('number', delayNode.delayTime, context))
      const actualDelay = Math.max(0, delayMs) // Ensure non-negative

      this.debugLog(`exec delay nodeId=${nodeId} ctx=${context.id}`, { delayMs: actualDelay })

      // Register as active to block execution. A dummy action node satisfies ExecutionContext.
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
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 0 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }
      context.registerActiveAction(nodeId, dummyAction)

      const timerId = setTimeout(() => {
        context.removeTimer(timerId)
        // Guard on isActionActive: other blocking nodes (e.g. from a for-each-light body)
        // can advance the execution phase while the delay waits.
        if (context.isActionActive(nodeId)) {
          this.debugLog(`delay complete nodeId=${nodeId} ctx=${context.id}`)
          this.emitNodeExecution('deactivated', nodeId)
          this.onBlockingActionComplete(nodeId, context)
        }
      }, actualDelay)
      context.addTimer(timerId)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${nodeId}: ${msg}`)
      log.error(`Error executing delay node ${nodeId}:`, error)
      this.emitNodeExecution('deactivated', nodeId)
    }
  }

  /** Resolve the var store that owns a given variable (cue/group split or effect-local). */
  protected getVarStore(varName: string, context: ExecutionContext): Map<string, VariableValue> {
    return getVariableStore(
      varName,
      this.variableDefinitions,
      context.cueLevelVarStore,
      context.groupLevelVarStore,
    )
  }

  /** Resolve the for-each-light group size (effect supports batching; cue is always 1). */
  protected resolveForEachGroupSize(
    _logicNode: LogicNode & { logicType: 'for-each-light' },
    _context: ExecutionContext,
  ): number {
    return 1
  }

  /**
   * Execute a for-each-light node by eagerly iterating the source light-array, running the
   * body for each light (or group of `groupSize` lights), then continuing the 'done' branch.
   */
  protected executeForEachLight(
    logicNode: LogicNode & { logicType: 'for-each-light' },
    context: ExecutionContext,
  ): void {
    const nodeId = logicNode.id
    const { adjacency } = this.compiled
    const edges = adjacency.get(nodeId) ?? []
    const eachTargets = edges.filter((e) => e.fromPort === 'each').map((e) => e.to)
    const doneTargets = edges.filter((e) => e.fromPort === 'done').map((e) => e.to)

    const sourceVar = this.getVarStore(logicNode.sourceVariable, context).get(
      logicNode.sourceVariable,
    )
    if (!sourceVar || sourceVar.type !== 'light-array') {
      this.debugLog(
        `for-each-light ${nodeId}: source "${logicNode.sourceVariable}" is not a light-array`,
        { sourceVar: sourceVar ?? null },
      )
      context.markVisited(nodeId)
      this.continueOrComplete(doneTargets, context)
      this.emitNodeExecution('deactivated', nodeId)
      return
    }

    const lightsArray = sourceVar.value as TrackedLight[]
    const rawLength = lightsArray.length

    const groupSize = this.resolveForEachGroupSize(logicNode, context)
    const length = groupSize > 1 ? Math.floor(rawLength / groupSize) : rawLength

    const bodyNodeIds = this.collectReachableNodes(adjacency, eachTargets, nodeId)
    context.setForEachLightState(nodeId, { index: 0, length })

    for (let i = 0; i < length; i++) {
      const currentLightArray =
        groupSize > 1
          ? lightsArray.slice(i * groupSize, (i + 1) * groupSize)
          : lightsArray[i]
            ? [lightsArray[i]]
            : []
      this.getVarStore(logicNode.currentLightVariable, context).set(
        logicNode.currentLightVariable,
        { type: 'light-array', value: currentLightArray },
      )
      this.getVarStore(logicNode.currentIndexVariable, context).set(
        logicNode.currentIndexVariable,
        { type: 'number', value: i },
      )
      context.setForEachIterationIndex(i)
      for (const bodyId of bodyNodeIds) {
        context.unmarkVisited(bodyId)
      }
      this.continueExecution(eachTargets, context)
    }

    context.clearForEachLightState(nodeId)
    context.setForEachIterationIndex(-1)
    context.markVisited(nodeId)

    this.emitNodeExecution('deactivated', nodeId)
    this.continueOrComplete(doneTargets, context)
  }

  /**
   * Hook run after a (non-delay, non-for-each) logic node is evaluated. Cue re-marks the
   * node visited (harmless under strict); effect leaves it unmarked so relaxed re-entry works.
   */
  protected afterLogicEval(_nodeId: string, _context: ExecutionContext): void {
    // default: no-op
  }

  /**
   * Execute a logic node: delay/for-each-light are handled specially; all others evaluate
   * immediately and continue to their next nodes.
   */
  protected executeLogicNode(logicNode: LogicNode, context: ExecutionContext): void {
    const nodeId = logicNode.id
    try {
      if (logicNode.logicType === 'delay') {
        this.executeDelayNode(logicNode, context)
        return
      }
      if (logicNode.logicType === 'for-each-light') {
        this.executeForEachLight(logicNode, context)
        return
      }

      const { adjacency } = this.compiled
      const edges = adjacency.get(nodeId) ?? []

      const evaluatorContext: LogicNodeEvaluatorContext = {
        cueId: this.getEmitCueId(),
        lightManager: this.lightManager,
        cueLevelVarStore: context.cueLevelVarStore,
        groupLevelVarStore: context.groupLevelVarStore,
        variableDefinitions: this.variableDefinitions,
        executeNode: (nextNodeId: string, ctx: ExecutionContext) =>
          this.executeNode(nextNodeId, ctx),
        debugOutput: (channel: string, payload: unknown) => this.runtimeEmit(channel, payload),
      }

      const nextNodes = evaluateLogicNode(logicNode, nodeId, edges, context, evaluatorContext)

      this.afterLogicEval(nodeId, context)

      // Logic nodes execute immediately - continue to next nodes without waiting.
      this.continueOrComplete(nextNodes, context)
      this.emitNodeExecution('deactivated', nodeId)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${nodeId}: ${msg}`)
      log.error(`Error executing logic node ${nodeId}:`, error)
      this.emitNodeExecution('deactivated', nodeId)
    }
  }

  /**
   * Execute an event raiser node: fire all registered listeners, then continue immediately
   * (non-blocking).
   */
  protected executeEventRaiserNode(raiserNode: EventRaiserNode, context: ExecutionContext): void {
    try {
      const { eventName } = raiserNode
      if (!eventName) {
        log.warn(`Event raiser ${raiserNode.id} has no event selected, skipping`)
        this.continueToNextNodes(raiserNode.id, context)
        return
      }

      const listeners = this.eventListeners.get(eventName) ?? []
      for (const listener of listeners) {
        this.startListenerExecution(listener, this.listenerCueData(context))
      }

      this.emitNodeExecution('deactivated', raiserNode.id)
      this.continueToNextNodes(raiserNode.id, context)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${raiserNode.id}: ${msg}`)
      log.error(`Error executing event raiser node ${raiserNode.id}:`, error)
      this.emitNodeExecution('deactivated', raiserNode.id)
    }
  }

  /** Which cue data a fired listener's context should run with (cue: the running context's; effect: the caller's). */
  protected listenerCueData(context: ExecutionContext): CueData | AudioCueData {
    return context.cueData
  }

  /**
   * Cancel all active executions (called on cue/effect stop).
   * @param skipEffectRemoval When true, leave submitted effects on the sequencer so the next
   * cue's setEffect can transition from them instead of from black.
   */
  public cancelAll(skipEffectRemoval = false): void {
    this.onCancelStart(skipEffectRemoval)

    for (const [contextId, context] of this.activeContexts) {
      this.onContextCancelled(contextId)
      context.dispose()
    }
    this.activeContexts.clear()

    // Remove callbacks but optionally keep effects on the sequencer.
    for (const [name, layer] of this.submittedEffects) {
      this.sequencer.removeEffectCallback(name)
      if (!skipEffectRemoval) {
        this.sequencer.removeEffect(name, layer)
      }
    }
    this.submittedEffects.clear()

    for (const name of this.submittedMotionPatterns) {
      if (!skipEffectRemoval) {
        this.sequencer.removeMotionPattern(name)
      }
    }
    this.submittedMotionPatterns.clear()
    this.setPositionSubmissionFingerprint.clear()

    this.onCancelFinish(skipEffectRemoval)
  }

  /** Cancellation pre-step (cue flushes pending node activations). */
  protected onCancelStart(_skipEffectRemoval: boolean): void {
    // default: no-op
  }

  /** Per-context cancellation side effect (cue fires the 'cancelled' lifecycle event). */
  protected onContextCancelled(_contextId: string): void {
    // default: no-op
  }

  /** Cancellation post-step (cue cancels nested effect engines; effect clears idle state). */
  protected onCancelFinish(_skipEffectRemoval: boolean): void {
    // default: no-op
  }

  /**
   * Execute an action node: create the effect(s) and submit to the sequencer.
   * Four branches: blackout dispatch (cue-only) → set-position → motion-pattern dispatch →
   * single set-color submit / action-chain composition. Blocking actions defer downstream
   * execution until their completion callback fires.
   */
  protected executeActionNode(actionNode: ActionNode, context: ExecutionContext): void {
    try {
      // Blackout is handled specially by the cue engine (sequencer.blackout()); effect inherits no-op.
      if (this.handleBlackoutAction(actionNode, context)) {
        return
      }

      if (actionNode.effectType === 'set-position') {
        this.executeSetPositionAction(actionNode, context)
        return
      }

      // Motion-pattern: cue submits a real pattern; effect warns + skips.
      if (actionNode.effectType === 'motion-pattern') {
        if (this.handleMotionPatternAction(actionNode, context)) {
          return
        }
      }

      // Resolve target
      const resolvedTarget: ResolvedActionTarget = {
        groups: resolveLocationGroups(actionNode.target.groups, context),
        filter: resolveLightTarget(actionNode.target.filter, context),
      }

      if (!actionNode.color) {
        log.warn(`Action ${actionNode.id} (${actionNode.effectType}) is missing color`)
        this.continueToNextNodes(actionNode.id, context)
        return
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
      const actionChain = buildActionChain(
        actionNode,
        this.compiled.adjacency,
        this.compiled.actionMap,
      )

      const resolvedAction = {
        ...actionNode,
        target: resolvedTarget,
        color: resolvedColor,
        timing: resolvedTiming,
        layer: resolvedLayer,
      } as ActionNode & {
        target: ResolvedActionTarget
        color: ResolvedColorSetting
        timing: ResolvedActionTiming
        layer: number
      }

      const lights = ActionEffectFactory.resolveLights(
        this.lightManager,
        actionNode.target, // Pass the ORIGINAL target with ValueSource intact
        (varName: string) => this.lookupVar(varName, context),
      )

      // Log resolved lights + any variable target (cue-only; debugLog is a no-op for effects).
      if (actionNode.target?.groups?.source === 'variable') {
        const varName = actionNode.target.groups.name
        this.debugLog(`action target groups from var=$${varName} ctx=${context.id}`, {
          varValue: this.lookupVar(varName, context),
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
        })

        if (!effect) {
          // Failed to build effect, continue immediately
          this.continueToNextNodes(actionNode.id, context)
          return
        }

        // Stable effect name so repeated submissions (e.g. cue-called) queue in the sequencer.
        // Inside for-each-light, append iteration index for unique per-light effect names.
        const iterIdx = context.getForEachIterationIndex()
        const effectName = this.buildEffectName(actionNode.id, iterIdx)

        this.debugLog(`submit effect nodeId=${actionNode.id} ctx=${context.id}`, {
          effectName,
          layer: resolvedLayer,
          timing: resolvedTiming,
          color: resolvedColor,
        })

        const shouldBlock = this.isBlockingTiming(resolvedTiming)
        const useSetEffect = this.getAndConsumeInitialClearPolicy()

        if (shouldBlock) {
          context.registerActiveAction(actionNode.id, actionNode)
          this.markPendingCallbackEffect(effectName)
          const callback = (): void => {
            this.clearPendingCallbackEffect(effectName)
            this.submittedEffects.delete(effectName)
            this.emitNodeExecution('deactivated', actionNode.id)
            this.onBlockingActionComplete(actionNode.id, context)
          }
          this.submittedEffects.set(effectName, resolvedLayer)
          if (useSetEffect) {
            this.sequencer.setEffectUnblockedNameWithCallback(effectName, effect, callback)
          } else {
            this.sequencer.addEffectUnblockedNameWithCallback(effectName, effect, callback)
          }
        } else {
          this.submittedEffects.set(effectName, resolvedLayer)
          if (useSetEffect) {
            this.sequencer.setEffectUnblockedName(effectName, effect)
          } else {
            this.sequencer.addEffect(effectName, effect)
          }
          this.emitNodeExecution('deactivated', actionNode.id)
          this.continueToNextNodes(actionNode.id, context)
        }
      }

      // If we're not actually chaining anything, fall back to single-action behavior.
      if (actionChain.length === 1) {
        submitSingleAction()
        return
      }

      const chainData = tryBuildHomogeneousSetColorChainData(actionChain, (a) =>
        resolveChainStep(a, context, this.lightManager, (varName: string) =>
          this.lookupVar(varName, context),
        ),
      )

      if (!chainData) {
        submitSingleAction()
        return
      }

      const iterIdx = context.getForEachIterationIndex()
      const chainEffectName = this.buildChainEffectName(actionChain[0].id, iterIdx)
      this.debugLog(`submit action-chain ctx=${context.id}`, {
        effectName: chainEffectName,
        layer: chainData.baseLayer,
        actions: actionChain.map((a) => ({ id: a.id, effectType: a.effectType })),
      })

      markConsecutiveActionChainTailVisited(context, actionChain, (nodeId) =>
        this.emitNodeExecution('activated', nodeId),
      )

      const composedEffect = ActionEffectFactory.buildEffectChain(
        mapSetColorChainStepsForEffectFactory(
          chainData.steps,
          chainData.baseLights,
          chainData.baseLayer,
        ),
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

      const chainHasBlockingStep = chainData.steps.some((step) =>
        this.isBlockingTiming(step.resolvedTiming),
      )
      const lastChainNode = actionChain[actionChain.length - 1]

      const useSetEffectChain = this.getAndConsumeInitialClearPolicy()
      if (chainHasBlockingStep) {
        context.registerActiveAction(lastChainNode.id, lastChainNode)
        this.markPendingCallbackEffect(chainEffectName)
        const callback = (): void => {
          this.clearPendingCallbackEffect(chainEffectName)
          this.submittedEffects.delete(chainEffectName)
          for (const a of actionChain) {
            this.emitNodeExecution('deactivated', a.id)
          }
          this.onBlockingActionComplete(lastChainNode.id, context)
        }
        this.submittedEffects.set(chainEffectName, chainData.baseLayer)
        if (useSetEffectChain) {
          this.sequencer.setEffectUnblockedNameWithCallback(
            chainEffectName,
            composedEffect,
            callback,
          )
        } else {
          this.sequencer.addEffectUnblockedNameWithCallback(
            chainEffectName,
            composedEffect,
            callback,
          )
        }
      } else {
        this.submittedEffects.set(chainEffectName, chainData.baseLayer)
        if (useSetEffectChain) {
          this.sequencer.setEffectUnblockedName(chainEffectName, composedEffect)
        } else {
          this.sequencer.addEffectUnblockedName(chainEffectName, composedEffect)
        }
        for (const a of actionChain) {
          this.emitNodeExecution('deactivated', a.id)
        }
        this.continueToNextNodes(lastChainNode.id, context)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${actionNode.id}: ${msg}`)
      log.error(`Error executing action node ${actionNode.id}:`, error)
      this.emitNodeExecution('deactivated', actionNode.id)
    }
  }

  /**
   * Execute a set-position action: resolve the position transform and submit it as a
   * state-target effect (immediate replace when non-blocking, callback-gated when blocking).
   */
  protected executeSetPositionAction(actionNode: ActionNode, context: ExecutionContext): void {
    if (!actionNode.position) {
      log.warn(`set-position action ${actionNode.id} is missing position`)
      this.continueToNextNodes(actionNode.id, context)
      return
    }

    const resolvedTarget: ResolvedActionTarget = {
      groups: resolveLocationGroups(actionNode.target.groups, context),
      filter: resolveLightTarget(actionNode.target.filter, context),
    }
    const resolvedPosition: ResolvedPositionSetting = resolveActionPosition(
      actionNode.position,
      context,
    )
    const resolvedTiming = resolveActionTiming(actionNode.timing, context)
    const resolvedLayer = resolveActionLayer(actionNode.layer, context)

    const resolvedAction = {
      ...actionNode,
      target: resolvedTarget,
      timing: resolvedTiming,
      layer: resolvedLayer,
    } as ActionNode & {
      target: ResolvedActionTarget
      timing: ResolvedActionTiming
      layer: number
    }

    const lights = ActionEffectFactory.resolveLights(
      this.lightManager,
      actionNode.target,
      (varName: string) => this.lookupVar(varName, context),
    )

    if (!lights || lights.length === 0) {
      this.continueToNextNodes(actionNode.id, context)
      return
    }

    const iterIdx = context.getForEachIterationIndex()
    const effectName = this.buildEffectName(actionNode.id, iterIdx)

    const positionFp = buildSetPositionSubmissionFingerprint(
      resolvedTarget,
      resolvedPosition,
      resolvedLayer,
      resolvedTiming,
    )
    if (this.setPositionSubmissionFingerprint.get(effectName) === positionFp) {
      this.emitNodeExecution('deactivated', actionNode.id)
      this.continueToNextNodes(actionNode.id, context)
      return
    }

    const effect = ActionEffectFactory.buildEffect({
      action: resolvedAction,
      lights,
      waitCondition: undefined,
      waitTime: 0,
      resolvedTarget,
      resolvedTiming,
      resolvedLayer,
      resolvedPosition,
    })

    if (!effect) {
      log.warn(`Failed to create set-position effect for action ${actionNode.id}`)
      this.emitNodeExecution('deactivated', actionNode.id)
      this.continueToNextNodes(actionNode.id, context)
      return
    }

    const shouldBlock = this.isBlockingTiming(resolvedTiming)
    const useSetEffect = this.getAndConsumeInitialClearPolicy()

    if (shouldBlock) {
      context.registerActiveAction(actionNode.id, actionNode)
      this.markPendingCallbackEffect(effectName)
      const callback = (): void => {
        this.clearPendingCallbackEffect(effectName)
        this.submittedEffects.delete(effectName)
        this.setPositionSubmissionFingerprint.set(effectName, positionFp)
        this.emitNodeExecution('deactivated', actionNode.id)
        this.onBlockingActionComplete(actionNode.id, context)
      }
      this.submittedEffects.set(effectName, resolvedLayer)
      if (useSetEffect) {
        this.sequencer.setEffectUnblockedNameWithCallback(effectName, effect, callback)
      } else {
        this.sequencer.addEffectUnblockedNameWithCallback(effectName, effect, callback)
      }
    } else {
      this.submittedEffects.set(effectName, resolvedLayer)
      if (useSetEffect) {
        this.sequencer.setEffectUnblockedName(effectName, effect)
      } else {
        // set-position is a state-target effect: each new resolved position
        // must take effect immediately. Queueing behind a stale in-flight
        // transition would desynchronise per-light motion across beats.
        this.sequencer.replaceEffect(effectName, effect)
      }
      this.setPositionSubmissionFingerprint.set(effectName, positionFp)
      this.emitNodeExecution('deactivated', actionNode.id)
      this.continueToNextNodes(actionNode.id, context)
    }
  }

  protected abstract startListenerExecution(
    listenerNode: EventListenerNode,
    cueData: CueData | AudioCueData,
  ): void
}
