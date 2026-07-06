import { describe, expect, it, jest } from '@jest/globals'

// Stub electron so importing ControllerManager doesn't pull in a real BrowserWindow.
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerManager, LifecycleAbortedError } from '../../controllers/ControllerManager'
import { setLogSink, type LogEntry } from '../../../shared/logger'

type RunLifecycleOp = <T>(op: () => Promise<T>) => Promise<T>

const getRunLifecycleOp = () =>
  (ControllerManager.prototype as unknown as { runLifecycleOp: RunLifecycleOp }).runLifecycleOp

describe('ControllerManager.runLifecycleOp error handling', () => {
  it('logs a rejected op exactly once and still runs the next op', async () => {
    const errors: string[] = []
    setLogSink((entry: LogEntry) => {
      if (entry.level === 'error') {
        errors.push(entry.message)
      }
    })

    try {
      const fake = { lifecycleOpChain: Promise.resolve() } as unknown as ControllerManager
      const runLifecycleOp = getRunLifecycleOp()

      const failing = runLifecycleOp.call(fake, () => Promise.reject(new Error('boom')))
      await expect(failing).rejects.toThrow('boom')

      // A later op still runs even though the previous one rejected.
      const ok = jest.fn<() => Promise<string>>().mockResolvedValue('done')
      await expect(runLifecycleOp.call(fake, ok)).resolves.toBe('done')
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
      const fake = { lifecycleOpChain: Promise.resolve() } as unknown as ControllerManager
      const runLifecycleOp = getRunLifecycleOp()

      const aborted = runLifecycleOp.call(fake, () =>
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
