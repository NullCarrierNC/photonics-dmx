/**
 * IPC tests for the RB3 motion preference channels (probability, min-hold, switch-timer duration).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { LIGHT } from '../../../shared/ipcChannels'

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<any>,
  on: jest.fn() as jest.MockedFunction<any>,
}

const rb3Motion: {
  probabilityPercent: number
  minimumHoldMs: number
  cueDurationMin: number
  cueDurationMax: number
} = { probabilityPercent: 50, minimumHoldMs: 5000, cueDurationMin: 5, cueDurationMax: 20 }

const mockConfig = {
  getPreference: jest.fn().mockImplementation((key: unknown) => {
    if (key === 'cueDomains') return { rb3Motion }
    return undefined
  }),
  updateCueDomain: jest.fn(async (_domain: string, patch: Record<string, unknown>) => {
    Object.assign(rb3Motion, patch)
  }) as jest.MockedFunction<(domain: string, patch: Record<string, unknown>) => Promise<void>>,
}

const mockControllerManager = {
  getConfig: jest.fn().mockReturnValue(mockConfig),
}

jest.mock('electron', () => ({ ipcMain: mockIpcMain }))
jest.mock('../../../photonics-dmx/cues/registries/YargCueRegistry', () => ({
  YargCueRegistry: { getInstance: jest.fn().mockReturnValue({}) },
}))

import { setupCueSelectionPrefsHandlers } from '../../ipc/cue-selection-prefs-handlers'

function captureHandlers(): Map<string, (event: unknown, ...args: any[]) => Promise<any>> {
  const handlers = new Map<string, (event: unknown, ...args: any[]) => Promise<any>>()
  mockIpcMain.handle.mockImplementation((channel: string, handler: any) => {
    handlers.set(channel, handler)
  })
  return handlers
}

describe('RB3 motion preference IPC', () => {
  let handlers: Map<string, (event: unknown, ...args: any[]) => Promise<any>>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.assign(rb3Motion, {
      probabilityPercent: 50,
      minimumHoldMs: 5000,
      cueDurationMin: 5,
      cueDurationMax: 20,
    })
    handlers = captureHandlers()
    setupCueSelectionPrefsHandlers(mockIpcMain as never, mockControllerManager as never)
  })

  it('round-trips the RB3 motion probability', async () => {
    const set = await handlers.get(LIGHT.SET_RB3_MOTION_CUE_PROBABILITY_PERCENT)!({}, 80)
    expect(set).toEqual({ success: true, percent: 80 })
    expect(mockConfig.updateCueDomain).toHaveBeenCalledWith('rb3Motion', { probabilityPercent: 80 })
    const get = await handlers.get(LIGHT.GET_RB3_MOTION_CUE_PROBABILITY_PERCENT)!({})
    expect(get).toEqual({ success: true, percent: 80 })
  })

  it('rejects an out-of-range probability', async () => {
    const res = await handlers.get(LIGHT.SET_RB3_MOTION_CUE_PROBABILITY_PERCENT)!({}, 150)
    expect(res).toMatchObject({ success: false })
    expect(mockConfig.updateCueDomain).not.toHaveBeenCalled()
  })

  it('round-trips the RB3 motion min-hold', async () => {
    const set = await handlers.get(LIGHT.SET_RB3_MOTION_CUE_MIN_HOLD_MS)!({}, 8000)
    expect(set).toEqual({ success: true, minHoldMs: 8000 })
    expect(mockConfig.updateCueDomain).toHaveBeenCalledWith('rb3Motion', { minimumHoldMs: 8000 })
  })

  it('stores the switch-timer duration and orders min/max', async () => {
    // Pass an inverted range; the handler must store it ordered so the countdown never inverts.
    const res = await handlers.get(LIGHT.SET_RB3_MOTION_CUE_DURATION)!({}, { min: 30, max: 10 })
    expect(res).toEqual({ success: true, min: 10, max: 30 })
    expect(mockConfig.updateCueDomain).toHaveBeenCalledWith('rb3Motion', {
      cueDurationMin: 10,
      cueDurationMax: 30,
    })
    const get = await handlers.get(LIGHT.GET_RB3_MOTION_CUE_DURATION)!({})
    expect(get).toEqual({ success: true, min: 10, max: 30 })
  })
})
