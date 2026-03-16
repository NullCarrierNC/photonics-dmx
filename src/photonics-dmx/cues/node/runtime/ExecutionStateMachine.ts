/**
 * Explicit execution state machine for graph runs.
 * Layered alongside the existing ExecutionContext-based runtime; provides testable lifecycle transitions (RUNNING, COMPLETED, CANCELLED).
 * Currently instantiated by GraphExecutionEngine per execution context when running cue graphs.
 */

import { ExecutionPhase } from './executionTypes'

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

  transitionTo(next: ExecutionPhase): void {
    const allowed = VALID_TRANSITIONS[this._phase]
    if (allowed === undefined || !allowed.includes(next)) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `[ExecutionStateMachine] Invalid transition: ${this._phase} -> ${next}. Allowed from ${this._phase}: ${allowed?.join(', ') ?? 'none'}`,
        )
      }
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
