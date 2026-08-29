/**
 * ExecutionStateMachine's transition table, covering both builds: development throws on a
 * disallowed transition, production warns, and neither applies it.
 */
import { afterEach, describe, expect, it } from '@jest/globals'

import { ExecutionStateMachine } from '../../../../cues/node/runtime/ExecutionStateMachine'
import { ExecutionPhase } from '../../../../cues/node/runtime/executionTypes'

const originalNodeEnv = process.env.NODE_ENV

/** Runs `body` with NODE_ENV set to 'production', so the warn-and-refuse branch is taken. */
function inProduction(body: () => void): void {
  process.env.NODE_ENV = 'production'
  try {
    body()
  } finally {
    process.env.NODE_ENV = originalNodeEnv
  }
}

describe('ExecutionStateMachine', () => {
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('starts idle and accepts the running -> completed path', () => {
    const sm = new ExecutionStateMachine()
    expect(sm.phase).toBe(ExecutionPhase.IDLE)
    sm.transitionTo(ExecutionPhase.RUNNING)
    sm.transitionTo(ExecutionPhase.COMPLETED)
    expect(sm.phase).toBe(ExecutionPhase.COMPLETED)
    expect(sm.isTerminal()).toBe(true)
  })

  it('throws on a transition the table disallows outside production', () => {
    const sm = new ExecutionStateMachine()
    sm.transitionTo(ExecutionPhase.RUNNING)
    sm.transitionTo(ExecutionPhase.COMPLETED)

    expect(() => sm.transitionTo(ExecutionPhase.RUNNING)).toThrow(/Invalid transition/)
  })

  it('refuses rather than applies a disallowed transition in production', () => {
    inProduction(() => {
      const sm = new ExecutionStateMachine()
      sm.transitionTo(ExecutionPhase.RUNNING)
      sm.transitionTo(ExecutionPhase.CANCELLED)

      expect(() => sm.transitionTo(ExecutionPhase.RUNNING)).not.toThrow()

      expect(sm.phase).toBe(ExecutionPhase.CANCELLED)
      expect(sm.isTerminal()).toBe(true)
    })
  })

  it('still allows valid transitions in production', () => {
    inProduction(() => {
      const sm = new ExecutionStateMachine()
      sm.transitionTo(ExecutionPhase.RUNNING)
      sm.transitionTo(ExecutionPhase.BLOCKED)
      sm.transitionTo(ExecutionPhase.RUNNING)
      expect(sm.phase).toBe(ExecutionPhase.RUNNING)
    })
  })

  it('returns to idle on reset, so a refused terminal phase is recoverable', () => {
    const sm = new ExecutionStateMachine()
    sm.transitionTo(ExecutionPhase.RUNNING)
    sm.transitionTo(ExecutionPhase.COMPLETED)
    sm.reset()
    expect(sm.phase).toBe(ExecutionPhase.IDLE)
    expect(sm.isTerminal()).toBe(false)
  })
})
