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

import { ControllerManager, LifecycleAbortedError } from '../../controllers/ControllerManager'
import type { ControllerGraph } from '../../controllers/ControllerGraph'
import type { SenderLifecycleController } from '../../controllers/SenderLifecycleController'
import type { ListenerLifecycleController } from '../../controllers/ListenerLifecycleController'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import { restartGraph, senderLifecycleStub, stubbedManager } from './lifecycleStub'

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
    disposeChains: overrides.disposeChains ?? jest.fn(),
    publisherShutdown: overrides.publisherShutdown ?? jest.fn(),
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

  it('darkens the rig before the listener teardown that might hang', async () => {
    // Application.shutdown arms a hard exit over the whole sequence, and the listener disables are
    // network and audio work. The publisher marks itself shut down before it blacks out, so
    // running it first is what keeps a slow teardown from leaving the rig lit.
    const order: string[] = []
    const track = (name: string): jest.Mock =>
      (jest.fn() as jest.Mock).mockImplementation(() => {
        order.push(name)
        return Promise.resolve()
      })
    const { manager } = makeManager({
      publisherShutdown: track('publisher'),
      disableYarg: track('yarg'),
      disableRb3: track('rb3'),
      disableAudio: track('audio'),
      senderShutdown: track('senders'),
    })

    await manager.shutdown()

    expect(order[0]).toBe('publisher')
    expect(order).toEqual(['publisher', 'yarg', 'rb3', 'audio', 'senders'])
  })

  it('a rejected teardown stays retryable, and a retry that succeeds completes the shutdown', async () => {
    const disposeChains = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('teardown failed')
      })
      .mockImplementation(() => {})
    const { manager, mocks } = makeManager({ disposeChains })

    await expect(manager.shutdown()).rejects.toThrow(/teardown failed/)
    expect(manager.getLifecyclePhase()).not.toBe('stopped')

    await manager.shutdown()
    expect(mocks.disposeChains).toHaveBeenCalledTimes(2)
    expect(manager.getLifecyclePhase()).toBe('stopped')
  })
})

describe('ControllerManager.shutdown during an input enable', () => {
  const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

  it('blacks out, then disables the listener once the enable in flight has bound it', async () => {
    const { manager, listeners, graph } = stubbedManager()
    const order: string[] = []
    let bind!: () => void
    listeners.yargRb3.enableYarg.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          bind = () => {
            order.push('enabled')
            resolve()
          }
        }),
    )
    listeners.yargRb3.disableYarg.mockImplementation(async () => {
      order.push('disabled')
    })

    const enabling = manager.enableYarg()
    await settle()
    const shutdown = manager.shutdown()
    await settle()

    expect(graph.shutdownPublisherSafe).toHaveBeenCalledTimes(1)
    expect(order).toEqual([])

    bind()
    await Promise.all([enabling, shutdown])

    expect(order).toEqual(['enabled', 'disabled'])
    expect(manager.getLifecyclePhase()).toBe('stopped')
  })
})

describe('ControllerManager.shutdown with a sender op queued behind it', () => {
  it('refuses the op and leaves no sender open after the shutdown', async () => {
    const open = new Set<string>()
    const senderManager = {
      isSenderEnabled: (id: string) => open.has(id),
      enableSender: async (id: string) => {
        open.add(id)
      },
    }
    const senders = senderLifecycleStub()
    senders.getSenderManager.mockReturnValue(senderManager)
    senders.shutdownSenderOnAppExit.mockImplementation(async () => {
      open.clear()
    })
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const graph = restartGraph()
    jest.mocked(graph.disposeLoaders).mockImplementation(() => held)
    const { manager } = stubbedManager({ graph, senders })

    const stopping = manager.shutdown()
    const toggled = manager.runSenderOp(async (m) => {
      if (!m.isSenderEnabled('ipc')) {
        await m.enableSender('ipc', 'ipc', { sender: 'ipc' })
      }
    })
    release()
    await stopping

    await expect(toggled).rejects.toThrow(LifecycleAbortedError)
    expect([...open]).toEqual([])
  })
})
