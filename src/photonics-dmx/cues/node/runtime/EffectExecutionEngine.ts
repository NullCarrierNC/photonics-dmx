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
  ActionNode,
  BaseEventNode,
  EffectEventListenerNode,
  EventListenerNode,
  LogicNode,
} from '../../types/nodeCueTypes'
import type { TrackedLight } from '../../../types'
import { ExecutionContext } from './ExecutionContext'
import { VariableValue, NodeRuntimeCallbacks } from './executionTypes'
import { BaseNodeExecutionEngine, CompiledGraph } from './BaseNodeExecutionEngine'
import { RevisitPolicy } from './GraphExecutionPolicy'
import { resolveValue } from './valueResolver'
import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { createLogger } from '../../../../shared/logger'
const log = createLogger('EffectExecutionEngine')

/** Optional collaborators for an {@link EffectExecutionEngine}; omitted fields fall back to defaults. */
export interface EffectExecutionEngineOptions {
  firstSubmissionUsesSetEffectRef?: { use: boolean }
  runtimeCallbacks?: NodeRuntimeCallbacks
  consumeInitialClearPolicy?: () => boolean
  /** Re-entry policy; defaults to 'relaxed'. */
  revisitPolicy?: RevisitPolicy
}

export class EffectExecutionEngine extends BaseNodeExecutionEngine {
  private static nextInstanceId = 0
  private instanceId: number

  private compiledEffect: CompiledEffect<BaseEventNode>
  private effectVarStore: Map<string, VariableValue> // Effect-local variables
  private parameterValues: Record<string, any>
  private callerCueData: CueData | AudioCueData // Cue data from caller
  private onIdleCallback?: () => void // Called when all contexts complete
  /** Prevents re-entrant onIdleCallback when triggerEffect completes synchronously (e.g. persistent raiser re-trigger). */
  private firingIdle = false
  /** Callback-backed effects still running in sequencer for this engine instance. */
  private pendingCallbackEffects: Set<string> = new Set()
  private readonly revisitPolicyValue: RevisitPolicy

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

  constructor(
    compiledEffect: CompiledEffect<BaseEventNode>,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    broadcaster: RuntimeBroadcaster,
    parameterValues: Record<string, any>,
    callerCueData: CueData | AudioCueData,
    options: EffectExecutionEngineOptions = {},
  ) {
    super({
      sequencer,
      lightManager,
      broadcaster,
      variableDefinitions: compiledEffect.definition.variables ?? [],
      firstSubmissionUsesSetEffectRef: options.firstSubmissionUsesSetEffectRef,
      runtimeCallbacks: options.runtimeCallbacks,
      consumeInitialClearPolicy: options.consumeInitialClearPolicy,
    })
    this.instanceId = ++EffectExecutionEngine.nextInstanceId
    this.compiledEffect = compiledEffect
    this.parameterValues = parameterValues
    this.callerCueData = callerCueData
    this.revisitPolicyValue = options.revisitPolicy ?? 'relaxed'

    // Initialize effect-local variable store
    this.effectVarStore = new Map()
    this.initializeVariables()

    // Register runtime event listeners
    this.registerEventListeners()
  }

  protected get compiled(): CompiledGraph {
    return this.compiledEffect
  }

  protected get revisitPolicy(): RevisitPolicy {
    return this.revisitPolicyValue
  }

  protected getEmitCueId(): string {
    return this.compiledEffect.definition.id
  }

  /** Effect naming: `effect_${defId}_${instanceId}_${nodeId}` (+ `:${iterIdx}` inside a for-each-light loop). */
  protected buildEffectName(actionNodeId: string, iterationIndex = -1): string {
    const base = `effect_${this.compiledEffect.definition.id}_${this.instanceId}_${actionNodeId}`
    return iterationIndex >= 0 ? `${base}:${iterationIndex}` : base
  }

  /** Effect chain naming inserts a `_chain_` infix off the first node id. */
  protected override buildChainEffectName(firstActionNodeId: string, iterationIndex = -1): string {
    const base = `effect_${this.compiledEffect.definition.id}_${this.instanceId}_chain_${firstActionNodeId}`
    return iterationIndex >= 0 ? `${base}:${iterationIndex}` : base
  }

  /** Effects do not support motion-pattern actions yet: warn and skip. */
  protected handleMotionPatternAction(action: ActionNode, context: ExecutionContext): boolean {
    log.warn(`motion-pattern not yet supported in effects (action ${action.id})`)
    this.continueToNextNodes(action.id, context)
    return true
  }

  /** Track callback-backed effect submissions so isBusy() reflects pending sequencer work. */
  protected override markPendingCallbackEffect(effectName: string): void {
    this.pendingCallbackEffects.add(effectName)
  }

  protected override clearPendingCallbackEffect(effectName: string): void {
    this.pendingCallbackEffects.delete(effectName)
  }

  protected override batchOptions(_context: ExecutionContext): {
    onBlocked?: () => void
    onNodeError?: (nodeId: string, error: unknown) => void
  } {
    return {
      onNodeError: (nodeId, error) => {
        const msg = error instanceof Error ? error.message : String(error)
        this.runtimeEmit(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, `${nodeId}: ${msg}`)
        log.error(`Error executing node ${nodeId}:`, error)
      },
    }
  }

  /** Effects always re-enter continueExecution so the batch wrapper handles completion/idle. */
  protected override continueOrComplete(targets: string[], context: ExecutionContext): void {
    this.continueExecution(targets, context)
  }

  /**
   * Effect contexts have no onNodeComplete callback, so completing a blocking action must
   * advance the phase, continue downstream, and fire the idle check inline.
   */
  protected override onBlockingActionComplete(nodeId: string, context: ExecutionContext): void {
    context.advancePhase()
    context.completeAction(nodeId)
    this.continueToNextNodes(nodeId, context)
    this.maybeFireIdle()
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

  /** Effect-specific node kind: event-listener (only triggered by events, never executed directly). */
  protected override dispatchSpecialNode(nodeId: string, _context: ExecutionContext): boolean {
    return this.compiledEffect.eventListenerMap.has(nodeId)
  }

  /** Effects support for-each-light group batching via the node's groupSize ValueSource. */
  protected override resolveForEachGroupSize(
    logicNode: LogicNode & { logicType: 'for-each-light' },
    context: ExecutionContext,
  ): number {
    if (logicNode.groupSize) {
      const resolved = Number(resolveValue('number', logicNode.groupSize, context))
      if (typeof resolved === 'number' && !Number.isNaN(resolved) && resolved > 0) {
        return Math.floor(resolved)
      }
    }
    return 1
  }

  /** Effect listeners always run against the caller's cue data, not the running context's. */
  protected override listenerCueData(): CueData | AudioCueData {
    return this.callerCueData
  }

  /**
   * Start execution from a runtime event listener.
   */
  protected startListenerExecution(
    listener: EventListenerNode,
    cueData: CueData | AudioCueData,
  ): void {
    const context = new ExecutionContext(
      { id: listener.id, type: 'event', outputs: listener.outputs } as any,
      cueData,
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

  /** Clear effect-only idle/pending state on cancel. */
  protected override onCancelFinish(): void {
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
