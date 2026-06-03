/**
 * Per-context ExecutionStateMachine bookkeeping, shared by the cue/effect GraphExecutionEngine
 * and the audio node-cue runtime. Owns a Map<contextId, ExecutionStateMachine> and drives the
 * lifecycle transitions (started -> (blocked <-> running)* -> completed | cancelled) reported by
 * NodeExecutionEngine through its onContextLifecycle callback. Both engines hand `onContextLifecycle`
 * to NodeExecutionEngine and read `hasActiveContexts()` / clear via `cancelAll()` on teardown.
 */

import { ExecutionStateMachine } from './ExecutionStateMachine'
import { ExecutionPhase } from './executionTypes'

export type ContextLifecycleEvent = 'started' | 'completed' | 'cancelled' | 'blocked' | 'running'

export interface ExecutionStateMachineLifecycle {
  /** Hand to NodeExecutionEngine so each context's lifecycle transitions drive a state machine. */
  onContextLifecycle: (contextId: string, event: ContextLifecycleEvent) => void
  /** True while any context state machine is still being tracked. */
  hasActiveContexts: () => boolean
  /** Transition every non-terminal context to CANCELLED, then clear tracking. */
  cancelAll: () => void
  /** Clear tracking without transitioning (hard teardown where transition invariants don't matter). */
  reset: () => void
}

/**
 * Build a fresh lifecycle tracker. Each owner (one GraphExecutionEngine, or one per-rig audio
 * cue run state) gets its own instance so contexts from different engines never collide.
 */
export function createExecutionStateMachineLifecycle(): ExecutionStateMachineLifecycle {
  const contextStateMachines = new Map<string, ExecutionStateMachine>()

  const onContextLifecycle = (contextId: string, event: ContextLifecycleEvent): void => {
    if (event === 'started') {
      const sm = new ExecutionStateMachine()
      sm.transitionTo(ExecutionPhase.RUNNING)
      contextStateMachines.set(contextId, sm)
      return
    }
    const sm = contextStateMachines.get(contextId)
    if (sm) {
      if (event === 'blocked') {
        if (!sm.isTerminal() && sm.phase !== ExecutionPhase.BLOCKED) {
          sm.transitionTo(ExecutionPhase.BLOCKED)
        }
        return
      }
      if (event === 'running') {
        if (sm.phase === ExecutionPhase.BLOCKED) {
          sm.transitionTo(ExecutionPhase.RUNNING)
        }
        return
      }
      if (event === 'completed') {
        sm.transitionTo(ExecutionPhase.COMPLETED)
      } else if (event === 'cancelled') {
        sm.transitionTo(ExecutionPhase.CANCELLED)
      }
      contextStateMachines.delete(contextId)
    }
  }

  const hasActiveContexts = (): boolean => contextStateMachines.size > 0

  const cancelAll = (): void => {
    for (const sm of contextStateMachines.values()) {
      if (!sm.isTerminal()) {
        sm.transitionTo(ExecutionPhase.CANCELLED)
      }
    }
    contextStateMachines.clear()
  }

  const reset = (): void => {
    contextStateMachines.clear()
  }

  return { onContextLifecycle, hasActiveContexts, cancelAll, reset }
}
