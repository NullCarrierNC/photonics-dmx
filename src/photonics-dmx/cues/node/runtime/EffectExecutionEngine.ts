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
  ResolvedColorSetting,
  ResolvedActionTiming,
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
import { VariableValue } from './executionTypes'
import { resolveValue, getVariableStore } from './valueResolver'
import { resolveActionTiming, resolveActionColor, resolveActionLayer } from './actionResolver'
import { evaluateLogicNode, LogicNodeEvaluatorContext } from './logicNodeEvaluator'
import { collectReachableNodes } from './engineUtils'
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
  /** Effect names and layers submitted via addEffectWithCallback, for cancelAll to remove. */
  private submittedEffects: Map<string, number> = new Map()

  private emitNodeExecution(type: 'activated' | 'deactivated', nodeId: string): void {
    sendToAllWindows(RENDERER_RECEIVE.NODE_EXECUTION, {
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
    parameterValues: Record<string, any>,
    callerCueData: CueData | AudioCueData,
  ) {
    this.instanceId = ++EffectExecutionEngine.nextInstanceId
    this.compiledEffect = compiledEffect
    this.sequencer = sequencer
    this.lightManager = lightManager
    this.parameterValues = parameterValues
    this.callerCueData = callerCueData
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
      console.warn('No effect listener found in effect')
      return
    }

    // Apply parameter values to effect variables
    this.applyParameterValues(effectListener)

    // Create execution context with caller's cue data
    const context = new ExecutionContext(
      { id: effectListener.id, type: 'event', outputs: effectListener.outputs } as any,
      cueData, // Pass caller's cue data
      this.effectVarStore, // Use effect-local variables as "cue-level"
      new Map(), // No group-level variables for effects
    )

    context.setOnContextComplete(() => {
      this.activeContexts.delete(context.id)
      // Check if effect is now idle (all contexts done)
      if (this.activeContexts.size === 0 && this.onIdleCallback) {
        this.onIdleCallback()
      }
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
      // Check if effect is now idle (all contexts done)
      if (this.activeContexts.size === 0 && this.onIdleCallback) {
        this.onIdleCallback()
      }
    }
  }

  /**
   * Apply parameter values to effect variables.
   * Parameters are variables with isParameter: true in the effect definition.
   */
  private applyParameterValues(_listener: EffectEventListenerNode): void {
    // Get all variables marked as parameters
    const parameterVars = this.variableDefinitions.filter((v) => v.isParameter)

    for (const paramVar of parameterVars) {
      // Check if a value was provided, otherwise use the default
      const value = this.parameterValues[paramVar.name] ?? paramVar.initialValue

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

    console.warn(`Unknown node type for id: ${nodeId}`)
  }

  /**
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
      console.warn(`No lights resolved for action ${action.id}, skipping`)
      this.emitNodeExecution('deactivated', action.id)
      this.continueToNextNodes(action.id, context)
      return
    }

    const resolvedColor = resolveActionColor(action.color, context)
    const resolvedTiming = resolveActionTiming(action.timing, context)
    const resolvedLayer = resolveActionLayer(action.layer, context)

    // Build action chain: collect consecutive single-edge set-color action nodes
    const buildActionChain = (): ActionNode[] => {
      const { adjacency, actionMap } = this.compiledEffect
      const chain: ActionNode[] = [action]
      const visitedInChain = new Set<string>([action.id])
      let currentId = action.id
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
        console.warn(`Failed to create effect for action ${action.id}`)
        this.emitNodeExecution('deactivated', action.id)
        this.continueToNextNodes(action.id, context)
        return
      }

      const effectName =
        iterIdx >= 0
          ? `effect_${this.compiledEffect.definition.id}_${this.instanceId}_${action.id}:${iterIdx}`
          : `effect_${this.compiledEffect.definition.id}_${this.instanceId}_${action.id}`

      const shouldBlock = resolvedTiming.waitUntilCondition !== 'none'

      if (shouldBlock) {
        context.registerActiveAction(action.id, action)
        const callback = (): void => {
          this.submittedEffects.delete(effectName)
          this.emitNodeExecution('deactivated', action.id)
          context.advancePhase()
          context.completeAction(action.id)
          this.continueToNextNodes(action.id, context)
        }
        this.submittedEffects.set(effectName, resolvedLayer)
        this.sequencer.addEffectWithCallback(effectName, effect, callback)
      } else {
        this.submittedEffects.set(effectName, resolvedLayer)
        this.sequencer.addEffect(effectName, effect)
        this.emitNodeExecution('deactivated', action.id)
        this.continueToNextNodes(action.id, context)
      }
    }

    // Fall back to single-action if there is no chain to build
    if (actionChain.length === 1) {
      submitSingleAction()
      return
    }

    // Try to resolve each chain step (only set-color actions can be chained)
    const resolveChainStep = (a: ActionNode): ChainStep | null => {
      if (a.effectType !== 'set-color') return null

      const layerNum = resolveActionLayer(a.layer, context)
      const rc = resolveActionColor(a.color, context)
      const rtiming = resolveActionTiming(a.timing, context)
      const chainLights = ActionEffectFactory.resolveLights(this.lightManager, a.target, getVar)
      if (!chainLights || chainLights.length === 0) return null

      const lightIds = chainLights.map((l) => l.id).join(',')
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
        if (!step) return null
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

    const chainEffectName =
      iterIdx >= 0
        ? `effect_${this.compiledEffect.definition.id}_${this.instanceId}_chain_${actionChain[0].id}:${iterIdx}`
        : `effect_${this.compiledEffect.definition.id}_${this.instanceId}_chain_${actionChain[0].id}`

    // Mark rest of chain nodes as visited so they don't execute independently
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

    const lastChainNode = actionChain[actionChain.length - 1]
    const chainHasBlockingStep = chainData.steps.some(
      (step) => step.resolvedTiming.waitUntilCondition !== 'none',
    )

    if (chainHasBlockingStep) {
      context.registerActiveAction(lastChainNode.id, lastChainNode)
      const callback = (): void => {
        this.submittedEffects.delete(chainEffectName)
        for (const a of actionChain) {
          this.emitNodeExecution('deactivated', a.id)
        }
        context.advancePhase()
        context.completeAction(lastChainNode.id)
        this.continueToNextNodes(lastChainNode.id, context)
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
    const length = lightsArray.length

    const bodyNodeIds = collectReachableNodes(adjacency, eachTargets, nodeId)
    context.setForEachLightState(nodeId, { index: 0, length })

    for (let i = 0; i < length; i++) {
      const currentLight = lightsArray[i]
      const currentLightArray = currentLight ? [currentLight] : []
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
        debugOutput: sendToAllWindows,
      }

      const nextNodes = evaluateLogicNode(logic, logic.id, edges, context, evaluatorContext)

      // Logic nodes execute immediately - continue to next nodes without waiting
      this.continueExecution(nextNodes, context)
      this.emitNodeExecution('deactivated', logic.id)
    } catch (error) {
      console.error(`Error executing logic node ${logic.id}:`, error)
      this.emitNodeExecution('deactivated', logic.id)
      // Continue to all outgoing edges despite error
      this.continueToNextNodes(logic.id, context)
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
      console.error(`Error executing delay node ${delayNode.id}:`, error)
      this.emitNodeExecution('deactivated', delayNode.id)
      this.continueToNextNodes(delayNode.id, context)
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
      // Check if effect is now idle (all contexts done)
      if (this.activeContexts.size === 0 && this.onIdleCallback) {
        this.onIdleCallback()
      }
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
    context.beginBatch()
    for (const nodeId of nodeIds) {
      this.executeNode(nodeId, context)
    }
    context.endBatch()
    if (context.tryComplete()) {
      context.dispose()
    }
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
   * Set a callback to be invoked when all execution contexts complete (effect becomes idle).
   */
  public setOnIdle(callback: () => void): void {
    this.onIdleCallback = callback
  }

  /**
   * Cancel all active executions.
   */
  public cancelAll(): void {
    for (const context of this.activeContexts.values()) {
      context.dispose()
    }
    this.activeContexts.clear()
    for (const [name, layer] of this.submittedEffects) {
      this.sequencer.removeEffect(name, layer)
    }
    this.submittedEffects.clear()
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
