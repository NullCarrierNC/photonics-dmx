import { describe, expect, it, jest } from '@jest/globals'

// ConfigFile and the loaders resolve their base directory from app.getPath('appData').
jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
}))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerManager } from '../../controllers/ControllerManager'
import type { ControllerGraph } from '../../controllers/ControllerGraph'
import type { SenderLifecycleController } from '../../controllers/SenderLifecycleController'
import type { ListenerLifecycleController } from '../../controllers/ListenerLifecycleController'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'

/** Preferences a freshly constructed manager reads while wiring its sub-controllers. */
function stubConfig(): ConfigurationManager {
  const prefs: Record<string, unknown> = { motionEnabled: true, yargFallbackCueTimeMs: 20000 }
  return {
    getPreference: (key: string) => prefs[key],
    getAllPreferences: () => prefs,
    getCueGroupSelectionMode: () => 'withinSong',
  } as unknown as ConfigurationManager
}

interface ShutdownMocks {
  disableYarg: jest.Mock
  disableRb3: jest.Mock
  disableAudio: jest.Mock
  disposeChains: jest.Mock
  publisherShutdown: jest.Mock
  senderShutdown: jest.Mock
}

/** A manager whose listeners, graph teardown steps and sender exit are all observable mocks. */
function makeManager(overrides: Partial<ShutdownMocks> = {}): {
  manager: ControllerManager
  mocks: ShutdownMocks
} {
  const resolved = () => jest.fn().mockImplementation(() => Promise.resolve())
  const mocks: ShutdownMocks = {
    disableYarg: overrides.disableYarg ?? resolved(),
    disableRb3: overrides.disableRb3 ?? resolved(),
    disableAudio: overrides.disableAudio ?? resolved(),
    disposeChains: overrides.disposeChains ?? resolved(),
    publisherShutdown: overrides.publisherShutdown ?? resolved(),
    senderShutdown: overrides.senderShutdown ?? resolved(),
  }
  const graph = {
    disposeLoaders: jest.fn().mockImplementation(() => Promise.resolve()),
    shutdownDomainCueHandlerRefs: jest.fn(),
    disposeChainsForShutdown: mocks.disposeChains,
    shutdownPublisherSafe: mocks.publisherShutdown,
    destroyClock: jest.fn(),
  } as unknown as ControllerGraph
  const listenerLifecycle = {
    yargRb3: { disableYarg: mocks.disableYarg, disableRb3: mocks.disableRb3 },
    audio: { disableAudio: mocks.disableAudio },
  } as unknown as ListenerLifecycleController
  const senderLifecycle = {
    shutdownSenderOnAppExit: mocks.senderShutdown,
    getSenderManager: jest.fn(),
  } as unknown as SenderLifecycleController
  const manager = new ControllerManager({
    config: stubConfig(),
    collaborators: { listenerLifecycle, senderLifecycle },
    graph,
  })
  return { manager, mocks }
}

describe('ControllerManager.shutdown idempotency', () => {
  it('second shutdown is a no-op after the first completes', async () => {
    const { manager, mocks } = makeManager()

    await manager.shutdown()
    await manager.shutdown()

    expect(mocks.disableYarg).toHaveBeenCalledTimes(1)
    expect(mocks.disableRb3).toHaveBeenCalledTimes(1)
    expect(mocks.disableAudio).toHaveBeenCalledTimes(1)
    expect(mocks.disposeChains).toHaveBeenCalledTimes(1)
    expect(mocks.publisherShutdown).toHaveBeenCalledTimes(1)
    expect(mocks.senderShutdown).toHaveBeenCalledTimes(1)
    expect(manager.getLifecyclePhase()).toBe('stopped')
  })

  it('concurrent shutdowns share a single in-flight promise', async () => {
    let releaseInner!: () => void
    const inner = new Promise<void>((r) => {
      releaseInner = r
    })
    const senderShutdown = jest.fn().mockImplementation(() => inner)
    const { manager, mocks } = makeManager({ senderShutdown })

    const p1 = manager.shutdown()
    const p2 = manager.shutdown()
    releaseInner()
    await Promise.all([p1, p2])

    expect(mocks.senderShutdown).toHaveBeenCalledTimes(1)
    expect(manager.getLifecyclePhase()).toBe('stopped')
  })

  it('per-step rejections are caught and shutdown still completes', async () => {
    // Per-step try/catch wrappers (e.g. around disableYarg) swallow rejections; the overall
    // shutdown should still mark the controller stopped so callers do not retry forever.
    const disableYarg = jest.fn().mockImplementation(() => Promise.reject(new Error('boom')))
    const { manager, mocks } = makeManager({ disableYarg })

    await manager.shutdown()

    expect(mocks.disableYarg).toHaveBeenCalledTimes(1)
    expect(manager.getLifecyclePhase()).toBe('stopped')
  })

  it('a rejected teardown stays retryable, and a retry that succeeds completes the shutdown', async () => {
    const disposeChains = jest
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('teardown failed')))
      .mockImplementation(() => Promise.resolve())
    const { manager, mocks } = makeManager({ disposeChains })

    await expect(manager.shutdown()).rejects.toThrow(/teardown failed/)
    expect(manager.getLifecyclePhase()).not.toBe('stopped')

    await manager.shutdown()
    expect(mocks.disposeChains).toHaveBeenCalledTimes(2)
    expect(manager.getLifecyclePhase()).toBe('stopped')
  })
})
