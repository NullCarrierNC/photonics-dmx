/**
 * One input drives the rig at a time. The toggles in the renderer switch the others off, and main
 * holds the same rule so a renderer that does not, or a restore that brings back a pair, cannot
 * leave two inputs writing to one rig.
 */
import { describe, expect, it, jest } from '@jest/globals'

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

function stubConfig(): ConfigurationManager {
  const prefs: Record<string, unknown> = { motionEnabled: true, yargFallbackCueTimeMs: 20000 }
  return {
    getPreference: (key: string) => prefs[key],
    getAllPreferences: () => prefs,
    getCueGroupSelectionMode: () => 'withinSong',
  } as unknown as ConfigurationManager
}

interface InputMocks {
  enableYarg: jest.Mock
  disableYarg: jest.Mock
  enableRb3: jest.Mock
  disableRb3: jest.Mock
  enableAudio: jest.Mock
  disableAudio: jest.Mock
}

/** A manager whose three input toggles are observable mocks. */
function makeManager(): { manager: ControllerManager; mocks: InputMocks } {
  const resolved = (): jest.Mock => jest.fn().mockImplementation(() => Promise.resolve())
  const mocks: InputMocks = {
    enableYarg: resolved(),
    disableYarg: resolved(),
    enableRb3: resolved(),
    disableRb3: resolved(),
    enableAudio: resolved(),
    disableAudio: resolved(),
  }
  const graph = {
    disposeLoaders: resolved(),
    shutdownDomainCueHandlerRefs: jest.fn(),
    disposeChainsForShutdown: jest.fn(),
    shutdownPublisherSafe: jest.fn(),
    destroyClock: jest.fn(),
  } as unknown as ControllerGraph
  const listenerLifecycle = {
    yargRb3: {
      enableYarg: mocks.enableYarg,
      disableYarg: mocks.disableYarg,
      enableRb3: mocks.enableRb3,
      disableRb3: mocks.disableRb3,
    },
    audio: { enableAudio: mocks.enableAudio, disableAudio: mocks.disableAudio },
  } as unknown as ListenerLifecycleController
  const senderLifecycle = {
    shutdownSenderOnAppExit: resolved(),
    getSenderManager: jest.fn(),
  } as unknown as SenderLifecycleController
  const manager = new ControllerManager({
    config: stubConfig(),
    collaborators: { listenerLifecycle, senderLifecycle },
    graph,
  })
  return { manager, mocks }
}

describe('one input drives the rig at a time', () => {
  it('switches audio off when YARG is enabled', async () => {
    const { manager, mocks } = makeManager()

    await manager.enableYarg()

    expect(mocks.disableAudio).toHaveBeenCalled()
    expect(mocks.enableYarg).toHaveBeenCalled()
  })

  it('switches audio off when RB3 is enabled', async () => {
    const { manager, mocks } = makeManager()

    await manager.enableRb3()

    expect(mocks.disableAudio).toHaveBeenCalled()
    expect(mocks.enableRb3).toHaveBeenCalled()
  })

  it('switches both listeners off when audio is enabled', async () => {
    const { manager, mocks } = makeManager()

    await manager.enableAudio()

    expect(mocks.disableYarg).toHaveBeenCalled()
    expect(mocks.disableRb3).toHaveBeenCalled()
    expect(mocks.enableAudio).toHaveBeenCalled()
  })
})
