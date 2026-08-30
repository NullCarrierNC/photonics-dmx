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
import { LifecycleAbortedError } from '../../controllers/ControllerLifecycle'
import type { ControllerGraph } from '../../controllers/ControllerGraph'
import type { RegistryInitializer } from '../../controllers/RegistryInitializer'
import type { SenderLifecycleController } from '../../controllers/SenderLifecycleController'
import { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

function stubConfig(): ConfigurationManager {
  const prefs: Record<string, unknown> = {
    motionEnabled: true,
    yargFallbackCueTimeMs: 20000,
  }
  return {
    getPreference: (key: string) => prefs[key],
    getAllPreferences: () => prefs,
    getCueGroupSelectionMode: () => 'withinSong',
  } as unknown as ConfigurationManager
}

/** The graph surface `init()` drives, with `buildChains` under the test's control. */
function stubGraph(buildChains: () => void): ControllerGraph {
  return {
    buildChains,
    buildPrimaryYargHandler: jest.fn(),
  } as unknown as ControllerGraph
}

function stubRegistryInit(): RegistryInitializer {
  return {
    initializeCueRegistry: jest.fn(async () => {}),
    initializeEffectLoader: jest.fn(async () => {}),
    initializeNodeCueLoader: jest.fn(async () => {}),
  } as unknown as RegistryInitializer
}

function stubSenderLifecycle(): SenderLifecycleController {
  return {
    ensureSenderManager: jest.fn(),
    setSenderErrorTrackingCallback: jest.fn(),
  } as unknown as SenderLifecycleController
}

function managerWith(buildChains: () => void): ControllerManager {
  return new ControllerManager({
    config: stubConfig(),
    graph: stubGraph(buildChains),
    collaborators: {
      registryInit: stubRegistryInit(),
      senderLifecycle: stubSenderLifecycle(),
    },
  })
}

describe('ControllerManager init failure', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('moves to the failed phase when init throws', async () => {
    const manager = managerWith(() => {
      throw new Error('bad config on disk')
    })

    await expect(manager.init()).rejects.toThrow('bad config on disk')

    expect(manager.getLifecyclePhase()).toBe('failed')
    expect(manager.getIsInitialized()).toBe(false)
  })

  it('broadcasts the failed phase so the renderer can offer a retry', async () => {
    const manager = managerWith(() => {
      throw new Error('bad config on disk')
    })

    await expect(manager.init()).rejects.toThrow()

    expect(sendToAllWindows).toHaveBeenCalledWith(
      RENDERER_RECEIVE.LIFECYCLE_PHASE_CHANGED,
      'failed',
    )
  })

  it('leaves the phase alone when init aborts against a shutdown', async () => {
    const manager = managerWith(() => {
      throw new LifecycleAbortedError('shutdown started')
    })

    await expect(manager.init()).rejects.toBeInstanceOf(LifecycleAbortedError)

    expect(manager.getLifecyclePhase()).toBe('initializing')
  })

  it('recovers to running when init is retried after the fault is cleared', async () => {
    let shouldThrow = true
    const manager = managerWith(() => {
      if (shouldThrow) {
        throw new Error('bad config on disk')
      }
    })

    await expect(manager.init()).rejects.toThrow()
    expect(manager.getLifecyclePhase()).toBe('failed')

    shouldThrow = false
    await manager.init()

    expect(manager.getLifecyclePhase()).toBe('running')
    expect(manager.getIsInitialized()).toBe(true)
  })
})
