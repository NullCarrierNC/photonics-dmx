/**
 * Initialisation is reached from several places at once: the cold start, a retry from the renderer,
 * a listener toggle and console mode. One graph is built whichever of them arrive together, and a
 * shutdown waits for a build already under way rather than tearing down beneath it.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
}))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

jest.mock('../../utils/copyDefaultData', () => ({
  copyDefaultData: jest.fn(async () => {}),
}))

jest.mock('../../controllers/cueDomainBindings', () => ({
  CUE_DOMAIN_BINDINGS: [{ domain: 'yarg' }],
  applyAllEnabledGroupsFromConfig: jest.fn(async () => {}),
}))

import { ControllerManager } from '../../controllers/ControllerManager'
import type { ControllerGraph } from '../../controllers/ControllerGraph'
import type { RegistryInitializer } from '../../controllers/RegistryInitializer'
import type { SenderLifecycleController } from '../../controllers/SenderLifecycleController'
import type { ListenerLifecycleController } from '../../controllers/ListenerLifecycleController'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'

function stubConfig(): ConfigurationManager {
  const prefs: Record<string, unknown> = { motionEnabled: true, yargFallbackCueTimeMs: 20000 }
  return {
    getPreference: (key: string) => prefs[key],
    getAllPreferences: () => prefs,
    getCueGroupSelectionMode: () => 'withinSong',
  } as unknown as ConfigurationManager
}

type Steps = {
  manager: ControllerManager
  order: string[]
  buildChains: jest.Mock
  releaseRegistry: () => void
}

/** A manager whose cue-registry step the test holds open, so a build can be caught mid-flight. */
function makeManager(): Steps {
  const order: string[] = []
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  const buildChains = jest.fn(() => {
    order.push('buildChains')
  })
  const graph = {
    buildChains,
    buildPrimaryYargHandler: jest.fn(() => {
      order.push('initDone')
    }),
    disposeLoaders: jest.fn(async () => {}),
    shutdownDomainCueHandlerRefs: jest.fn(),
    disposeChainsForShutdown: jest.fn(() => {
      order.push('teardown')
    }),
    shutdownPublisherSafe: jest.fn(),
    destroyClock: jest.fn(),
  } as unknown as ControllerGraph

  const registryInit = {
    initializeCueRegistry: jest.fn(async () => {
      await held
    }),
    initializeEffectLoader: jest.fn(async () => {}),
    initializeNodeCueLoader: jest.fn(async () => {}),
  } as unknown as RegistryInitializer

  const senderLifecycle = {
    ensureSenderManager: jest.fn(),
    setSenderErrorTrackingCallback: jest.fn(),
    shutdownSenderOnAppExit: jest.fn(async () => {}),
    getSenderManager: jest.fn(),
  } as unknown as SenderLifecycleController

  const listenerLifecycle = {
    yargRb3: {
      disableYarg: jest.fn(async () => {}),
      disableRb3: jest.fn(async () => {}),
    },
    audio: { disableAudio: jest.fn(async () => {}) },
  } as unknown as ListenerLifecycleController

  const manager = new ControllerManager({
    config: stubConfig(),
    graph,
    collaborators: { registryInit, senderLifecycle, listenerLifecycle },
  })

  return { manager, order, buildChains, releaseRegistry: release }
}

describe('ControllerManager init sharing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('builds the graph once when two inits arrive together', async () => {
    const { manager, buildChains, releaseRegistry } = makeManager()

    const first = manager.init()
    const second = manager.init()
    releaseRegistry()
    await Promise.all([first, second])

    expect(buildChains).toHaveBeenCalledTimes(1)
  })

  it('tears down after a build that is already under way', async () => {
    const { manager, order, releaseRegistry } = makeManager()

    const initializing = manager.init()
    const stopping = manager.shutdown()
    releaseRegistry()
    await Promise.all([initializing, stopping])

    expect(order).toEqual(['buildChains', 'initDone', 'teardown'])
  })
})
