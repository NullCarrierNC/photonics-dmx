import { describe, expect, it, jest } from '@jest/globals'
import type { Logger } from '../../shared/logger'
import { TeardownSteps } from './teardownSteps'

function recordingLogger(): Logger & { error: jest.Mock } {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}

describe('TeardownSteps', () => {
  it('runs every step after one throws, then throws the first failure', () => {
    const log = recordingLogger()
    const steps = new TeardownSteps(log)
    const first = new Error('first')
    const ran: string[] = []

    steps.run('stopping a', () => {
      ran.push('a')
      throw first
    })
    steps.run('stopping b', () => {
      ran.push('b')
      throw new Error('second')
    })
    steps.run('stopping c', () => {
      ran.push('c')
    })

    expect(ran).toEqual(['a', 'b', 'c'])
    expect(log.error).toHaveBeenCalledWith('Error stopping a:', first)
    expect(log.error).toHaveBeenCalledTimes(2)
    expect(() => steps.rethrowFirst()).toThrow(first)
  })

  it('throws nothing when every step completes', () => {
    const steps = new TeardownSteps(recordingLogger())
    steps.run('stopping a', () => {})

    expect(() => steps.rethrowFirst()).not.toThrow()
  })
})
