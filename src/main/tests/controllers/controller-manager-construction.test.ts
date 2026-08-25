import { beforeEach, describe, expect, it, jest } from '@jest/globals'

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
import { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

/** Preferences a freshly constructed manager reads while wiring its sub-controllers. */
function stubConfig(overrides: Record<string, unknown> = {}): ConfigurationManager {
  const prefs: Record<string, unknown> = {
    motionEnabled: true,
    yargFallbackCueTimeMs: 20000,
    ...overrides,
  }
  return {
    getPreference: (key: string) => prefs[key],
    getAllPreferences: () => prefs,
    getCueGroupSelectionMode: () => 'withinSong',
  } as unknown as ConfigurationManager
}

describe('ControllerManager construction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('constructs with an injected configuration store', () => {
    const manager = new ControllerManager({ config: stubConfig() })
    expect(manager).toBeInstanceOf(ControllerManager)
  })

  it('starts in the initializing phase', () => {
    const manager = new ControllerManager({ config: stubConfig() })
    expect(manager.getLifecyclePhase()).toBe('initializing')
  })

  it('reads preferences through the injected store rather than the real config files', () => {
    const getPreference = jest.fn((key: string) =>
      key === 'motionEnabled' ? false : key === 'yargFallbackCueTimeMs' ? 1234 : undefined,
    )
    const config = {
      getPreference,
      getAllPreferences: () => ({}),
      getCueGroupSelectionMode: () => 'withinSong',
    } as unknown as ConfigurationManager

    const manager = new ControllerManager({ config })

    expect(manager.getConfig()).toBe(config)
  })

  it('reports an unbuilt controller graph before init', () => {
    const manager = new ControllerManager({ config: stubConfig() })
    expect(manager.getIsInitialized()).toBe(false)
    expect(manager.getLightingController()).toBeNull()
    expect(manager.getDmxLightManager()).toBeNull()
    expect(manager.getDmxPublisher()).toBeNull()
    expect(manager.getCueHandler()).toBeNull()
  })

  it('shutdown from initializing settles and reports the stopped phase', async () => {
    const manager = new ControllerManager({ config: stubConfig() })

    await manager.shutdown()

    expect(manager.getLifecyclePhase()).toBe('stopped')
  })

  it('shutdown is idempotent across repeated calls', async () => {
    const manager = new ControllerManager({ config: stubConfig() })

    await manager.shutdown()
    await manager.shutdown()

    expect(manager.getLifecyclePhase()).toBe('stopped')
  })

  it('broadcasts each lifecycle phase change to the renderer', async () => {
    const manager = new ControllerManager({ config: stubConfig() })

    await manager.shutdown()

    const phases = (sendToAllWindows as jest.Mock).mock.calls
      .filter(([channel]) => channel === RENDERER_RECEIVE.LIFECYCLE_PHASE_CHANGED)
      .map(([, phase]) => phase)
    expect(phases).toContain('shuttingDown')
    expect(phases).toContain('stopped')
  })

  it('rejects restartControllers while the phase is still initializing', async () => {
    const manager = new ControllerManager({ config: stubConfig() })

    await expect(manager.restartControllers()).rejects.toThrow(/invalid lifecycle/)
  })
})
