/**
 * SET_CUE_CONSISTENCY_WINDOW reaches every registry that startup applies the window to, so a
 * change made in Preferences takes effect on all of them at once.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { LIGHT } from '../../../shared/ipcChannels'

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<any>,
  on: jest.fn() as jest.MockedFunction<any>,
}

const yargRegistry = {
  getAllGroups: jest.fn(() => []),
  setEnabledGroups: jest.fn(),
  setCueConsistencyWindow: jest.fn(),
  setCueGroupSelectionMode: jest.fn(),
  setDisabledCues: jest.fn(),
  setStageKitPriority: jest.fn(),
}

const rb3Registry = {
  setCueConsistencyWindow: jest.fn(),
  setCueGroupSelectionMode: jest.fn(),
  setStageKitPriority: jest.fn(),
}

let storedWindow = 10000

let rb3SelectionMode: 'oncePerSong' | 'withinSong' = 'withinSong'

const mockConfig = {
  getPreference: jest.fn((key: unknown) => (key === 'cueConsistencyWindow' ? storedWindow : {})),
  setPreference: jest.fn(async (_key: unknown, value: unknown) => {
    storedWindow = value as number
  }) as jest.MockedFunction<(key: unknown, value: unknown) => Promise<void>>,
  updateCueDomain: jest.fn(async (_domain: string, patch: Record<string, unknown>) => {
    if (patch.selectionMode) rb3SelectionMode = patch.selectionMode as typeof rb3SelectionMode
  }) as jest.MockedFunction<(d: string, p: Record<string, unknown>) => Promise<void>>,
  getCueGroupSelectionMode: jest.fn(() => 'withinSong' as const),
  getRb3CueGroupSelectionMode: jest.fn(() => rb3SelectionMode),
}

const mockControllerManager = { getConfig: jest.fn().mockReturnValue(mockConfig) }

jest.mock('electron', () => ({ ipcMain: mockIpcMain }))
jest.mock('../../../photonics-dmx/cues/registries/CueRegistry', () => ({
  CueRegistry: { getInstance: () => yargRegistry },
}))
jest.mock('../../../photonics-dmx/cues/registries/cueRegistries', () => ({
  getCueRegistry: (domain: string) => (domain === 'rb3' ? rb3Registry : yargRegistry),
}))

import { setupCueSelectionPrefsHandlers } from '../../ipc/cue-selection-prefs-handlers'

describe('SET_CUE_CONSISTENCY_WINDOW', () => {
  let handlers: Map<string, (event: unknown, ...args: any[]) => Promise<any>>

  beforeEach(() => {
    jest.clearAllMocks()
    storedWindow = 10000
    rb3SelectionMode = 'withinSong'
    handlers = new Map()
    mockIpcMain.handle.mockImplementation((channel: string, handler: any) => {
      handlers.set(channel, handler)
    })
    setupCueSelectionPrefsHandlers(mockIpcMain as never, mockControllerManager as never)
  })

  it('persists the rounded window and applies it to both lighting registries', async () => {
    const result = await handlers.get(LIGHT.SET_CUE_CONSISTENCY_WINDOW)!({}, 4200.6)

    expect(result).toEqual({ success: true, windowMs: 4201 })
    expect(mockConfig.setPreference).toHaveBeenCalledWith('cueConsistencyWindow', 4201)
    expect(yargRegistry.setCueConsistencyWindow).toHaveBeenCalledWith(4201)
    expect(rb3Registry.setCueConsistencyWindow).toHaveBeenCalledWith(4201)
  })

  it('applies nothing when the value is out of range', async () => {
    const result = await handlers.get(LIGHT.SET_CUE_CONSISTENCY_WINDOW)!({}, 900000)

    expect(result.success).toBe(false)
    expect(mockConfig.setPreference).not.toHaveBeenCalled()
    expect(yargRegistry.setCueConsistencyWindow).not.toHaveBeenCalled()
    expect(rb3Registry.setCueConsistencyWindow).not.toHaveBeenCalled()
  })

  it('reads the stored window back through the getter', async () => {
    await handlers.get(LIGHT.SET_CUE_CONSISTENCY_WINDOW)!({}, 3000)
    const get = await handlers.get(LIGHT.GET_CUE_CONSISTENCY_WINDOW)!({})
    expect(get).toEqual({ success: true, windowMs: 3000 })
  })
})

describe('RB3 cue group selection mode', () => {
  let handlers: Map<string, (event: unknown, ...args: any[]) => Promise<any>>

  beforeEach(() => {
    jest.clearAllMocks()
    rb3SelectionMode = 'withinSong'
    handlers = new Map()
    mockIpcMain.handle.mockImplementation((channel: string, handler: any) => {
      handlers.set(channel, handler)
    })
    setupCueSelectionPrefsHandlers(mockIpcMain as never, mockControllerManager as never)
  })

  it('persists to the rb3 domain and pushes to the RB3 registry, not the YARG one', async () => {
    const result = await handlers.get(LIGHT.SET_RB3_CUE_GROUP_SELECTION_MODE)!({}, 'oncePerSong')

    expect(result).toEqual({ success: true, mode: 'oncePerSong' })
    expect(mockConfig.updateCueDomain).toHaveBeenCalledWith('rb3', {
      selectionMode: 'oncePerSong',
    })
    expect(rb3Registry.setCueGroupSelectionMode).toHaveBeenCalledWith('oncePerSong')
    expect(yargRegistry.setCueGroupSelectionMode).not.toHaveBeenCalled()
  })

  it('reads the stored mode back through the coercing getter', async () => {
    await handlers.get(LIGHT.SET_RB3_CUE_GROUP_SELECTION_MODE)!({}, 'oncePerSong')
    const get = await handlers.get(LIGHT.GET_RB3_CUE_GROUP_SELECTION_MODE)!({})
    expect(get).toEqual({ success: true, mode: 'oncePerSong' })
  })

  it('rejects an unknown mode without persisting or applying it', async () => {
    const result = await handlers.get(LIGHT.SET_RB3_CUE_GROUP_SELECTION_MODE)!({}, 'sometimes')

    expect(result.success).toBe(false)
    expect(mockConfig.updateCueDomain).not.toHaveBeenCalled()
    expect(rb3Registry.setCueGroupSelectionMode).not.toHaveBeenCalled()
  })
})
