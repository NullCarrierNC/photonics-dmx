import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { ipcError } from './ipcResult'
import { LIGHT } from '../../shared/ipcChannels'
import { validateMotionSelectionMode } from './inputValidation'
import { createLogger } from '../../shared/logger'
const log = createLogger('motion-group-handlers')

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
      log.error('Error getting YARG motion cue groups:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AUDIO_MOTION_CUE_GROUPS, async () => {
    try {
      return AudioCueRegistry.getInstance().getAudioMotionGroupsInfo()
    } catch (error) {
      log.error('Error getting audio motion cue groups:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AVAILABLE_YARG_MOTION_CUES, async (_, groupId?: unknown) => {
    try {
      const registry = YargCueRegistry.getInstance()
      const resolvedGroupId = typeof groupId === 'string' ? groupId : undefined
      const targetGroupId =
        resolvedGroupId || registry.getDefaultGroupId() || registry.getEnabledMotionGroups()[0]
      if (!targetGroupId) {
        return []
      }
      return registry.getYargMotionCueDetails(targetGroupId)
    } catch (error) {
      log.error('Error getting available YARG motion cues:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AVAILABLE_AUDIO_MOTION_CUES, async (_, groupId?: unknown) => {
    try {
      const registry = AudioCueRegistry.getInstance()
      const resolvedGroupId = typeof groupId === 'string' ? groupId : undefined
      const targetGroupId =
        resolvedGroupId || registry.getDefaultGroup() || registry.getEnabledMotionGroups()[0]
      if (!targetGroupId) {
        return []
      }
      return registry.getAudioMotionCueDetails(targetGroupId)
    } catch (error) {
      log.error('Error getting available audio motion cues:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_YARG_MOTION_GROUP_SELECTION_MODE, async () => {
    try {
      const mode = controllerManager.getConfig().getMotionGroupSelectionMode()
      return { success: true, mode }
    } catch (error) {
      log.error('Error getting YARG motion group selection mode:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.SET_YARG_MOTION_GROUP_SELECTION_MODE, async (_, mode: unknown) => {
    try {
      const validation = validateMotionSelectionMode(mode)
      if (!validation.ok) {
        return ipcError(new Error(validation.error))
      }
      await controllerManager
        .getConfig()
        .updateCueDomain('yargMotion', { selectionMode: validation.value })
      YargCueRegistry.getInstance().setMotionSelectionMode(validation.value)
      return { success: true, mode: validation.value }
    } catch (error) {
      log.error('Error setting YARG motion group selection mode:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_AUDIO_MOTION_GROUP_SELECTION_MODE, async () => {
    try {
      const mode = controllerManager.getConfig().getAudioMotionGroupSelectionMode()
      return { success: true, mode }
    } catch (error) {
      log.error('Error getting audio motion group selection mode:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.SET_AUDIO_MOTION_GROUP_SELECTION_MODE, async (_, mode: unknown) => {
    try {
      const validation = validateMotionSelectionMode(mode)
      if (!validation.ok) {
        return ipcError(new Error(validation.error))
      }
      await controllerManager
        .getConfig()
        .updateCueDomain('audioMotion', { selectionMode: validation.value })
      AudioCueRegistry.getInstance().setMotionSelectionMode(validation.value)
      return { success: true, mode: validation.value }
    } catch (error) {
      log.error('Error setting audio motion group selection mode:', error)
      return ipcError(error)
    }
  })
}
