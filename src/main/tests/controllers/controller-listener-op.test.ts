import { describe, expect, it, jest } from '@jest/globals'

// Stub electron so importing ControllerManager doesn't pull in a real BrowserWindow.
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerManager } from '../../controllers/ControllerManager'
import { setLogSink, type LogEntry } from '../../../shared/logger'

type RunListenerOp = <T>(op: () => Promise<T>) => Promise<T>

describe('ControllerManager.runListenerOp error handling', () => {
  it('logs a rejected op exactly once and still runs the next op', async () => {
    const errors: string[] = []
    setLogSink((entry: LogEntry) => {
      if (entry.level === 'error') {
        errors.push(entry.message)
      }
    })

    try {
      const fake = { listenerOpChain: Promise.resolve() } as unknown as ControllerManager
      const runListenerOp = (
        ControllerManager.prototype as unknown as { runListenerOp: RunListenerOp }
      ).runListenerOp

      const failing = runListenerOp.call(fake, () => Promise.reject(new Error('boom')))
      await expect(failing).rejects.toThrow('boom')

      // A later op still runs even though the previous one rejected.
      const ok = jest.fn<() => Promise<string>>().mockResolvedValue('done')
      await expect(runListenerOp.call(fake, ok)).resolves.toBe('done')
      expect(ok).toHaveBeenCalledTimes(1)

      // Let the chain-flatten continuation flush.
      await Promise.resolve()
      expect(errors.filter((m) => m.includes('Listener operation failed'))).toHaveLength(1)
    } finally {
      setLogSink(undefined)
    }
  })
})
