/**
 * Owns per-activation runtime state for a V2 node cue instance. Responsibilities:
 * - Cue- and group-level variable stores (shared with the execution engine).
 * - First-submission policy: whether the next effect submission should use setEffect (consumed once per activation).
 * - cue-started fired flag and lifecycle callback that drives ExecutionStateMachine per context (started/completed/cancelled).
 * - resetForStop(): clears cue-level state on stop; this instance's groupLevelVarStore is preserved so state can accumulate across activations of this cue (one CueSession per YargNodeCueV2 instance).
 */

import { VariableValue } from '../runtime/executionTypes'
import type { VariableDefinition } from '../../types/nodeCueTypes'
import { ExecutionStateMachine } from './ExecutionStateMachine'
import { ExecutionPhase } from './types'

export type ContextLifecycleEvent = 'started' | 'completed' | 'cancelled'

export class CueSession {
  private readonly cueLevelVarStore = new Map<string, VariableValue>()
  private readonly groupLevelVarStore = new Map<string, VariableValue>()
  private cueStartedFired = false
  /** Shared ref for engine: when true, next effect submission uses setEffect; engine sets .use = false when consumed. */
  private readonly firstSubmissionUsesSetEffectRef = { use: false }
  private clearedForThisActivation = false
  /** Per-context state machines when lifecycle callback is used  */
  private readonly contextStateMachines = new Map<string, ExecutionStateMachine>()

  getCueLevelVarStore(): Map<string, VariableValue> {
    return this.cueLevelVarStore
  }

  getGroupLevelVarStore(): Map<string, VariableValue> {
    return this.groupLevelVarStore
  }

  /** Engine uses this ref; when primary runs with cue-started/cue-called we set .use = true. */
  getFirstSubmissionUsesSetEffectRef(): { use: boolean } {
    return this.firstSubmissionUsesSetEffectRef
  }

  /**
   * Explicit policy: consume and return whether the next effect submission should use setEffect.
   * Returns true at most once per activation (until setFirstSubmissionUsesSetEffect is called again).
   * Use this when the engine supports an optional consumeInitialClearPolicy callback.
   */
  consumeInitialClearPolicy(): boolean {
    const value = this.firstSubmissionUsesSetEffectRef.use
    this.firstSubmissionUsesSetEffectRef.use = false
    return value
  }

  /** Whether first submission has already been set this activation (for initial clear policy). */
  getClearedForThisActivation(): boolean {
    return this.clearedForThisActivation
  }

  /** Call when primary cue starts with cue-started/cue-called; sets first submission to use setEffect. */
  setFirstSubmissionUsesSetEffect(): void {
    this.firstSubmissionUsesSetEffectRef.use = true
    this.clearedForThisActivation = true
  }

  /**
   * Returns a callback for the engine to report context lifecycle so we can drive ExecutionStateMachine.
   * Each context gets a state machine: started -> RUNNING, completed -> COMPLETED, cancelled -> CANCELLED.
   */
  getContextLifecycleCallback(): (contextId: string, event: ContextLifecycleEvent) => void {
    return (contextId: string, event: ContextLifecycleEvent) => {
      if (event === 'started') {
        const sm = new ExecutionStateMachine()
        sm.transitionTo(ExecutionPhase.RUNNING)
        this.contextStateMachines.set(contextId, sm)
        return
      }
      const sm = this.contextStateMachines.get(contextId)
      if (sm) {
        if (event === 'completed') {
          sm.transitionTo(ExecutionPhase.COMPLETED)
        } else if (event === 'cancelled') {
          sm.transitionTo(ExecutionPhase.CANCELLED)
        }
        this.contextStateMachines.delete(contextId)
      }
    }
  }

  hasCueStartedFired(): boolean {
    return this.cueStartedFired
  }

  markCueStartedFired(): void {
    this.cueStartedFired = true
  }

  /** Initialize variable stores from compiled cue/group definitions. */
  initializeVariables(
    cueVariables: VariableDefinition[],
    groupVariables: VariableDefinition[],
  ): void {
    for (const varDef of cueVariables) {
      if (!this.cueLevelVarStore.has(varDef.name)) {
        this.cueLevelVarStore.set(varDef.name, {
          type: varDef.type,
          value: varDef.initialValue,
        })
      }
    }
    for (const varDef of groupVariables) {
      if (!this.groupLevelVarStore.has(varDef.name)) {
        this.groupLevelVarStore.set(varDef.name, {
          type: varDef.type,
          value: varDef.initialValue,
        })
      }
    }
  }

  /** Reset cue-level store and re-seed from definitions (e.g. on cue-started). */
  resetCueLevelVariables(cueVariables: VariableDefinition[]): void {
    this.cueLevelVarStore.clear()
    for (const varDef of cueVariables) {
      this.cueLevelVarStore.set(varDef.name, {
        type: varDef.type,
        value: varDef.initialValue,
      })
    }
  }

  /**
   * Called on stop: reset cue-level state for next activation.
   * This instance's groupLevelVarStore is preserved so state accumulated across activations of this cue survives stop.
   */
  resetForStop(): void {
    this.cueLevelVarStore.clear()
    this.cueStartedFired = false
    this.firstSubmissionUsesSetEffectRef.use = false
    this.clearedForThisActivation = false
    this.contextStateMachines.clear()
  }
}
