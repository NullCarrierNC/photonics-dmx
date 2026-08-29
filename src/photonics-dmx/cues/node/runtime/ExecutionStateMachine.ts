/**
 * Explicit execution state machine for graph runs.
 * Layered alongside the existing ExecutionContext-based runtime; provides testable lifecycle transitions (RUNNING, COMPLETED, CANCELLED).
 * Instantiated per execution context by `createExecutionStateMachineLifecycle`, which both the
 * cue/effect GraphExecutionEngine and the audio node-cue runtime use to track context lifecycles.
 */

import { ExecutionPhase } from './executionTypes'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('ExecutionStateMachine')

const VALID_TRANSITIONS: Partial<Record<ExecutionPhase, ExecutionPhase[]>> = {
  [ExecutionPhase.IDLE]: [ExecutionPhase.RUNNING],
  [ExecutionPhase.RUNNING]: [
    ExecutionPhase.BLOCKED,
    ExecutionPhase.COMPLETED,
    ExecutionPhase.CANCELLED,
  ],
  [ExecutionPhase.BLOCKED]: [
    ExecutionPhase.RUNNING,
    ExecutionPhase.COMPLETED,
    ExecutionPhase.CANCELLED,
  ],
  [ExecutionPhase.COMPLETED]: [],
  [ExecutionPhase.CANCELLED]: [],
}

export class ExecutionStateMachine {
  private _phase: ExecutionPhase = ExecutionPhase.IDLE

  get phase(): ExecutionPhase {
    return this._phase
  }

  /**
   * Move to `next`, or refuse when the table disallows it from the current phase.
   *
   * A refused transition leaves the phase alone in every build, so a completed or cancelled run
   * cannot report itself running again. Development throws, production warns and carries on.
   */
  transitionTo(next: ExecutionPhase): void {
    const allowed = VALID_TRANSITIONS[this._phase]
    if (allowed === undefined || !allowed.includes(next)) {
      const message = `[ExecutionStateMachine] Invalid transition: ${this._phase} -> ${next}. Allowed from ${this._phase}: ${allowed?.join(', ') ?? 'none'}`
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(message)
      }
      log.warn(message)
      return
    }
    this._phase = next
  }

  reset(): void {
    this._phase = ExecutionPhase.IDLE
  }

  isTerminal(): boolean {
    return this._phase === ExecutionPhase.COMPLETED || this._phase === ExecutionPhase.CANCELLED
  }
}
