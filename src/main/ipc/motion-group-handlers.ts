import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { getCueRegistry } from '../../photonics-dmx/cues/registries/cueRegistries'
import { ipcError } from './ipcResult'
import { LIGHT } from '../../shared/ipcChannels'
import { validateMotionSelectionMode } from './inputValidation'
import type { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import type { CueDomain, CueDomainSelectionMode } from '../../services/configuration/cueDomainTypes'
import { createLogger } from '../../shared/logger'
const log = createLogger('motion-group-handlers')

type MotionSelectionMode = 'oncePerSong' | 'perCueChange' | 'none'

/** The motion surface every registry exposes, whichever cue family it holds. */
interface MotionCueRegistryView {
  getMotionGroupsInfo(): Array<{ id: string; name: string; description?: string; cueCount: number }>
  getMotionCueDetails(groupId: string): Array<{ id: string; name: string; description: string }>
  getDefaultMotionGroupId(): string | null
  getEnabledMotionGroups(): string[]
  setMotionSelectionMode(mode: MotionSelectionMode): void
}

interface MotionDomainSpec {
  /** Used in log lines only. */
  label: string
  prefsDomain: CueDomain
  registry: () => MotionCueRegistryView
  /** The stored mode as the renderer sees it; the wider stored union is reported verbatim. */
  getSelectionMode: (config: ConfigurationManager) => CueDomainSelectionMode
  channels: {
    groups: string
    availableCues: string
    getSelectionMode: string
    setSelectionMode: string
  }
}

const MOTION_DOMAINS: readonly MotionDomainSpec[] = [
  {
    label: 'YARG',
    prefsDomain: 'yargMotion',
    registry: () => getCueRegistry('yarg'),
    getSelectionMode: (config) => config.getMotionGroupSelectionMode(),
    channels: {
      groups: LIGHT.GET_YARG_MOTION_CUE_GROUPS,
      availableCues: LIGHT.GET_AVAILABLE_YARG_MOTION_CUES,
      getSelectionMode: LIGHT.GET_YARG_MOTION_GROUP_SELECTION_MODE,
      setSelectionMode: LIGHT.SET_YARG_MOTION_GROUP_SELECTION_MODE,
    },
  },
  {
    label: 'audio',
    prefsDomain: 'audioMotion',
    registry: () => AudioCueRegistry.getInstance(),
    getSelectionMode: (config) => config.getAudioMotionGroupSelectionMode(),
    channels: {
      groups: LIGHT.GET_AUDIO_MOTION_CUE_GROUPS,
      availableCues: LIGHT.GET_AVAILABLE_AUDIO_MOTION_CUES,
      getSelectionMode: LIGHT.GET_AUDIO_MOTION_GROUP_SELECTION_MODE,
      setSelectionMode: LIGHT.SET_AUDIO_MOTION_GROUP_SELECTION_MODE,
    },
  },
  {
    label: 'RB3',
    prefsDomain: 'rb3Motion',
    registry: () => getCueRegistry('rb3'),
    getSelectionMode: (config) =>
      config.getPreference('cueDomains').rb3Motion.selectionMode ?? 'perCueChange',
    channels: {
      groups: LIGHT.GET_RB3_MOTION_CUE_GROUPS,
      availableCues: LIGHT.GET_AVAILABLE_RB3_MOTION_CUES,
      getSelectionMode: LIGHT.GET_RB3_MOTION_GROUP_SELECTION_MODE,
      setSelectionMode: LIGHT.SET_RB3_MOTION_GROUP_SELECTION_MODE,
    },
  },
]

/**
 * IPC handlers for motion cue groups and motion selection mode. Every domain answers the same four
 * questions against its own registry and preference domain, so they are registered from one table.
 */
export function setupMotionGroupHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  for (const spec of MOTION_DOMAINS) {
    ipcMain.handle(spec.channels.groups, async () => {
      try {
        return spec.registry().getMotionGroupsInfo()
      } catch (error) {
        log.error(`Error getting ${spec.label} motion cue groups:`, error)
        return []
      }
    })

    ipcMain.handle(spec.channels.availableCues, async (_, groupId?: unknown) => {
      try {
        const registry = spec.registry()
        const resolvedGroupId = typeof groupId === 'string' ? groupId : undefined
        const targetGroupId =
          resolvedGroupId ||
          registry.getDefaultMotionGroupId() ||
          registry.getEnabledMotionGroups()[0]
        if (!targetGroupId) {
          return []
        }
        return registry.getMotionCueDetails(targetGroupId)
      } catch (error) {
        log.error(`Error getting available ${spec.label} motion cues:`, error)
        return []
      }
    })

    ipcMain.handle(spec.channels.getSelectionMode, async () => {
      try {
        return { success: true, mode: spec.getSelectionMode(controllerManager.getConfig()) }
      } catch (error) {
        log.error(`Error getting ${spec.label} motion group selection mode:`, error)
        return ipcError(error)
      }
    })

    ipcMain.handle(spec.channels.setSelectionMode, async (_, mode: unknown) => {
      try {
        const validation = validateMotionSelectionMode(mode)
        if (!validation.ok) {
          return ipcError(new Error(validation.error))
        }
        await controllerManager
          .getConfig()
          .updateCueDomain(spec.prefsDomain, { selectionMode: validation.value })
        spec.registry().setMotionSelectionMode(validation.value)
        return { success: true, mode: validation.value }
      } catch (error) {
        log.error(`Error setting ${spec.label} motion group selection mode:`, error)
        return ipcError(error)
      }
    })
  }
}
