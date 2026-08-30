import { describe, expect, it, jest } from '@jest/globals'

// Stub electron so importing the lifecycle module doesn't pull in a real BrowserWindow.
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerLifecycle, LifecycleAbortedError } from '../../controllers/ControllerLifecycle'
import { setLogSink, type LogEntry } from '../../../shared/logger'

describe('ControllerLifecycle.runOp error handling', () => {
  it('logs a rejected op exactly once and still runs the next op', async () => {
    const errors: string[] = []
    setLogSink((entry: LogEntry) => {
      if (entry.level === 'error') {
        errors.push(entry.message)
      }
    })

    try {
      const lifecycle = new ControllerLifecycle(() => {})

      const failing = lifecycle.runOp(() => Promise.reject(new Error('boom')))
      await expect(failing).rejects.toThrow('boom')

      // A later op still runs even though the previous one rejected.
      const ok = jest.fn<() => Promise<string>>().mockResolvedValue('done')
      await expect(lifecycle.runOp(ok)).resolves.toBe('done')
      expect(ok).toHaveBeenCalledTimes(1)

      // Let the chain-flatten continuation flush.
      await Promise.resolve()
      expect(errors.filter((m) => m.includes('Lifecycle operation failed'))).toHaveLength(1)
    } finally {
      setLogSink(undefined)
    }
  })

  it('logs a LifecycleAbortedError at info, not error', async () => {
    const infos: string[] = []
    const errors: string[] = []
    setLogSink((entry: LogEntry) => {
      if (entry.level === 'info') infos.push(entry.message)
      if (entry.level === 'error') errors.push(entry.message)
    })

    try {
      const lifecycle = new ControllerLifecycle(() => {})

      const aborted = lifecycle.runOp(() =>
        Promise.reject(new LifecycleAbortedError('shutdown in progress')),
      )
      await expect(aborted).rejects.toBeInstanceOf(LifecycleAbortedError)

      await Promise.resolve()
      expect(infos.filter((m) => m.includes('Lifecycle operation aborted'))).toHaveLength(1)
      expect(errors.filter((m) => m.includes('Lifecycle operation'))).toHaveLength(0)
    } finally {
      setLogSink(undefined)
    }
  })
})
