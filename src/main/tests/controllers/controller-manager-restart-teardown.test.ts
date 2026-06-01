import { describe, expect, it, jest } from '@jest/globals'

// Stub electron window helpers so setLifecyclePhase's broadcast is a no-op under test.
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerManager } from '../../controllers/ControllerManager'

/**
 * Bug #6: a teardown failure during restart (with no concurrent shutdown) must abort
 * reinitialization rather than calling init() on a partially torn-down graph.
 */
describe('ControllerManager.runRestartControllers teardown failure (Bug #6)', () => {
  it('aborts reinitialization and enters the failed phase when teardown throws', async () => {
    const init = jest.fn(() => Promise.resolve())
    const stub = Object.create(ControllerManager.prototype) as Record<string, unknown>
    stub.lifecyclePhase = 'running'
    stub.isInitialized = true
    stub.controllerShutdownPromise = null
    stub.listenerLifecycle = {
      yargRb3: { getIsYargEnabled: () => false, getIsRb3Enabled: () => false },
      audio: { getIsAudioEnabled: () => false },
    }
    stub.senderLifecycle = { getActiveOutputSenderSnapshotIfAny: () => null }
    stub.consoleMode = { getConsoleRestore: () => null }
    // Disposing a rig chain throws partway through teardown.
    stub.rigChains = [
      { rigId: 'merged', dispose: jest.fn(() => Promise.reject(new Error('dispose failed'))) },
    ]
    stub.dmxPublisher = { shutdown: jest.fn(() => Promise.resolve()) }
    stub.cueHandler = null
    stub.clock = { destroy: jest.fn() }
    // init() must NOT run if teardown failed.
    stub.init = init

    const runRestart = (
      ControllerManager.prototype as unknown as {
        runRestartControllers: (this: unknown) => Promise<void>
      }
    ).runRestartControllers

    await expect(runRestart.call(stub)).rejects.toThrow(/teardown failed/i)
    expect(init).not.toHaveBeenCalled()
    expect(stub.lifecyclePhase).toBe('failed')
    expect(stub.isInitialized).toBe(false)
  })
})
