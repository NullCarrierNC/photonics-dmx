import { IpcMain } from 'electron'
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { ipcError } from './ipcResult'
import { isNonEmptyString, validateCueType } from './inputValidation'
import { LIGHT } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
const log = createLogger('cue-group-handlers')

/**
 * Set up YARG cue group registry IPC handlers (enabled groups, source group, consistency status).
 * Cue selection preferences (consistency window, motion min-hold, group selection mode) live in
 * cue-selection-prefs-handlers.ts.
 */
export function setupCueGroupHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(LIGHT.GET_CUE_GROUPS, async () => {
    const registry = YargCueRegistry.getInstance()
    const groupIds = registry.getAllGroups()
    return groupIds
      .map((groupId) => {
        const group = registry.getGroup(groupId)
        if (!group || group.cues.size === 0) {
          return null
        }
        return {
          id: groupId,
          name: group.name,
          description: group.description,
          cueTypes: Array.from(group.cues.keys()),
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
  })

  ipcMain.handle(LIGHT.ENABLE_CUE_GROUP, async (_, groupId: unknown) => {
    if (!isNonEmptyString(groupId)) {
      return { success: false, error: 'groupId is required' }
    }
    try {
      const registry = YargCueRegistry.getInstance()
      const group = registry.getGroup(groupId)
      if (!group) {
        return { success: false, error: `Group '${groupId}' not found` }
      }
      const result = registry.enableGroup(groupId)
      if (result) {
        log.info(`Enabled cue group: ${group.name}`)
        return { success: true }
      }
      log.error(`Failed to enable group '${group.name}'.`)
      return { success: false, error: `Failed to enable group '${group.name}'.` }
    } catch (error) {
      log.error('Error enabling cue group:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.DISABLE_CUE_GROUP, async (_, groupId: unknown) => {
    if (!isNonEmptyString(groupId)) {
      return { success: false, error: 'groupId is required' }
    }
    try {
      const registry = YargCueRegistry.getInstance()
      const group = registry.getGroup(groupId)
      if (!group) {
        return { success: false, error: `Group '${groupId}' not found` }
      }
      const result = registry.disableGroup(groupId)
      if (result) {
        log.info(`Disabled cue group: ${group.name}`)
        return { success: true }
      }
      log.error(`Failed to disable group '${group.name}'. It may be the default group.`)
      return {
        success: false,
        error: `Failed to disable group '${group.name}'. It may be the default group.`,
      }
    } catch (error) {
      log.error('Error disabling cue group:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_CUE_SOURCE_GROUP, async (_, cueType: unknown) => {
    const validated = validateCueType(cueType)
    if (!validated.ok) {
      return { success: false, error: validated.error }
    }
    try {
      const registry = YargCueRegistry.getInstance()
      const cueState = registry.getCueState(validated.value)
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
      return { success: false, error: `No state found for cue: ${validated.value}` }
    } catch (error) {
      log.error('Error getting cue source group:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_CONSISTENCY_STATUS, async () => {
    try {
      const registry = YargCueRegistry.getInstance()
      const status = registry.getConsistencyStatus()
      return { success: true, status }
    } catch (error) {
      log.error('Error getting consistency status:', error)
      return ipcError(error)
    }
  })
}
