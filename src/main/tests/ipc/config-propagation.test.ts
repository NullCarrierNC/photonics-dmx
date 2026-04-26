/**
 * Config-propagation IPC tests: verifies that SAVE_DMX_RIG, setConsoleFixtureConfig, and
 * DELETE_DMX_RIG trigger the correct controller restart/refresh strategy.
 *
 * Regression coverage for the config-staleness bugs fixed alongside the inversion pipeline:
 *   - Bug 2: SAVE_DMX_RIG didn't call restartControllers when config fields changed
 *   - Bug 3: setConsoleFixtureConfig only called refreshActiveRigs, leaving sequencer stale
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ConfigStrobeType } from '../../../photonics-dmx/types'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { LIGHT } from '../../../shared/ipcChannels'

// --- Mocks set up before any imports that use them ---

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<any>,
  on: jest.fn() as jest.MockedFunction<any>,
}

// Config object returned by controllerManager.getConfig()
const mockConfig = {
  getDmxRig: jest.fn(),
  saveDmxRig: jest.fn().mockImplementation(() => Promise.resolve()),
  deleteDmxRig: jest.fn().mockImplementation(() => Promise.resolve()),
  getDmxRigs: jest.fn().mockImplementation(() => Promise.resolve([])),
  getLightLibrary: jest.fn().mockReturnValue([]),
  getUserLights: jest.fn().mockReturnValue([]),
  getLightingLayout: jest.fn().mockReturnValue(null),
  updateUserLights: jest.fn().mockImplementation(() => Promise.resolve()),
  getAllPreferences: jest.fn().mockReturnValue({}),
}

const mockControllerManager = {
  getConfig: jest.fn().mockReturnValue(mockConfig),
  restartControllers: jest.fn().mockImplementation(() => Promise.resolve()),
  refreshActiveRigs: jest.fn(),
  setConsoleFixtureConfig: jest.fn().mockImplementation(() => Promise.resolve({ success: true })),
  flushValidationErrors: jest.fn().mockReturnValue([]),
  getIsInitialized: jest.fn().mockReturnValue(true),
}

const mockSendToAllWindows = jest.fn()

jest.mock('electron', () => ({
  app: { getVersion: jest.fn().mockReturnValue('1.0.0') },
  ipcMain: mockIpcMain,
}))

jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: mockSendToAllWindows }))

// These registries are imported inside config-handlers; mock them to avoid side effects
jest.mock('../../../photonics-dmx/cues', () => ({}))
jest.mock('../../../photonics-dmx/cues/registries/YargCueRegistry', () => ({
  YargCueRegistry: {
    getInstance: jest.fn().mockReturnValue({
      getRegisteredMotionGroupIds: jest.fn().mockReturnValue([]),
      setEnabledMotionGroups: jest.fn(),
      setDisabledMotionCues: jest.fn(),
    }),
  },
}))
jest.mock('../../../photonics-dmx/cues/registries/AudioCueRegistry', () => ({
  AudioCueRegistry: {
    getInstance: jest.fn().mockReturnValue({
      getRegisteredMotionGroupIds: jest.fn().mockReturnValue([]),
      setEnabledMotionGroups: jest.fn(),
      setDisabledMotionCues: jest.fn(),
    }),
  },
}))
jest.mock('../../../photonics-dmx/helpers/dmxHelpers', () => ({
  setGlobalBrightnessConfig: jest.fn(),
}))

import { setupConfigHandlers } from '../../ipc/config-handlers'
import { setupConsoleHandlers } from '../../ipc/console-handlers'

/** Build a minimal valid DmxRig payload for SAVE_DMX_RIG. */
function makeRig(id: string, active: boolean) {
  return {
    id,
    name: 'Test Rig',
    active,
    config: {
      numLights: 0,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.None,
      frontLights: [],
      backLights: [],
      strobeLights: [],
    },
  }
}

/** Capture all handlers registered via ipcMain.handle into a lookup map. */
function captureHandlers(): Map<string, (event: unknown, ...args: any[]) => Promise<any>> {
  const handlers = new Map<string, (event: unknown, ...args: any[]) => Promise<any>>()
  mockIpcMain.handle.mockImplementation((channel: string, handler: any) => {
    handlers.set(channel, handler)
  })
  mockIpcMain.on.mockImplementation((channel: string, handler: any) => {
    handlers.set(channel, handler)
  })
  return handlers
}

describe('SAVE_DMX_RIG config propagation', () => {
  let handlers: Map<string, (event: unknown, ...args: any[]) => Promise<any>>

  beforeEach(() => {
    jest.clearAllMocks()
    mockConfig.saveDmxRig.mockImplementation(() => Promise.resolve())
    handlers = captureHandlers()
    setupConfigHandlers(mockIpcMain as any, mockControllerManager as any)
  })

  it('calls restartControllers when saving an active rig', async () => {
    mockConfig.getDmxRig.mockReturnValue(null) // new rig, no previous state
    const handler = handlers.get(CONFIG.SAVE_DMX_RIG)!
    const rig = makeRig('rig-1', true)
    await handler({}, rig)
    expect(mockControllerManager.restartControllers).toHaveBeenCalledTimes(1)
    expect(mockSendToAllWindows).toHaveBeenCalledWith(
      RENDERER_RECEIVE.CONTROLLERS_RESTARTED,
      undefined,
    )
  })

  it('calls restartControllers when deactivating a previously active rig', async () => {
    // Previous state: active. New state: inactive.
    mockConfig.getDmxRig.mockReturnValue({ active: true })
    const handler = handlers.get(CONFIG.SAVE_DMX_RIG)!
    const rig = makeRig('rig-1', false)
    await handler({}, rig)
    expect(mockControllerManager.restartControllers).toHaveBeenCalledTimes(1)
  })

  it('does not call restartControllers when saving an inactive rig that was never active', async () => {
    mockConfig.getDmxRig.mockReturnValue(null) // no previous state → previously inactive
    const handler = handlers.get(CONFIG.SAVE_DMX_RIG)!
    const rig = makeRig('rig-1', false)
    await handler({}, rig)
    expect(mockControllerManager.restartControllers).not.toHaveBeenCalled()
    expect(mockControllerManager.refreshActiveRigs).not.toHaveBeenCalled()
  })

  it('returns { success: true } on a valid save', async () => {
    mockConfig.getDmxRig.mockReturnValue(null)
    const handler = handlers.get(CONFIG.SAVE_DMX_RIG)!
    const result = await handler({}, makeRig('rig-2', false))
    expect(result).toEqual({ success: true })
  })

  it('returns { success: false } for invalid payload', async () => {
    const handler = handlers.get(CONFIG.SAVE_DMX_RIG)!
    const result = await handler({}, { notAValidRig: true })
    expect(result.success).toBe(false)
    expect(mockControllerManager.restartControllers).not.toHaveBeenCalled()
  })
})

describe('setConsoleFixtureConfig propagation', () => {
  let handlers: Map<string, (event: unknown, ...args: any[]) => Promise<any>>

  beforeEach(() => {
    jest.clearAllMocks()
    handlers = captureHandlers()
    setupConsoleHandlers(mockIpcMain as any, mockControllerManager as any)
  })

  it('delegates to setConsoleFixtureConfig on ControllerManager', async () => {
    const handler = handlers.get(LIGHT.CONSOLE_SET_FIXTURE_CONFIG)!
    const payload = {
      rigId: 'rig-1',
      lightId: 'light-1',
      fixtureId: 'fixture-1',
      config: { invertPan: true },
    }
    const result = await handler({}, payload)
    expect(mockControllerManager.setConsoleFixtureConfig).toHaveBeenCalledWith({
      rigId: 'rig-1',
      lightId: 'light-1',
      fixtureId: 'fixture-1',
      config: { invertPan: true },
    })
    expect(result).toEqual({ success: true })
    expect(mockSendToAllWindows).toHaveBeenCalledWith(
      RENDERER_RECEIVE.CONTROLLERS_RESTARTED,
      undefined,
    )
  })

  it('returns { success: false } for invalid payload', async () => {
    const handler = handlers.get(LIGHT.CONSOLE_SET_FIXTURE_CONFIG)!
    const result = await handler({}, { missingFields: true })
    expect(result.success).toBe(false)
    expect(mockControllerManager.setConsoleFixtureConfig).not.toHaveBeenCalled()
  })
})

describe('DELETE_DMX_RIG propagation', () => {
  let handlers: Map<string, (event: unknown, ...args: any[]) => Promise<any>>

  beforeEach(() => {
    jest.clearAllMocks()
    mockConfig.deleteDmxRig.mockImplementation(() => Promise.resolve())
    handlers = captureHandlers()
    setupConfigHandlers(mockIpcMain as any, mockControllerManager as any)
  })

  it('calls restartControllers when deleting an active rig', async () => {
    mockConfig.getDmxRig.mockReturnValue({ active: true })
    const handler = handlers.get(CONFIG.DELETE_DMX_RIG)!
    await handler({}, 'rig-1')
    expect(mockControllerManager.restartControllers).toHaveBeenCalledTimes(1)
    expect(mockSendToAllWindows).toHaveBeenCalledWith(
      RENDERER_RECEIVE.CONTROLLERS_RESTARTED,
      undefined,
    )
  })

  it('does not call restartControllers or refreshActiveRigs when deleting an inactive rig', async () => {
    mockConfig.getDmxRig.mockReturnValue({ active: false })
    const handler = handlers.get(CONFIG.DELETE_DMX_RIG)!
    await handler({}, 'rig-1')
    expect(mockControllerManager.restartControllers).not.toHaveBeenCalled()
    expect(mockControllerManager.refreshActiveRigs).not.toHaveBeenCalled()
  })

  it('returns { success: true } on a valid delete', async () => {
    mockConfig.getDmxRig.mockReturnValue(null)
    const handler = handlers.get(CONFIG.DELETE_DMX_RIG)!
    const result = await handler({}, 'rig-1')
    expect(result).toEqual({ success: true })
  })
})
