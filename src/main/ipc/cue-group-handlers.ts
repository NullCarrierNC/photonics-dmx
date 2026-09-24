import { handleInvoke } from './handleInvoke'
import { IpcMain } from 'electron'
import type { ControllerManager } from '../controllers/ControllerManager'
import { CueRegistry } from '../../photonics-dmx/cues/registries/CueRegistry'
import { getCueRegistry } from '../../photonics-dmx/cues/registries/cueRegistries'
import { validateCueType } from './inputValidation'
import { LIGHT } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
import type { NetCueMode } from '../../photonics-dmx/cues/types/nodeCueTypes'
const log = createLogger('cue-group-handlers')

/**
 * The window opens before the cold init has loaded the cue files, so a group list asked for then
 * waits for that init to settle. A failed init is left for the user to retry.
 */
async function coldInitSettled(controllerManager: ControllerManager): Promise<void> {
  if (controllerManager.getLifecyclePhase() !== 'initializing') return
  try {
    await controllerManager.init()
  } catch {
    // The init reports its own failure. The list answers with whatever the registry holds.
  }
}

/**
 * The cues of one group in a domain's registry. A missing or blank group id resolves to the
 * registry's default group, then its first enabled group.
 */
function availableCues(domain: NetCueMode, groupId: unknown) {
  try {
    const registry = getCueRegistry(domain)
    const requested = typeof groupId === 'string' && groupId.trim() !== '' ? groupId : undefined
    const targetGroupId =
      requested ?? registry.getDefaultGroupId() ?? registry.getEnabledGroups()[0]
    const group = targetGroupId ? registry.getGroup(targetGroupId) : undefined
    if (!group) {
      return []
    }
    return Array.from(group.cues.entries()).map(([cueType, implementation]) => ({
      id: cueType,
      yargDescription: implementation.description,
      rb3Description: implementation.description,
      groupName: group.name,
    }))
  } catch (error) {
    log.error(`Error getting available ${domain} cues:`, error)
    return []
  }
}

/**
 * Set up YARG cue group registry IPC handlers (enabled groups, source group, consistency status).
 * Cue selection preferences (consistency window, motion min-hold, group selection mode) live in
 * cue-selection-prefs-handlers.ts.
 */
export function setupCueGroupHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  handleInvoke(ipcMain, LIGHT.GET_CUE_GROUPS, log, async () => {
    await coldInitSettled(controllerManager)
    const registry = CueRegistry.getInstance()
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

  handleInvoke(ipcMain, LIGHT.GET_RB3_CUE_GROUPS, log, async () => {
    await coldInitSettled(controllerManager)
    const registry = getCueRegistry('rb3')
    return registry
      .getAllGroups()
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

  handleInvoke(ipcMain, LIGHT.GET_AVAILABLE_CUES, log, async (_, groupId?: unknown) =>
    availableCues('yarg', groupId),
  )

  handleInvoke(ipcMain, LIGHT.GET_AVAILABLE_RB3_CUES, log, async (_, groupId?: unknown) =>
    availableCues('rb3', groupId),
  )

  handleInvoke(ipcMain, LIGHT.GET_CUE_SOURCE_GROUP, log, async (_, cueType: unknown) => {
    const validated = validateCueType(cueType)
    if (!validated.ok) {
      return { success: false, error: validated.error }
    }
    const registry = CueRegistry.getInstance()
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
  })

  handleInvoke(ipcMain, LIGHT.GET_CONSISTENCY_STATUS, log, async () => {
    const registry = CueRegistry.getInstance()
    const status = registry.getConsistencyStatus()
    return { success: true, status }
  })
}
