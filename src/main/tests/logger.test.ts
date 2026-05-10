import { describe, expect, it } from '@jest/globals'
import {
  createLogger,
  resetLogConfiguration,
  setLogSink,
  setMinLogLevel,
} from '../../shared/logger'
import { withCapturedLogEntries } from './captureLogSink'

describe('createLogger', () => {
  it('prefixes messages with scope and passes extra args', () => {
    expect.assertions(5)
    const result = withCapturedLogEntries((entries) => {
      const log = createLogger('TestScope')
      log.info('hello', 1, { a: 2 })
      return entries
    })
    expect(result).toHaveLength(1)
    expect(result[0].level).toBe('info')
    expect(result[0].scope).toBe('TestScope')
    expect(result[0].message).toBe('hello')
    expect(result[0].data).toEqual([1, { a: 2 }])
  })

  it('restores default sink after withCapturedLogEntries', () => {
    expect.assertions(1)
    withCapturedLogEntries(() => {
      const log = createLogger('X')
      log.warn('y')
    })
    expect(() => resetLogConfiguration()).not.toThrow()
  })
})

describe('setLogSink', () => {
  it('allows tests to assert on error logs without printing them', () => {
    setMinLogLevel('debug')
    const received: { message: string }[] = []
    setLogSink((e) => {
      if (e.level === 'error') {
        received.push({ message: e.message })
      }
    })
    try {
      expect.assertions(1)
      const log = createLogger('Isolated')
      log.error('expected failure message')
      expect(received.map((r) => r.message)).toEqual(['expected failure message'])
    } finally {
      resetLogConfiguration()
    }
  })
})
