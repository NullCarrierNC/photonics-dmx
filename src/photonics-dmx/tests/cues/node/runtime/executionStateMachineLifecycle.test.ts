/**
 * createExecutionStateMachineLifecycle tracks one ExecutionStateMachine per context and exposes
 * the lifecycle callback NodeExecutionEngine drives. These tests pin the contract both the
 * cue/effect GraphExecutionEngine and the audio node-cue runtime depend on.
 */
import { describe, expect, it } from '@jest/globals'

import { createExecutionStateMachineLifecycle } from '../../../../cues/node/runtime/executionStateMachineLifecycle'

describe('createExecutionStateMachineLifecycle', () => {
  it('tracks a context as active from started until completed', () => {
    const lifecycle = createExecutionStateMachineLifecycle()
    expect(lifecycle.hasActiveContexts()).toBe(false)
    lifecycle.onContextLifecycle('ctx-1', 'started')
    expect(lifecycle.hasActiveContexts()).toBe(true)
    lifecycle.onContextLifecycle('ctx-1', 'completed')
    expect(lifecycle.hasActiveContexts()).toBe(false)
  })

  it('accepts the full started -> blocked -> running -> completed sequence', () => {
    const lifecycle = createExecutionStateMachineLifecycle()
    expect(() => {
      lifecycle.onContextLifecycle('ctx-1', 'started')
      lifecycle.onContextLifecycle('ctx-1', 'blocked')
      lifecycle.onContextLifecycle('ctx-1', 'running')
      lifecycle.onContextLifecycle('ctx-1', 'completed')
    }).not.toThrow()
    expect(lifecycle.hasActiveContexts()).toBe(false)
  })

  it('treats started -> cancelled as terminal', () => {
    const lifecycle = createExecutionStateMachineLifecycle()
    lifecycle.onContextLifecycle('ctx-1', 'started')
    lifecycle.onContextLifecycle('ctx-1', 'cancelled')
    expect(lifecycle.hasActiveContexts()).toBe(false)
  })

  it('ignores a redundant running event while already running', () => {
    const lifecycle = createExecutionStateMachineLifecycle()
    expect(() => {
      lifecycle.onContextLifecycle('ctx-1', 'started')
      // Only BLOCKED -> RUNNING transitions; a running event from RUNNING is a guarded no-op.
      lifecycle.onContextLifecycle('ctx-1', 'running')
      lifecycle.onContextLifecycle('ctx-1', 'completed')
    }).not.toThrow()
  })

  it('cancelAll terminates every tracked context and clears them', () => {
    const lifecycle = createExecutionStateMachineLifecycle()
    lifecycle.onContextLifecycle('ctx-1', 'started')
    lifecycle.onContextLifecycle('ctx-2', 'started')
    lifecycle.onContextLifecycle('ctx-2', 'blocked')
    expect(lifecycle.hasActiveContexts()).toBe(true)
    expect(() => lifecycle.cancelAll()).not.toThrow()
    expect(lifecycle.hasActiveContexts()).toBe(false)
  })

  it('treats a lifecycle event for an unknown or already-terminal context as a safe no-op', () => {
    const lifecycle = createExecutionStateMachineLifecycle()
    lifecycle.onContextLifecycle('ctx-1', 'started')
    lifecycle.onContextLifecycle('ctx-1', 'completed')
    expect(() => {
      lifecycle.onContextLifecycle('ctx-1', 'completed')
      lifecycle.onContextLifecycle('ctx-1', 'blocked')
      lifecycle.onContextLifecycle('never-started', 'running')
    }).not.toThrow()
    expect(lifecycle.hasActiveContexts()).toBe(false)
  })

  it('reset clears tracking without requiring a terminal transition', () => {
    const lifecycle = createExecutionStateMachineLifecycle()
    lifecycle.onContextLifecycle('ctx-1', 'started')
    expect(lifecycle.hasActiveContexts()).toBe(true)
    lifecycle.reset()
    expect(lifecycle.hasActiveContexts()).toBe(false)
  })
})
