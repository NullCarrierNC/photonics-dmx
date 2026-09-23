import { afterEach, describe, expect, it, jest } from '@jest/globals'

// Stub electron window helpers so the phase broadcast is a no-op under test.
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { resetLogConfiguration, setLogSink, type LogEntry } from '../../../shared/logger'
import { restartGraph, stubbedManager } from './lifecycleStub'

/**
 * When tearing controllers down during a restart fails and no shutdown is concurrently running,
 * the restart must abort and surface the failure instead of calling init() on top of a partially
 * torn-down graph, which would leave dangling listeners/timers publishing alongside the new ones.
 */
describe('ControllerManager restart when teardown fails', () => {
  afterEach(() => {
    resetLogConfiguration()
  })

  it('aborts reinitialization and enters the failed phase when a rig chain fails to dispose', async () => {
    const entries: LogEntry[] = []
    setLogSink((entry) => {
      entries.push(entry)
    })
    const disposeFailure = new Error('dispose failed')
    const graph = restartGraph()
    jest.mocked(graph.disposeChainsForRestart).mockImplementation(() => {
      throw disposeFailure
    })
    const { manager, lifecycle, listeners, init } = stubbedManager({ graph })

    await expect(manager.restartControllers()).rejects.toThrow(/teardown failed/i)
    expect(listeners.yargRb3.disableRb3).toHaveBeenCalled()
    expect(graph.shutdownPublisher).not.toHaveBeenCalled()
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 'error', data: [disposeFailure] }),
    )
    expect(init).not.toHaveBeenCalled()
    expect(lifecycle.phase).toBe('failed')
    expect(manager.getIsInitialized()).toBe(false)
  })
})
