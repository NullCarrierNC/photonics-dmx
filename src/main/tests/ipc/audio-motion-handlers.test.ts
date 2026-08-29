/**
 * IPC tests for SAVE_AUDIO_CONFIG: validation, persistence, device-change restart, the hot-update
 * path and the audio enable/disable routing.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { registerAudioMotionConfigHandlers } from '../../ipc/config/audio-motion-handlers'
import { withCollaboratorGetters } from './managerFacades'
import { sendToAllWindows } from '../../utils/windowUtils'

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
}

const updateAudioConfig = jest.fn(async () => {}) as jest.MockedFunction<
  (updates: Record<string, unknown>) => Promise<void>
>
const getAudioConfig = jest.fn()
const disableAudio = jest.fn(async () => {})
const enableAudio = jest.fn(async () => {})
const getIsAudioEnabled = jest.fn()
const updateLiveAudioConfig = jest.fn()

const mockConfig = {
  getAudioConfig,
  updateAudioConfig,
}

const mockControllerManager = withCollaboratorGetters({
  getConfig: jest.fn(() => mockConfig),
  getIsAudioEnabled,
  disableAudio,
  enableAudio,
  getListenerLifecycle: () => ({
    audio: {
      getAudioCueOptions: jest.fn(),
      getActiveAudioCueType: jest.fn(),
      getActiveSecondaryCueType: jest.fn(),
      setActiveAudioCueType: jest.fn(),
      getAudioGameModeConfig: jest.fn(),
      setAudioGameModeConfig: jest.fn(),
      setActiveAudioMotionCueRef: jest.fn(),
      updateAudioConfig: updateLiveAudioConfig,
      setBroadcastAudioMirror: jest.fn(),
    },
    yargRb3: {
      getRb3Mode: jest.fn(),
      getRb3ProcessorStats: jest.fn(),
    },
  }),
})

jest.mock('electron', () => ({
  ipcMain: mockIpcMain,
}))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

jest.mock('../../../photonics-dmx/cues/registries/CueRegistry', () => ({
  CueRegistry: {
    getInstance: jest.fn().mockReturnValue({
      getRegisteredMotionGroupIds: jest.fn().mockReturnValue([]),
      setEnabledMotionGroups: jest.fn(),
      setDisabledMotionCues: jest.fn(),
    }),
  },
}))

function getHandler(channel: string) {
  const calls = mockIpcMain.handle.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0] === channel) {
      return calls[i][1] as (e: unknown, d: unknown) => Promise<unknown>
    }
  }
  throw new Error(`no handler for ${channel}`)
}

type SaveResult = { success: boolean; error?: string; warning?: string }

/**
 * The handler reads the config twice: the stored value before the write, then the merged value
 * it broadcasts and hot-updates with. `stored` stands in for both unless `merged` is given.
 */
function stubStoredConfig(stored: Record<string, unknown>, merged?: Record<string, unknown>) {
  getAudioConfig.mockReset()
  getAudioConfig.mockReturnValueOnce(stored).mockReturnValue(merged ?? stored)
}

describe('SAVE_AUDIO_CONFIG', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // clearAllMocks does not drain a mockReturnValueOnce queue, so reset the sequence outright
    // and let each test declare the stored config it needs.
    stubStoredConfig({ deviceId: 'mic-1' }, { deviceId: undefined })
    getIsAudioEnabled.mockReturnValue(true)
    updateAudioConfig.mockResolvedValue(undefined)
    disableAudio.mockResolvedValue(undefined)
    enableAudio.mockResolvedValue(undefined)
    registerAudioMotionConfigHandlers(mockIpcMain as never, mockControllerManager as never)
  })

  it('restarts capture when clearing to the system default device', async () => {
    const handler = getHandler(CONFIG.SAVE_AUDIO_CONFIG)
    const result = (await handler(null, { deviceId: undefined })) as SaveResult

    expect(result.success).toBe(true)
    expect(updateAudioConfig).toHaveBeenCalledWith({ deviceId: undefined })
    expect(disableAudio).toHaveBeenCalled()
    expect(enableAudio).toHaveBeenCalled()
    expect(updateLiveAudioConfig).not.toHaveBeenCalled()
    expect(sendToAllWindows).toHaveBeenCalledWith(
      RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE,
      expect.objectContaining({ deviceId: undefined }),
    )
  })

  it('restarts capture when moving between named devices', async () => {
    stubStoredConfig({ deviceId: 'mic-1' }, { deviceId: 'mic-2' })

    const handler = getHandler(CONFIG.SAVE_AUDIO_CONFIG)
    const result = (await handler(null, { deviceId: 'mic-2' })) as SaveResult

    expect(result.success).toBe(true)
    expect(updateAudioConfig).toHaveBeenCalledWith({ deviceId: 'mic-2' })
    expect(disableAudio).toHaveBeenCalled()
    expect(enableAudio).toHaveBeenCalled()
    expect(updateLiveAudioConfig).not.toHaveBeenCalled()
  })

  it('does not restart when the device is already the system default', async () => {
    stubStoredConfig({ deviceId: undefined })

    const handler = getHandler(CONFIG.SAVE_AUDIO_CONFIG)
    const result = (await handler(null, { deviceId: undefined })) as SaveResult

    expect(result.success).toBe(true)
    expect(disableAudio).not.toHaveBeenCalled()
    expect(enableAudio).not.toHaveBeenCalled()
  })

  it('hot-updates the live config with the merged values when deviceId is unchanged', async () => {
    stubStoredConfig({ deviceId: 'mic-1', sensitivity: 2.5 }, { deviceId: 'mic-1', sensitivity: 3 })

    const handler = getHandler(CONFIG.SAVE_AUDIO_CONFIG)
    const result = (await handler(null, { sensitivity: 3 })) as SaveResult

    expect(result.success).toBe(true)
    expect(disableAudio).not.toHaveBeenCalled()
    expect(enableAudio).not.toHaveBeenCalled()
    expect(updateLiveAudioConfig).toHaveBeenCalledWith({ deviceId: 'mic-1', sensitivity: 3 })
  })

  it('persists and broadcasts without touching capture while audio is disabled', async () => {
    getIsAudioEnabled.mockReturnValue(false)
    stubStoredConfig({ deviceId: 'mic-1' }, { deviceId: 'mic-2' })

    const handler = getHandler(CONFIG.SAVE_AUDIO_CONFIG)
    const result = (await handler(null, { deviceId: 'mic-2' })) as SaveResult

    expect(result.success).toBe(true)
    expect(updateAudioConfig).toHaveBeenCalledWith({ deviceId: 'mic-2' })
    expect(sendToAllWindows).toHaveBeenCalledWith(
      RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE,
      expect.objectContaining({ deviceId: 'mic-2' }),
    )
    expect(disableAudio).not.toHaveBeenCalled()
    expect(enableAudio).not.toHaveBeenCalled()
    expect(updateLiveAudioConfig).not.toHaveBeenCalled()
  })

  it('reports a warning when the device saves but capture fails to restart', async () => {
    stubStoredConfig({ deviceId: 'mic-1' }, { deviceId: 'mic-2' })
    enableAudio.mockRejectedValueOnce(new Error('device busy') as never)

    const handler = getHandler(CONFIG.SAVE_AUDIO_CONFIG)
    const result = (await handler(null, { deviceId: 'mic-2' })) as SaveResult

    // Persistence succeeded, so the selection stands and the renderer keeps it.
    expect(result.success).toBe(true)
    expect(result.warning).toContain('device busy')
    expect(updateAudioConfig).toHaveBeenCalledWith({ deviceId: 'mic-2' })
  })

  it('rejects an invalid payload without persisting', async () => {
    const handler = getHandler(CONFIG.SAVE_AUDIO_CONFIG)
    const result = (await handler(null, { sensitivity: 99 })) as SaveResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(updateAudioConfig).not.toHaveBeenCalled()
    expect(sendToAllWindows).not.toHaveBeenCalled()
  })

  it('rejects an empty device id', async () => {
    const handler = getHandler(CONFIG.SAVE_AUDIO_CONFIG)
    const result = (await handler(null, { deviceId: '' })) as SaveResult

    expect(result.success).toBe(false)
    expect(updateAudioConfig).not.toHaveBeenCalled()
  })

  it('routes the enabled flag to the audio lifecycle', async () => {
    stubStoredConfig({ deviceId: 'mic-1' })

    const handler = getHandler(CONFIG.SAVE_AUDIO_CONFIG)
    await handler(null, { enabled: false })
    expect(disableAudio).toHaveBeenCalled()

    jest.clearAllMocks()
    stubStoredConfig({ deviceId: 'mic-1' })
    getIsAudioEnabled.mockReturnValue(true)
    await handler(null, { enabled: true })
    expect(enableAudio).toHaveBeenCalled()
  })
})
