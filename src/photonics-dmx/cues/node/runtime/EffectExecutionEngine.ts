/**
 * Execution engine for effect node graphs.
 * Similar to NodeExecutionEngine but for effects triggered by cues.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CueData } from '../../types/cueTypes'
import { AudioCueData } from '../../types/audioCueTypes'
import { CompiledEffect } from '../compiler/EffectCompiler'
import {
  ActionEffectFactory,
  ResolvedActionTarget,
  ResolvedPositionSetting,
  buildSetPositionSubmissionFingerprint,
  resolvedMotionPatternSettingsEqual,
  resolvedMotionPatternSettingsEqualExceptBearing,
  trackedLightIdsEqualOrder,
} from '../compiler/ActionEffectFactory'
import {
  ActionNode,
  BaseEventNode,
  EffectEventListenerNode,
  EventRaiserNode,
  EventListenerNode,
  LogicNode,
  VariableDefinition,
} from '../../types/nodeCueTypes'
import type { TrackedLight } from '../../../types'
import { ExecutionContext } from './ExecutionContext'
import { VariableValue, NodeRuntimeCallbacks } from './executionTypes'
import {
  resolveValue,
  getVariableStore,
  resolveLocationGroups,
  resolveLightTarget,
} from './valueResolver'
import {
  resolveActionTiming,
  resolveActionColor,
  resolveActionLayer,
  resolveActionPosition,
  resolveMotionPattern,
} from './actionResolver'
import { evaluateLogicNode, LogicNodeEvaluatorContext } from './logicNodeEvaluator'
import { collectReachableNodes } from './engineUtils'
import {
  buildActionChain,
  markConsecutiveActionChainTailVisited,
  mapSetColorChainStepsForEffectFactory,
  resolveChainStep,
  runContextBatch,
  tryBuildHomogeneousSetColorChainData,
} from './graphActionHelpers'
import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { createLogger } from '../../../../shared/logger'
const log = createLogger('EffectExecutionEngine')

export class EffectExecutionEngine {
  private static nextInstanceId = 0
  private instanceId: number

  private compiledEffect: CompiledEffect<BaseEventNode>
  private sequencer: ILightingController
  private lightManager: DmxLightManager
  private effectVarStore: Map<string, VariableValue> // Effect-local variables
  private parameterValues: Record<string, any>
  private activeContexts: Map<string, ExecutionContext> = new Map()
  private variableDefinitions: VariableDefinition[]
  private eventListeners: Map<string, EventListenerNode[]> = new Map()
  private callerCueData: CueData | AudioCueData // Cue data from caller
  private onIdleCallback?: () => void // Called when all contexts complete
  /** Prevents re-entrant onIdleCallback when triggerEffect completes synchronously (e.g. persistent raiser re-trigger). */
  private firingIdle = false
  /** Effect names and layers submitted via addEffect/addEffectUnblockedNameWithCallback, for cancelAll to remove. */
  private submittedEffects: Map<string, number> = new Map()
  private submittedMotionPatterns: Set<string> = new Set()
  private setPositionSubmissionFingerprint: Map<string, string> = new Map()
  /** Callback-backed effects still running in sequencer for this engine instance. */
  private pendingCallbackEffects: Set<string> = new Set()
  /** When .use is true, the next effect submission must use setEffect (then set .use = false). */
  private firstSubmissionUsesSetEffectRef?: { use: boolean }
  /** When provided (e.g. by V2), use instead of reading/mutating the ref. */
  private readonly consumeInitialClearPolicy?: () => boolean
  private readonly runtimeCallbacks?: NodeRuntimeCallbacks
  private readonly broadcaster: RuntimeBroadcaster

  /** Returns whether the next effect submission should use setEffect, and consumes the policy. */
  private getAndConsumeInitialClearPolicy(): boolean {
    if (this.consumeInitialClearPolicy) {
      return this.consumeInitialClearPolicy()
    }
    const v = this.firstSubmissionUsesSetEffectRef?.use === true
    if (this.firstSubmissionUsesSetEffectRef) {
      this.firstSubmissionUsesSetEffectRef.use = false
    }
    return v
  }

  private maybeFireIdle(): void {
    if (
      this.onIdleCallback &&
      this.activeContexts.size === 0 &&
      this.pendingCallbackEffects.size === 0
    ) {
      if (this.firingIdle) return
      this.firingIdle = true
      try {
        this.onIdleCallback()
      } finally {
        this.firingIdle = false
      }
    }
  }

  private runtimeEmit(channel: string, payload: unknown): void {
    if (this.runtimeCallbacks) {
      this.runtimeCallbacks.emit(channel, payload)
    } else {
      this.broadcaster.emit(channel, payload)
    }
  }

  private emitNodeExecution(type: 'activated' | 'deactivated', nodeId: string): void {
    this.runtimeEmit(RENDERER_RECEIVE.NODE_EXECUTION, {
      type,
      cueId: this.compiledEffect.definition.id,
      nodeId,
      timestamp: Date.now(),
    })
  }

  constructor(
    compiledEffect: CompiledEffect<BaseEventNode>,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    broadcaster: RuntimeBroadcaster,
    parameterValues: Record<string, any>,
    callerCueData: CueData | AudioCueData,
    firstSubmissionUsesSetEffectRef?: { use: boolean },
    runtimeCallbacks?: NodeRuntimeCallbacks,
    consumeInitialClearPolicy?: () => boolean,
  ) {
    this.instanceId = ++EffectExecutionEngine.nextInstanceId
    this.compiledEffect = compiledEffect
    this.sequencer = sequencer
    this.lightManager = lightManager
    this.broadcaster = broadcaster
    this.parameterValues = parameterValues
    this.callerCueData = callerCueData
    this.firstSubmissionUsesSetEffectRef = firstSubmissionUsesSetEffectRef
    this.consumeInitialClearPolicy = consumeInitialClearPolicy
    this.runtimeCallbacks = runtimeCallbacks
    this.variableDefinitions = compiledEffect.definition.variables ?? []

    // Initialize effect-local variable store
    this.effectVarStore = new Map()
    this.initializeVariables()

    // Register runtime event listeners
    this.registerEventListeners()
  }

  /**
   * Initialize effect variables with their default values.
   */
  private initializeVariables(): void {
    for (const varDef of this.variableDefinitions) {
      this.effectVarStore.set(varDef.name, {
        type: varDef.type,
        value: varDef.initialValue,
      })
    }
  }

  /**
   * Register all runtime event listeners from the compiled effect.
   */
  private registerEventListeners(): void {
    const { eventListenerMap } = this.compiledEffect
    for (const listener of eventListenerMap.values()) {
      if (!listener.eventName) {
        continue
      }
      const listeners = this.eventListeners.get(listener.eventName) ?? []
      listeners.push(listener)
      this.eventListeners.set(listener.eventName, listeners)
    }
  }

  /**
   * Trigger the effect by starting execution from the effect listener.
   */
  public triggerEffect(cueData: CueData | AudioCueData): void {
    // Get the effect listener (entry point)
    const effectListener = Array.from(this.compiledEffect.effectListenerMap.values())[0]
    if (!effectListener) {
      log.warn('No effect listener found in effect')
      return
    }

    // Apply parameter values to effect variables
    this.applyParameterValues(effectListener)

    // Create execution context with caller's cue data. cueLevelVarStore is the effect's
    // var store so resolveActionTiming() reads waitUntilCondition/waitUntilTime from it.
    const context = new ExecutionContext(
      { id: effectListener.id, type: 'event', outputs: effectListener.outputs } as any,
      cueData, // Pass caller's cue data
      this.effectVarStore, // Use effect-local variables as "cue-level"
      new Map(), // No group-level variables for effects
    )

    context.setOnContextComplete(() => {
      this.activeContexts.delete(context.id)
      this.maybeFireIdle()
    })

    this.activeContexts.set(context.id, context)

    this.emitNodeExecution('activated', effectListener.id)
    this.emitNodeExecution('deactivated', effectListener.id)

    // Get outgoing edges from effect listener and start execution
    const { adjacency } = this.compiledEffect
    const outgoing = adjacency.get(effectListener.id) ?? []
    const nextNodes = outgoing.map((conn) => conn.to)

    if (nextNodes.length > 0) {
      this.continueExecution(nextNodes, context)
    } else {
      // No children - context completes immediately
      this.activeContexts.delete(context.id)
      this.maybeFireIdle()
    }
  }

  /**
   * Resolve a literal ValueSource to a primitive for storage in the effect var store.
   * Parameter values from the cue are often ValueSource objects; storing them raw
   * causes resolution to return 0/1 instead of the actual number (e.g. waitUntilTime 500).
   */
  private resolveParameterValue(
    raw: unknown,
    paramType: string,
  ): number | string | boolean | TrackedLight[] {
    if (raw == null) return paramType === 'number' ? 0 : paramType === 'boolean' ? false : ''
    const vs = raw as { source?: string; value?: unknown }
    if (vs && typeof vs === 'object' && vs.source === 'literal' && 'value' in vs) {
      const v = vs.value
      if (paramType === 'number') {
        if (typeof v === 'number' && !Number.isNaN(v)) return v
        if (typeof v === 'string') {
          const n = parseFloat(v)
          return Number.isNaN(n) ? 0 : n
        }
        return typeof v === 'boolean' ? (v ? 1 : 0) : 0
      }
      if (paramType === 'string' || paramType === 'color' || paramType === 'event')
        return String(v ?? '')
      if (paramType === 'boolean') return v === true || v === 'true'
      if (paramType === 'light-array') return Array.isArray(v) ? (v as TrackedLight[]) : []
    }
    // Already-resolved values (e.g. from NodeExecutionEngine): coerce so delay timing is reliable
    if (paramType === 'number') {
      if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
      if (typeof raw === 'string') {
        const n = parseFloat(raw)
        return Number.isNaN(n) ? 0 : n
      }
    }
    if (paramType === 'string' || paramType === 'color' || paramType === 'event')
      return String(raw ?? '')
    return raw as number | string | boolean | TrackedLight[]
  }

  /**
   * Apply parameter values to effect variables.
   * Parameters are variables with isParameter: true in the effect definition.
   * Caller (NodeExecutionEngine) passes resolved primitives with correct types (e.g. waitUntilCondition
   * 'delay', waitUntilTime 500/200, color 'yellow'/'blue'); we store them per param type for action timing.
   */
  private applyParameterValues(_listener: EffectEventListenerNode): void {
    // Get all variables marked as parameters
    const parameterVars = this.variableDefinitions.filter((v) => v.isParameter)

    for (const paramVar of parameterVars) {
      // Check if a value was provided, otherwise use the default
      const raw = this.parameterValues[paramVar.name] ?? paramVar.initialValue
      const value = this.resolveParameterValue(raw, paramVar.type)

      this.effectVarStore.set(paramVar.name, {
        type: paramVar.type,
        value: value,
      })
    }
  }

  /**
   * Execute a node by its ID.
   */
  private executeNode(nodeId: string, context: ExecutionContext): void {
    // Prevent re-execution of logic nodes; action/event-raiser can be revisited (blocking handles flow)
    if (context.hasVisited(nodeId)) {
      const isAction = this.compiledEffect.actionMap.has(nodeId)
      const isEventRaiser = this.compiledEffect.eventRaiserMap.has(nodeId)
      if (!isAction && !isEventRaiser) {
        return
      }
    }

    context.markVisited(nodeId)
    this.emitNodeExecution('activated', nodeId)

    // Determine node type and execute
    const action = this.compiledEffect.actionMap.get(nodeId)
    if (action) {
      this.executeActionNode(action, context)
      return
    }

    const logic = this.compiledEffect.logicMap.get(nodeId)
    if (logic) {
      this.executeLogicNode(logic, context)
      return
    }

    const eventRaiser = this.compiledEffect.eventRaiserMap.get(nodeId)
    if (eventRaiser) {
      this.executeEventRaiserNode(eventRaiser, context)
      return
    }

    const eventListener = this.compiledEffect.eventListenerMap.get(nodeId)
    if (eventListener) {
      // Event listeners are only triggered by events, not executed directly
      return
    }

    log.warn(`Unknown node type for id: ${nodeId}`)
  }

  /**
   * Helper to get the var store for a named variable.
   */
  private getVarStore(varName: string, context: ExecutionContext): Map<string, VariableValue> {
    return getVariableStore(
      varName,
      this.variableDefinitions,
      context.cueLevelVarStore,
      context.groupLevelVarStore,
    )
  }

  /**
   * Execute an action node with action-chaining and per-invocation naming support.
   */
  private executeActionNode(action: ActionNode, context: ExecutionContext): void {
    const getVar = (varName: string) => {
      const cueVar = context.cueLevelVarStore.get(varName)
      const groupVar = context.groupLevelVarStore.get(varName)
      return cueVar ?? groupVar
    }

    // Resolve lights first - handles both light-array variables and standard group/filter targets
    const lights = ActionEffectFactory.resolveLights(this.lightManager, action.target, getVar)

    if (!lights || lights.length === 0) {
      log.warn(`No lights resolved for action ${action.id}, skipping`)
      this.emitNodeExecution('deactivated', action.id)
      this.continueToNextNodes(action.id, context)
      return
    }

    if (action.effectType === 'set-position') {
      if (!action.position) {
        log.warn(`set-position action ${action.id} is missing position`)
        this.emitNodeExecution('deactivated', action.id)
        this.continueToNextNodes(action.id, context)
        return
      }
      const resolvedPosition: ResolvedPositionSetting = resolveActionPosition(
        action.position,
        context,
      )
      const resolvedTiming = resolveActionTiming(action.timing, context)
      const resolvedLayer = resolveActionLayer(action.layer, context)
      const resolvedTarget: ResolvedActionTarget = {
        groups: resolveLocationGroups(action.target.groups, context),
        filter: resolveLightTarget(action.target.filter, context),
      }
      const iterIdx = context.getForEachIterationIndex()

      const submitPositionAction = (): void => {
        const effectName =
          iterIdx >= 0
            ? `effect_${this.compiledEffect.definition.id}_${this.instanceId}_${action.id}:${iterIdx}`
            : `effect_${this.compiledEffect.definition.id}_${this.instanceId}_${action.id}`

        const positionFp = buildSetPositionSubmissionFingerprint(
          resolvedTarget,
          resolvedPosition,
          resolvedLayer,
          resolvedTiming,
        )
        if (this.setPositionSubmissionFingerprint.get(effectName) === positionFp) {
          this.emitNodeExecution('deactivated', action.id)
          this.continueToNextNodes(action.id, context)
          return
        }

        const effect = ActionEffectFactory.buildEffect({
          action,
          lights,
          resolvedPosition,
          resolvedTiming,
          resolvedLayer,
        })
        if (!effect) {
          log.warn(`Failed to create set-position effect for action ${action.id}`)
          this.emitNodeExecution('deactivated', action.id)
          this.continueToNextNodes(action.id, context)
          return
        }
        const useSetEffect = this.getAndConsumeInitialClearPolicy()
        const shouldBlock = resolvedTiming.waitUntilCondition !== 'none'
        if (shouldBlock) {
          context.registerActiveAction(action.id, action)
          this.pendingCallbackEffects.add(effectName)
          const callback = (): void => {
            this.pendingCallbackEffects.delete(effectName)
            this.submittedEffects.delete(effectName)
            this.setPositionSubmissionFingerprint.set(effectName, positionFp)
            this.emitNodeExecution('deactivated', action.id)
            context.advancePhase()
            context.completeAction(action.id)
            this.continueToNextNodes(action.id, context)
            this.maybeFireIdle()
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
          this.emitNodeExecution('deactivated', action.id)
          this.continueToNextNodes(action.id, context)
        }
      }

      submitPositionAction()
      return
    }

    if (action.effectType === 'motion-pattern') {
      if (!action.motionPattern) {
        log.warn(`motion-pattern action ${action.id} is missing motionPattern`)
        this.emitNodeExecution('deactivated', action.id)
        this.continueToNextNodes(action.id, context)
        return
      }
      const resolvedMotion = resolveMotionPattern(action.motionPattern, context)
      const resolvedTiming = resolveActionTiming(action.timing, context)
      const resolvedLayer = resolveActionLayer(action.layer, context)
      if (
        !Number.isFinite(resolvedMotion.speedHz) ||
        resolvedMotion.speedHz <= 0 ||
        !Number.isFinite(resolvedMotion.sizeDeg) ||
        resolvedMotion.sizeDeg <= 0
      ) {
        log.warn(
          `motion-pattern action ${action.id}: speed (Hz) and size (deg) must be finite and positive`,
        )
        this.emitNodeExecution('deactivated', action.id)
        this.continueToNextNodes(action.id, context)
        return
      }
      const iterIdx = context.getForEachIterationIndex()
      const effectName =
        iterIdx >= 0
          ? `effect_${this.compiledEffect.definition.id}_${this.instanceId}_${action.id}:${iterIdx}`
          : `effect_${this.compiledEffect.definition.id}_${this.instanceId}_${action.id}`
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
          this.emitNodeExecution('deactivated', action.id)
          this.continueToNextNodes(action.id, context)
          return
        }
        if (
          resolvedMotionPatternSettingsEqualExceptBearing(existingPattern.config, resolvedMotion)
        ) {
          this.sequencer.updateMotionPatternConfig(effectName, resolvedMotion)
          this.submittedMotionPatterns.add(effectName)
          this.emitNodeExecution('deactivated', action.id)
          this.continueToNextNodes(action.id, context)
          return
        }
      }

      this.sequencer.cancelPanTiltClear()
      this.sequencer.addMotionPattern(effectName, resolvedMotion, lights, resolvedLayer, rampUpMs)
      this.submittedMotionPatterns.add(effectName)
      this.emitNodeExecution('deactivated', action.id)
      this.continueToNextNodes(action.id, context)
      return
    }

    if (!action.color) {
      log.warn(`Action ${action.id} (${action.effectType}) is missing color`)
      this.emitNodeExecution('deactivated', action.id)
      this.continueToNextNodes(action.id, context)
      return
    }

    const resolvedColor = resolveActionColor(action.color, context)
    const resolvedTiming = resolveActionTiming(action.timing, context)
    const resolvedLayer = resolveActionLayer(action.layer, context)

    const actionChain = buildActionChain(
      action,
      this.compiledEffect.adjacency,
      this.compiledEffect.actionMap,
    )

    const iterIdx = context.getForEachIterationIndex()

    // Submit a single action (no chaining)
    const submitSingleAction = (): void => {
      const effect = ActionEffectFactory.buildEffect({
        action,
        lights,
        resolvedColor,
        resolvedTiming,
        resolvedLayer,
      })

      if (!effect) {
        log.warn(`Failed to create effect for action ${action.id}`)
        this.emitNodeExecution('deactivated', action.id)
        this.continueToNextNodes(action.id, context)
        return
      }

      const useSetEffect = this.getAndConsumeInitialClearPolicy()

      const effectName =
        iterIdx >= 0
          ? `effect_${this.compiledEffect.definition.id}_${this.instanceId}_${action.id}:${iterIdx}`
          : `effect_${this.compiledEffect.definition.id}_${this.instanceId}_${action.id}`

      const shouldBlock = resolvedTiming.waitUntilCondition !== 'none'

      if (shouldBlock) {
        context.registerActiveAction(action.id, action)
        this.pendingCallbackEffects.add(effectName)
        const callback = (): void => {
          this.pendingCallbackEffects.delete(effectName)
          this.submittedEffects.delete(effectName)
          this.emitNodeExecution('deactivated', action.id)
          context.advancePhase()
          context.completeAction(action.id)
          this.continueToNextNodes(action.id, context)
          this.maybeFireIdle()
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
        this.emitNodeExecution('deactivated', action.id)
        this.continueToNextNodes(action.id, context)
      }
    }

    // Fall back to single-action if there is no chain to build
    if (actionChain.length === 1) {
      submitSingleAction()
      return
    }

    const chainData = tryBuildHomogeneousSetColorChainData(actionChain, (a) =>
      resolveChainStep(a, context, this.lightManager, getVar),
    )

    if (!chainData) {
      submitSingleAction()
      return
    }

    const chainEffectName =
      iterIdx >= 0
        ? `effect_${this.compiledEffect.definition.id}_${this.instanceId}_chain_${actionChain[0].id}:${iterIdx}`
        : `effect_${this.compiledEffect.definition.id}_${this.instanceId}_chain_${actionChain[0].id}`

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

    const lastChainNode = actionChain[actionChain.length - 1]
    const chainHasBlockingStep = chainData.steps.some(
      (step) =>
        step.resolvedTiming.waitUntilCondition !== 'none' ||
        step.resolvedTiming.waitForCondition !== 'none',
    )

    const useSetEffectChain = this.getAndConsumeInitialClearPolicy()
    if (chainHasBlockingStep) {
      context.registerActiveAction(lastChainNode.id, lastChainNode)
      this.pendingCallbackEffects.add(chainEffectName)
      const callback = (): void => {
        this.pendingCallbackEffects.delete(chainEffectName)
        this.submittedEffects.delete(chainEffectName)
        for (const a of actionChain) {
          this.emitNodeExecution('deactivated', a.id)
        }
        context.advancePhase()
        context.completeAction(lastChainNode.id)
        this.continueToNextNodes(lastChainNode.id, context)
        this.maybeFireIdle()
      }
      this.submittedEffects.set(chainEffectName, chainData.baseLayer)
      if (useSetEffectChain) {
        this.sequencer.setEffectUnblockedNameWithCallback(chainEffectName, composedEffect, callback)
      } else {
        this.sequencer.addEffectUnblockedNameWithCallback(chainEffectName, composedEffect, callback)
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
  }

  /**
   * Execute a for-each-light node by eagerly iterating all lights, running the body for each.
   * Ported from NodeExecutionEngine to support for-each-light in effect node graphs.
   */
  private executeForEachLight(
    logicNode: LogicNode & { logicType: 'for-each-light' },
    context: ExecutionContext,
  ): void {
    const nodeId = logicNode.id
    const { adjacency } = this.compiledEffect
    const edges = adjacency.get(nodeId) ?? []
    const eachEdges = edges.filter((e) => e.fromPort === 'each')
    const doneEdges = edges.filter((e) => e.fromPort === 'done')
    const eachTargets = eachEdges.length > 0 ? eachEdges.map((e) => e.to) : []
    const doneTargets = doneEdges.length > 0 ? doneEdges.map((e) => e.to) : []

    const sourceVar = this.getVarStore(logicNode.sourceVariable, context).get(
      logicNode.sourceVariable,
    )
    if (!sourceVar || sourceVar.type !== 'light-array') {
      context.markVisited(nodeId)
      this.continueExecution(doneTargets, context)
      this.emitNodeExecution('deactivated', nodeId)
      return
    }

    const lightsArray = sourceVar.value as TrackedLight[]
    const rawLength = lightsArray.length

    // Resolve group size from ValueSource (literal or variable) when set
    let groupSize = 1
    if (logicNode.groupSize) {
      const resolved = Number(resolveValue('number', logicNode.groupSize, context))
      if (typeof resolved === 'number' && !Number.isNaN(resolved) && resolved > 0) {
        groupSize = Math.floor(resolved)
      }
    }

    const length = groupSize > 1 ? Math.floor(rawLength / groupSize) : rawLength

    const bodyNodeIds = collectReachableNodes(adjacency, eachTargets, nodeId)
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
    this.continueExecution(doneTargets, context)
  }

  /**
   * Execute a logic node (synchronous).
   */
  private executeLogicNode(logic: LogicNode, context: ExecutionContext): void {
    try {
      // Handle delay nodes specially - they block execution
      if (logic.logicType === 'delay') {
        this.executeDelayNode(logic, context)
        return
      }

      // Handle for-each-light in the engine (same pattern as NodeExecutionEngine)
      if (logic.logicType === 'for-each-light') {
        this.executeForEachLight(logic as any, context)
        return
      }

      const { adjacency } = this.compiledEffect
      const edges = adjacency.get(logic.id) ?? []

      const evaluatorContext: LogicNodeEvaluatorContext = {
        cueId: this.compiledEffect.definition.id,
        lightManager: this.lightManager,
        cueLevelVarStore: context.cueLevelVarStore,
        groupLevelVarStore: context.groupLevelVarStore,
        variableDefinitions: this.variableDefinitions,
        executeNode: (nextNodeId: string, ctx: ExecutionContext) =>
          this.executeNode(nextNodeId, ctx),
        debugOutput: (channel: string, payload: unknown) => this.runtimeEmit(channel, payload),
      }

      const nextNodes = evaluateLogicNode(logic, logic.id, edges, context, evaluatorContext)

      // Logic nodes execute immediately - continue to next nodes without waiting
      this.continueExecution(nextNodes, context)
      this.emitNodeExecution('deactivated', logic.id)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${logic.id}: ${msg}`)
      log.error(`Error executing logic node ${logic.id}:`, error)
      this.emitNodeExecution('deactivated', logic.id)
    }
  }

  /**
   * Execute a delay node inside an effect: block until delay completes.
   */
  private executeDelayNode(
    delayNode: LogicNode & { logicType: 'delay'; delayTime: any },
    context: ExecutionContext,
  ): void {
    try {
      const delayMs = Number(resolveValue('number', delayNode.delayTime, context))
      const actualDelay = Math.max(0, delayMs)

      // Register as active to block execution (dummy action for tracking)
      const dummyAction: ActionNode = {
        id: delayNode.id,
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
      context.registerActiveAction(delayNode.id, dummyAction)

      const timerId = setTimeout(() => {
        context.removeTimer(timerId)
        // Guard on isActionActive other blocking nodes (e.g. from
        // a for-each-light body) can advance the execution phase while the delay waits
        if (context.isActionActive(delayNode.id)) {
          this.emitNodeExecution('deactivated', delayNode.id)
          context.advancePhase()
          context.completeAction(delayNode.id)
          this.continueToNextNodes(delayNode.id, context)
        }
      }, actualDelay)
      context.addTimer(timerId)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${delayNode.id}: ${msg}`)
      log.error(`Error executing delay node ${delayNode.id}:`, error)
      this.emitNodeExecution('deactivated', delayNode.id)
    }
  }

  /**
   * Execute runtime event raiser node (non-blocking).
   */
  private executeEventRaiserNode(raiser: EventRaiserNode, context: ExecutionContext): void {
    const { eventName } = raiser

    // Trigger all listeners for this event
    const listeners = this.eventListeners.get(eventName) ?? []
    for (const listener of listeners) {
      this.startListenerExecution(listener)
    }

    this.emitNodeExecution('deactivated', raiser.id)
    // Continue immediately (non-blocking)
    this.continueToNextNodes(raiser.id, context)
  }

  /**
   * Start execution from a runtime event listener.
   */
  private startListenerExecution(listener: EventListenerNode): void {
    const context = new ExecutionContext(
      { id: listener.id, type: 'event', outputs: listener.outputs } as any,
      this.callerCueData,
      this.effectVarStore,
      new Map(),
    )

    context.setOnContextComplete(() => {
      this.activeContexts.delete(context.id)
      this.maybeFireIdle()
    })

    this.activeContexts.set(context.id, context)

    this.emitNodeExecution('activated', listener.id)
    this.emitNodeExecution('deactivated', listener.id)

    const { adjacency } = this.compiledEffect
    const outgoing = adjacency.get(listener.id) ?? []
    this.continueExecution(
      outgoing.map((conn) => conn.to),
      context,
    )
  }

  /**
   * Dispatch execution to a list of node IDs, guarded by a batch-depth counter.
   *
   * Incrementing batchDepth before the loop prevents a dead-end branch inside the
   * batch from prematurely completing/disposing the context before sibling branches
   * have had a chance to register blocking nodes (e.g. delays).
   */
  private continueExecution(nodeIds: string[], context: ExecutionContext): void {
    runContextBatch(context, nodeIds, (nodeId) => this.executeNode(nodeId, context), {
      onNodeError: (nodeId, error) => {
        const msg = error instanceof Error ? error.message : String(error)
        this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${nodeId}: ${msg}`)
        log.error(`Error executing node ${nodeId}:`, error)
      },
    })
  }

  /**
   * Continue to next nodes after current node completes.
   */
  private continueToNextNodes(nodeId: string, context: ExecutionContext): void {
    const { adjacency } = this.compiledEffect
    const outgoing = adjacency.get(nodeId) ?? []
    this.continueExecution(
      outgoing.map((conn) => conn.to),
      context,
    )
  }

  /**
   * Check if the effect has any active execution contexts.
   */
  public hasActiveContexts(): boolean {
    return this.activeContexts.size > 0
  }

  /**
   * True while the effect is running: has active contexts or callback-backed effects still pending.
   * Use this to block retriggers until the effect is truly idle (matches when onIdle fires).
   */
  public isBusy(): boolean {
    return this.activeContexts.size > 0 || this.pendingCallbackEffects.size > 0
  }

  /**
   * Set a callback to be invoked when the effect becomes idle (no active contexts and no
   * pending callback-backed effects).
   */
  public setOnIdle(callback: () => void): void {
    this.onIdleCallback = callback
  }

  /**
   * Cancel all active executions.
   * @param skipEffectRemoval When true, leave submitted effects on the sequencer so the next cue's setEffect can transition from them instead of from black.
   */
  public cancelAll(skipEffectRemoval = false): void {
    for (const context of this.activeContexts.values()) {
      context.dispose()
    }
    this.activeContexts.clear()
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
    this.pendingCallbackEffects.clear()
    this.onIdleCallback = undefined
  }

  /**
   * Get execution state for debugging.
   */
  public getExecutionState() {
    return {
      activeContexts: this.activeContexts.size,
      contexts: Array.from(this.activeContexts.values()).map((ctx) => ctx.getDebugInfo()),
    }
  }
}
