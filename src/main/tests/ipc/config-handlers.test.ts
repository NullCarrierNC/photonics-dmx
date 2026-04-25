/**
 * Lightweight IPC tests for motion preference channels registered in config-handlers.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<any>,
  on: jest.fn() as jest.MockedFunction<any>,
}

const baseCueDomains = () => ({
  yarg: { disabledCues: {} as Record<string, string[]> },
  audio: { disabledCues: {} as Record<string, string[]> },
  yargMotion: {
    activeCueRef: null as { groupId: string; cueId: string } | null,
    disabledCues: {} as Record<string, string[]>,
  },
  audioMotion: {
    activeCueRef: null as { groupId: string; cueId: string } | null,
    disabledCues: {} as Record<string, string[]>,
  },
})

const mockConfig = {
  getPreference: jest.fn().mockImplementation((key: unknown) => {
    if (key === 'motionEnabled') {
      return true
    }
    if (key === 'cueDomains') {
      return baseCueDomains()
    }
    return undefined
  }),
  setPreference: jest.fn(async () => {}) as jest.MockedFunction<
    (key: string, value: unknown) => Promise<void>
  >,
  updateCueDomain: jest.fn(async () => {}) as jest.MockedFunction<
    (domain: string, patch: Record<string, unknown>) => Promise<void>
  >,
  getDmxRig: jest.fn(),
  saveDmxRig: jest.fn(async () => {}),
  deleteDmxRig: jest.fn(async () => {}),
  getDmxRigs: jest.fn(async () => []),
  getLightLibrary: jest.fn().mockReturnValue([]),
  getUserLights: jest.fn().mockReturnValue([]),
  getLightingLayout: jest.fn().mockReturnValue(null),
  updateUserLights: jest.fn(async () => {}),
  getAllPreferences: jest.fn().mockReturnValue({}),
}

const mockControllerManager = {
  getConfig: jest.fn().mockReturnValue(mockConfig),
  restartControllers: jest.fn(async () => {}),
  refreshActiveRigs: jest.fn(),
  setMotionEnabledGlobal: jest.fn(),
  setActiveAudioMotionCueRef: jest.fn(),
  setActiveYargMotionCueRef: jest.fn(),
  flushValidationErrors: jest.fn().mockReturnValue([]),
  getIsInitialized: jest.fn().mockReturnValue(true),
}

const mockSendToAllWindows = jest.fn()

jest.mock('electron', () => ({
  app: { getVersion: jest.fn().mockReturnValue('1.0.0') },
  ipcMain: mockIpcMain,
}))

jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: mockSendToAllWindows }))

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

describe('CONFIG motion IPC (config-handlers)', () => {
  let handlers: Map<string, (event: unknown, ...args: any[]) => Promise<any>>

  beforeEach(() => {
    jest.clearAllMocks()
    mockConfig.getPreference.mockImplementation((key: unknown) => {
      if (key === 'motionEnabled') {
        return true
      }
      if (key === 'cueDomains') {
        return baseCueDomains()
      }
      return undefined
    })
    mockConfig.setPreference.mockImplementation(async () => {})
    mockConfig.updateCueDomain.mockImplementation(async () => {})
    handlers = captureHandlers()
    setupConfigHandlers(mockIpcMain as any, mockControllerManager as any)
  })

  describe('GET_MOTION_ENABLED / SET_MOTION_ENABLED', () => {
    it('GET_MOTION_ENABLED returns value from ConfigurationManager', async () => {
      mockConfig.getPreference.mockImplementation((key: unknown) =>
        key === 'motionEnabled' ? false : undefined,
      )
      const handler = handlers.get(CONFIG.GET_MOTION_ENABLED)!
      const result = await handler({}, undefined)
      expect(result).toBe(false)
      expect(mockConfig.getPreference).toHaveBeenCalledWith('motionEnabled')
    })

    it('SET_MOTION_ENABLED persists, applies handlers, and broadcasts', async () => {
      const handler = handlers.get(CONFIG.SET_MOTION_ENABLED)!
      const result = await handler({}, false)
      expect(result).toEqual({ success: true })
      expect(mockConfig.setPreference).toHaveBeenCalledWith('motionEnabled', false)
      expect(mockControllerManager.setMotionEnabledGlobal).toHaveBeenCalledWith(false)
      expect(mockSendToAllWindows).toHaveBeenCalledWith(
        RENDERER_RECEIVE.MOTION_ENABLED_CHANGED,
        false,
      )
    })

    it('SET_MOTION_ENABLED rejects non-boolean payload', async () => {
      const handler = handlers.get(CONFIG.SET_MOTION_ENABLED)!
      const result = await handler({}, 'yes')
      expect(result).toMatchObject({ success: false, error: expect.any(String) })
      expect(mockConfig.setPreference).not.toHaveBeenCalled()
      expect(mockControllerManager.setMotionEnabledGlobal).not.toHaveBeenCalled()
      expect(mockSendToAllWindows).not.toHaveBeenCalled()
    })
  })

  describe('GET_ACTIVE_AUDIO_MOTION_CUE / SET_ACTIVE_AUDIO_MOTION_CUE', () => {
    it('GET_ACTIVE_AUDIO_MOTION_CUE returns ref from ConfigurationManager', async () => {
      const ref = { groupId: 'g-audio', cueId: 'cue-1' }
      const cd = baseCueDomains()
      cd.audioMotion.activeCueRef = ref
      mockConfig.getPreference.mockImplementation((key: unknown) =>
        key === 'cueDomains' ? cd : undefined,
      )
      const handler = handlers.get(CONFIG.GET_ACTIVE_AUDIO_MOTION_CUE)!
      const result = await handler({}, undefined)
      expect(result).toEqual(ref)
    })

    it('SET_ACTIVE_AUDIO_MOTION_CUE persists valid ref and applies to AudioController path', async () => {
      const handler = handlers.get(CONFIG.SET_ACTIVE_AUDIO_MOTION_CUE)!
      const result = await handler({}, { groupId: '  g1  ', cueId: ' c1 ' })
      expect(result).toEqual({ success: true })
      expect(mockConfig.updateCueDomain).toHaveBeenCalledWith('audioMotion', {
        activeCueRef: { groupId: 'g1', cueId: 'c1' },
      })
      expect(mockControllerManager.setActiveAudioMotionCueRef).toHaveBeenCalledWith({
        groupId: 'g1',
        cueId: 'c1',
      })
    })

    it('SET_ACTIVE_AUDIO_MOTION_CUE clears ref when payload is null', async () => {
      const handler = handlers.get(CONFIG.SET_ACTIVE_AUDIO_MOTION_CUE)!
      const result = await handler({}, null)
      expect(result).toEqual({ success: true })
      expect(mockConfig.updateCueDomain).toHaveBeenCalledWith('audioMotion', { activeCueRef: null })
      expect(mockControllerManager.setActiveAudioMotionCueRef).toHaveBeenCalledWith(null)
    })

    it('SET_ACTIVE_AUDIO_MOTION_CUE rejects invalid shape', async () => {
      const handler = handlers.get(CONFIG.SET_ACTIVE_AUDIO_MOTION_CUE)!
      const result = await handler({}, 'not-an-object')
      expect(result).toMatchObject({ success: false })
      expect(mockConfig.updateCueDomain).not.toHaveBeenCalled()
    })

    it('SET_ACTIVE_AUDIO_MOTION_CUE rejects empty groupId or cueId after trim', async () => {
      const handler = handlers.get(CONFIG.SET_ACTIVE_AUDIO_MOTION_CUE)!
      const result = await handler({}, { groupId: '', cueId: 'x' })
      expect(result).toMatchObject({ success: false })
      expect(mockConfig.updateCueDomain).not.toHaveBeenCalled()
    })
  })

  describe('GET_ACTIVE_YARG_MOTION_CUE / SET_ACTIVE_YARG_MOTION_CUE', () => {
    it('GET_ACTIVE_YARG_MOTION_CUE returns ref from ConfigurationManager', async () => {
      const ref = { groupId: 'g-yarg', cueId: 'cue-m1' }
      const cd = baseCueDomains()
      cd.yargMotion.activeCueRef = ref
      mockConfig.getPreference.mockImplementation((key: unknown) =>
        key === 'cueDomains' ? cd : undefined,
      )
      const handler = handlers.get(CONFIG.GET_ACTIVE_YARG_MOTION_CUE)!
      const result = await handler({}, undefined)
      expect(result).toEqual(ref)
    })

    it('SET_ACTIVE_YARG_MOTION_CUE persists valid ref and applies to YARG handler path', async () => {
      const handler = handlers.get(CONFIG.SET_ACTIVE_YARG_MOTION_CUE)!
      const result = await handler({}, { groupId: '  g1  ', cueId: ' c1 ' })
      expect(result).toEqual({ success: true })
      expect(mockConfig.updateCueDomain).toHaveBeenCalledWith('yargMotion', {
        activeCueRef: { groupId: 'g1', cueId: 'c1' },
      })
      expect(mockControllerManager.setActiveYargMotionCueRef).toHaveBeenCalledWith({
        groupId: 'g1',
        cueId: 'c1',
      })
    })

    it('SET_ACTIVE_YARG_MOTION_CUE clears ref when payload is null', async () => {
      const handler = handlers.get(CONFIG.SET_ACTIVE_YARG_MOTION_CUE)!
      const result = await handler({}, null)
      expect(result).toEqual({ success: true })
      expect(mockConfig.updateCueDomain).toHaveBeenCalledWith('yargMotion', { activeCueRef: null })
      expect(mockControllerManager.setActiveYargMotionCueRef).toHaveBeenCalledWith(null)
    })

    it('SET_ACTIVE_YARG_MOTION_CUE rejects invalid shape', async () => {
      const handler = handlers.get(CONFIG.SET_ACTIVE_YARG_MOTION_CUE)!
      const result = await handler({}, 'not-an-object')
      expect(result).toMatchObject({ success: false })
      expect(mockConfig.updateCueDomain).not.toHaveBeenCalled()
    })

    it('SET_ACTIVE_YARG_MOTION_CUE rejects empty groupId or cueId after trim', async () => {
      const handler = handlers.get(CONFIG.SET_ACTIVE_YARG_MOTION_CUE)!
      const result = await handler({}, { groupId: '', cueId: 'x' })
      expect(result).toMatchObject({ success: false })
      expect(mockConfig.updateCueDomain).not.toHaveBeenCalled()
    })
  })
})
