import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { ipcError } from './ipcResult'
import { LIGHT } from '../../shared/ipcChannels'

/**
 * IPC handlers for YARG and audio motion cue groups and motion selection mode.
 */
export function setupMotionGroupHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(LIGHT.GET_YARG_MOTION_CUE_GROUPS, async () => {
    try {
      return YargCueRegistry.getInstance().getYargMotionGroupsInfo()
    } catch (error) {
      console.error('Error getting YARG motion cue groups:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AUDIO_MOTION_CUE_GROUPS, async () => {
    try {
      return AudioCueRegistry.getInstance().getAudioMotionGroupsInfo()
    } catch (error) {
      console.error('Error getting audio motion cue groups:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AVAILABLE_YARG_MOTION_CUES, async (_, groupId?: string) => {
    try {
      const registry = YargCueRegistry.getInstance()
      const targetGroupId =
        groupId || registry.getDefaultGroupId() || registry.getEnabledMotionGroups()[0]
      if (!targetGroupId) {
        return []
      }
      return registry.getYargMotionCueDetails(targetGroupId)
    } catch (error) {
      console.error('Error getting available YARG motion cues:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AVAILABLE_AUDIO_MOTION_CUES, async (_, groupId?: string) => {
    try {
      const registry = AudioCueRegistry.getInstance()
      const targetGroupId =
        groupId || registry.getDefaultGroup() || registry.getEnabledMotionGroups()[0]
      if (!targetGroupId) {
        return []
      }
      return registry.getAudioMotionCueDetails(targetGroupId)
    } catch (error) {
      console.error('Error getting available audio motion cues:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_YARG_MOTION_GROUP_SELECTION_MODE, async () => {
    try {
      const mode = controllerManager.getConfig().getMotionGroupSelectionMode()
      return { success: true, mode }
    } catch (error) {
      console.error('Error getting YARG motion group selection mode:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(
    LIGHT.SET_YARG_MOTION_GROUP_SELECTION_MODE,
    async (_, mode: 'oncePerSong' | 'perCueChange' | 'none') => {
      try {
        if (mode !== 'oncePerSong' && mode !== 'perCueChange' && mode !== 'none') {
          return ipcError(
            new Error('Invalid mode: must be "oncePerSong", "perCueChange", or "none"'),
          )
        }
        await controllerManager.getConfig().setMotionGroupSelectionMode(mode)
        YargCueRegistry.getInstance().setMotionSelectionMode(mode)
        return { success: true, mode }
      } catch (error) {
        console.error('Error setting YARG motion group selection mode:', error)
        return ipcError(error)
      }
    },
  )

  ipcMain.handle(LIGHT.GET_AUDIO_MOTION_GROUP_SELECTION_MODE, async () => {
    try {
      const mode = controllerManager.getConfig().getAudioMotionGroupSelectionMode()
      return { success: true, mode }
    } catch (error) {
      console.error('Error getting audio motion group selection mode:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(
    LIGHT.SET_AUDIO_MOTION_GROUP_SELECTION_MODE,
    async (_, mode: 'oncePerSong' | 'perCueChange' | 'none') => {
      try {
        if (mode !== 'oncePerSong' && mode !== 'perCueChange' && mode !== 'none') {
          return ipcError(
            new Error('Invalid mode: must be "oncePerSong", "perCueChange", or "none"'),
          )
        }
        await controllerManager.getConfig().setAudioMotionGroupSelectionMode(mode)
        AudioCueRegistry.getInstance().setMotionSelectionMode(mode)
        return { success: true, mode }
      } catch (error) {
        console.error('Error setting audio motion group selection mode:', error)
        return ipcError(error)
      }
    },
  )
}
