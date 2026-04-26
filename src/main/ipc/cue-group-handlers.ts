import { IpcMain } from 'electron'
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { CueType } from '../../photonics-dmx/cues/types/cueTypes'
import { ipcError } from './ipcResult'
import { LIGHT } from '../../shared/ipcChannels'

/**
 * Set up YARG cue group registry IPC handlers (enabled groups, source group, consistency status).
 * Cue selection preferences (consistency window, motion min-hold, group selection mode) live in
 * cue-selection-prefs-handlers.ts.
 */
export function setupCueGroupHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(LIGHT.GET_CUE_GROUPS, async () => {
    const registry = YargCueRegistry.getInstance()
    const groupIds = registry.getAllGroups()
    return groupIds.map((groupId) => {
      const group = registry.getGroup(groupId)
      return {
        id: groupId,
        name: group!.name,
        description: group!.description,
        cueTypes: group ? Array.from(group.cues.keys()) : [],
      }
    })
  })

  ipcMain.handle(LIGHT.ENABLE_CUE_GROUP, async (_, groupId: string) => {
    try {
      const registry = YargCueRegistry.getInstance()
      const group = registry.getGroup(groupId)
      if (!group) {
        return { success: false, error: `Group '${groupId}' not found` }
      }
      const result = registry.enableGroup(groupId)
      if (result) {
        console.log(`Enabled cue group: ${group.name}`)
        return { success: true }
      }
      console.error(`Failed to enable group '${group.name}'.`)
      return { success: false, error: `Failed to enable group '${group.name}'.` }
    } catch (error) {
      console.error('Error enabling cue group:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.DISABLE_CUE_GROUP, async (_, groupId: string) => {
    try {
      const registry = YargCueRegistry.getInstance()
      const group = registry.getGroup(groupId)
      if (!group) {
        return { success: false, error: `Group '${groupId}' not found` }
      }
      const result = registry.disableGroup(groupId)
      if (result) {
        console.log(`Disabled cue group: ${group.name}`)
        return { success: true }
      }
      console.error(`Failed to disable group '${group.name}'. It may be the default group.`)
      return {
        success: false,
        error: `Failed to disable group '${group.name}'. It may be the default group.`,
      }
    } catch (error) {
      console.error('Error disabling cue group:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_CUE_SOURCE_GROUP, async (_, cueType: string) => {
    try {
      const registry = YargCueRegistry.getInstance()
      const cueState = registry.getCueState(cueType as CueType)
      if (cueState) {
        return {
          success: true,
          cueType: cueState.cueType,
          groupId: cueState.groupId,
          cueStyle: cueState.cueStyle,
          isFallback: cueState.isFallback,
          counter: cueState.counter,
          limit: cueState.limit,
        }
      }
      return { success: false, error: `No state found for cue: ${cueType}` }
    } catch (error) {
      console.error('Error getting cue source group:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_CONSISTENCY_STATUS, async () => {
    try {
      const registry = YargCueRegistry.getInstance()
      const status = registry.getConsistencyStatus()
      return { success: true, status }
    } catch (error) {
      console.error('Error getting consistency status:', error)
      return ipcError(error)
    }
  })
}
