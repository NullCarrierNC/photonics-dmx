import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { MotionCueRegistry } from '../../photonics-dmx/cues/registries/MotionCueRegistry'
import { ipcError } from './ipcResult'
import { LIGHT } from '../../shared/ipcChannels'

/**
 * IPC handlers for motion cue groups and motion selection mode.
 */
export function setupMotionGroupHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(LIGHT.GET_MOTION_CUE_GROUPS, async () => {
    try {
      const registry = MotionCueRegistry.getInstance()
      return registry.getMotionGroupsInfo()
    } catch (error) {
      console.error('Error getting motion cue groups:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_AVAILABLE_MOTION_CUES, async (_, groupId?: string) => {
    try {
      const registry = MotionCueRegistry.getInstance()
      const targetGroupId = groupId || registry.getDefaultGroup() || registry.getEnabledGroups()[0]
      if (!targetGroupId) {
        return []
      }
      return registry.getCueDetails(targetGroupId)
    } catch (error) {
      console.error('Error getting available motion cues:', error)
      return []
    }
  })

  ipcMain.handle(LIGHT.GET_MOTION_GROUP_SELECTION_MODE, async () => {
    try {
      const mode = controllerManager.getConfig().getMotionGroupSelectionMode()
      return { success: true, mode }
    } catch (error) {
      console.error('Error getting motion group selection mode:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(
    LIGHT.SET_MOTION_GROUP_SELECTION_MODE,
    async (_, mode: 'oncePerSong' | 'perCueChange' | 'none') => {
      try {
        if (mode !== 'oncePerSong' && mode !== 'perCueChange' && mode !== 'none') {
          return ipcError(
            new Error('Invalid mode: must be "oncePerSong", "perCueChange", or "none"'),
          )
        }
        await controllerManager.getConfig().setMotionGroupSelectionMode(mode)
        MotionCueRegistry.getInstance().setMotionSelectionMode(mode)
        return { success: true, mode }
      } catch (error) {
        console.error('Error setting motion group selection mode:', error)
        return ipcError(error)
      }
    },
  )
}
