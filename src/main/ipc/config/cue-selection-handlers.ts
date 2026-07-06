import { IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import { YargCueRegistry } from '../../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../../photonics-dmx/cues/registries/AudioCueRegistry'
import { getRb3CueRegistry } from '../../../photonics-dmx/cues/registries/Rb3CueRegistry'
import { reconcileEnabledGroups } from '../../controllers/cueGroupReconcile'
import { ipcError } from '../ipcResult'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { validateOptionalStringArray, validateDisabledCuesMap } from '../inputValidation'
import type { AppPreferences } from '../../../services/configuration/configurationDefaults'
import type { CueDomain } from '../../../services/configuration/cueDomainTypes'
import { createLogger } from '../../../shared/logger'
const log = createLogger('cue-selection-handlers')

type ChangedEvent = (typeof RENDERER_RECEIVE)[keyof typeof RENDERER_RECEIVE]

/**
 * The registry operations one cue domain needs, bound to its concrete registry instance. Lighting
 * and motion layers differ only in which registry methods back these, so each domain supplies its
 * own bindings and the shared registrar drives them identically.
 */
interface BoundCueGroupRegistry {
  getRegisteredIds: () => string[]
  setEnabled: (ids: string[]) => void
  setDisabled: (map: Record<string, string[]>) => void
  /** SET-enabled side effect (activate groups / refresh selection); runs after disabled is applied. */
  afterSetEnabled?: (controllerManager: ControllerManager) => void
  /** SET-disabled side effect (refresh selection); runs after disabled is applied. */
  afterSetDisabled?: (controllerManager: ControllerManager) => void
  /** GET tail applied once reconciled (e.g. YARG StageKit priority). */
  afterGet?: (prefs: AppPreferences) => void
}

interface CueGroupDomainSpec {
  domain: CueDomain
  channels: {
    getEnabled: string
    setEnabled: string
    getDisabled: string
    setDisabled: string
  }
  disabledLabel: string
  changedEvent?: ChangedEvent
  bind: () => BoundCueGroupRegistry
}

/**
 * Register the enabled-groups and disabled-cues IPC handlers for one cue domain. The
 * enabled-groups getter reconciles stored prefs against the registry (auto-enabling new groups,
 * dropping deregistered ones), persists the result, and applies it; the setters validate, persist,
 * apply, and broadcast. Every domain shares this reconcile and apply flow.
 */
function registerCueGroupDomain(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
  spec: CueGroupDomainSpec,
): void {
  ipcMain.handle(spec.channels.getEnabled, async () => {
    const bound = spec.bind()
    const config = controllerManager.getConfig()
    const prefs = config.getAllPreferences()
    const domainPrefs = prefs.cueDomains[spec.domain]
    const { enabled, known } = reconcileEnabledGroups(
      domainPrefs.enabledGroups,
      domainPrefs.knownGroups,
      bound.getRegisteredIds(),
    )
    await config.updateCueDomain(spec.domain, { enabledGroups: enabled })
    await config.updateCueDomain(spec.domain, { knownGroups: known })
    bound.setEnabled(enabled)
    bound.setDisabled(domainPrefs.disabledCues)
    bound.afterGet?.(prefs)
    return enabled
  })

  ipcMain.handle(spec.channels.setEnabled, async (_, groupIds: unknown) => {
    try {
      const validation = validateOptionalStringArray(groupIds, 'groupIds')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const config = controllerManager.getConfig()
      await config.updateCueDomain(spec.domain, { enabledGroups: validation.value })
      const bound = spec.bind()
      bound.setEnabled(validation.value)
      bound.setDisabled(config.getPreference('cueDomains')[spec.domain].disabledCues)
      bound.afterSetEnabled?.(controllerManager)
      if (spec.changedEvent) {
        sendToAllWindows(spec.changedEvent, undefined)
      }
      log.info(`Updated ${spec.domain} enabled cue groups:`, validation.value)
      return { success: true }
    } catch (error) {
      log.error(`Error setting enabled ${spec.domain} cue groups:`, error)
      return ipcError(error)
    }
  })

  ipcMain.handle(spec.channels.getDisabled, async () => {
    const disabled = controllerManager.getConfig().getPreference('cueDomains')[
      spec.domain
    ].disabledCues
    spec.bind().setDisabled(disabled)
    return disabled
  })

  ipcMain.handle(spec.channels.setDisabled, async (_, payload: unknown) => {
    try {
      const validation = validateDisabledCuesMap(payload, spec.disabledLabel)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const config = controllerManager.getConfig()
      await config.updateCueDomain(spec.domain, { disabledCues: validation.value })
      const bound = spec.bind()
      bound.setDisabled(validation.value)
      bound.afterSetDisabled?.(controllerManager)
      if (spec.changedEvent) {
        sendToAllWindows(spec.changedEvent, undefined)
      }
      return { success: true }
    } catch (error) {
      log.error(`Error setting disabled ${spec.domain} cues:`, error)
      return ipcError(error)
    }
  })
}

export function registerCueSelectionConfigHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  const specs: CueGroupDomainSpec[] = [
    {
      domain: 'yarg',
      channels: {
        getEnabled: CONFIG.GET_ENABLED_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_YARG_CUES,
        setDisabled: CONFIG.SET_DISABLED_YARG_CUES,
      },
      disabledLabel: 'disabledYargCues',
      bind: () => {
        const registry = YargCueRegistry.getInstance()
        return {
          getRegisteredIds: () => registry.getAllGroups(),
          setEnabled: (ids) => registry.setEnabledGroups(ids),
          setDisabled: (map) => registry.setDisabledCues(map),
          // Selection reads the active set; setEnabledGroups only trims it. Activate the enabled
          // groups so a group enabled at runtime is immediately selectable without a restart.
          afterSetEnabled: () => registry.setActiveGroups(registry.getEnabledGroups()),
          afterGet: (prefs) => {
            const configPriority = prefs.stageKitPrefs?.yargPriority || 'random'
            if (registry.getStageKitPriority() !== configPriority) {
              registry.setStageKitPriority(configPriority)
            }
          },
        }
      },
    },
    {
      domain: 'audio',
      channels: {
        getEnabled: CONFIG.GET_ENABLED_AUDIO_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_AUDIO_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_AUDIO_CUES,
        setDisabled: CONFIG.SET_DISABLED_AUDIO_CUES,
      },
      disabledLabel: 'disabledAudioCues',
      changedEvent: RENDERER_RECEIVE.AUDIO_CUE_GROUPS_CHANGED,
      bind: () => {
        const registry = AudioCueRegistry.getInstance()
        return {
          getRegisteredIds: () => registry.getRegisteredGroups(),
          setEnabled: (ids) => registry.setEnabledGroups(ids),
          setDisabled: (map) => registry.setDisabledCues(map),
          afterSetEnabled: (cm) => cm.refreshAudioCueSelection(),
          afterSetDisabled: (cm) => cm.refreshAudioCueSelection(),
        }
      },
    },
    {
      domain: 'yargMotion',
      channels: {
        getEnabled: CONFIG.GET_ENABLED_YARG_MOTION_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_YARG_MOTION_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_YARG_MOTION_CUES,
        setDisabled: CONFIG.SET_DISABLED_YARG_MOTION_CUES,
      },
      disabledLabel: 'disabledYargMotionCues',
      changedEvent: RENDERER_RECEIVE.YARG_MOTION_CUE_GROUPS_CHANGED,
      bind: () => {
        const registry = YargCueRegistry.getInstance()
        return {
          getRegisteredIds: () => registry.getRegisteredMotionGroupIds(),
          setEnabled: (ids) => registry.setEnabledMotionGroups(ids),
          setDisabled: (map) => registry.setDisabledMotionCues(map),
        }
      },
    },
    {
      domain: 'audioMotion',
      channels: {
        getEnabled: CONFIG.GET_ENABLED_AUDIO_MOTION_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_AUDIO_MOTION_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_AUDIO_MOTION_CUES,
        setDisabled: CONFIG.SET_DISABLED_AUDIO_MOTION_CUES,
      },
      disabledLabel: 'disabledAudioMotionCues',
      changedEvent: RENDERER_RECEIVE.AUDIO_MOTION_CUE_GROUPS_CHANGED,
      bind: () => {
        const registry = AudioCueRegistry.getInstance()
        return {
          getRegisteredIds: () => registry.getRegisteredMotionGroupIds(),
          setEnabled: (ids) => registry.setEnabledMotionGroups(ids),
          setDisabled: (map) => registry.setDisabledMotionCues(map),
        }
      },
    },
    {
      // RB3 cue mode reuses the YARG registry API against its own registry instance and domains.
      domain: 'rb3',
      channels: {
        getEnabled: CONFIG.GET_ENABLED_RB3_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_RB3_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_RB3_CUES,
        setDisabled: CONFIG.SET_DISABLED_RB3_CUES,
      },
      disabledLabel: 'disabledRb3Cues',
      changedEvent: RENDERER_RECEIVE.RB3_CUE_GROUPS_CHANGED,
      bind: () => {
        const registry = getRb3CueRegistry()
        return {
          getRegisteredIds: () => registry.getAllGroups(),
          setEnabled: (ids) => registry.setEnabledGroups(ids),
          setDisabled: (map) => registry.setDisabledCues(map),
          afterSetEnabled: () => registry.setActiveGroups(registry.getEnabledGroups()),
        }
      },
    },
    {
      domain: 'rb3Motion',
      channels: {
        getEnabled: CONFIG.GET_ENABLED_RB3_MOTION_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_RB3_MOTION_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_RB3_MOTION_CUES,
        setDisabled: CONFIG.SET_DISABLED_RB3_MOTION_CUES,
      },
      disabledLabel: 'disabledRb3MotionCues',
      changedEvent: RENDERER_RECEIVE.RB3_MOTION_CUE_GROUPS_CHANGED,
      bind: () => {
        const registry = getRb3CueRegistry()
        return {
          getRegisteredIds: () => registry.getRegisteredMotionGroupIds(),
          setEnabled: (ids) => registry.setEnabledMotionGroups(ids),
          setDisabled: (map) => registry.setDisabledMotionCues(map),
        }
      },
    },
  ]

  for (const spec of specs) {
    registerCueGroupDomain(ipcMain, controllerManager, spec)
  }
}
