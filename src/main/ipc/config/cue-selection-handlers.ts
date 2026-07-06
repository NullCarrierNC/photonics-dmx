import { IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import { YargCueRegistry } from '../../../photonics-dmx/cues/registries/YargCueRegistry'
import { getRb3CueRegistry } from '../../../photonics-dmx/cues/registries/Rb3CueRegistry'
import { reconcileEnabledGroups } from '../../controllers/cueGroupReconcile'
import {
  cueDomainBinding,
  type CueDomainRegistryBinding,
} from '../../controllers/cueDomainBindings'
import { ipcError } from '../ipcResult'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { validateOptionalStringArray, validateDisabledCuesMap } from '../inputValidation'
import type { AppPreferences } from '../../../services/configuration/configurationDefaults'
import { createLogger } from '../../../shared/logger'
const log = createLogger('cue-selection-handlers')

type ChangedEvent = (typeof RENDERER_RECEIVE)[keyof typeof RENDERER_RECEIVE]

interface CueGroupDomainSpec {
  /** Shared registry binding (registered-ids / setEnabled / setDisabled) for this domain. */
  binding: CueDomainRegistryBinding
  channels: {
    getEnabled: string
    setEnabled: string
    getDisabled: string
    setDisabled: string
  }
  disabledLabel: string
  changedEvent?: ChangedEvent
  /** SET-enabled side effect (activate groups / refresh selection); runs after disabled is applied. */
  afterSetEnabled?: (controllerManager: ControllerManager) => void
  /** SET-disabled side effect (refresh selection); runs after disabled is applied. */
  afterSetDisabled?: (controllerManager: ControllerManager) => void
  /** GET tail applied once reconciled (e.g. YARG StageKit priority). */
  afterGet?: (prefs: AppPreferences) => void
}

/**
 * Register the enabled-groups and disabled-cues IPC handlers for one cue domain. The
 * enabled-groups getter reconciles stored prefs against the registry (auto-enabling new groups,
 * dropping deregistered ones), persists the result, and applies it; the setters validate, persist,
 * apply, and broadcast. Every domain shares this reconcile and apply flow via its registry binding.
 */
function registerCueGroupDomain(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
  spec: CueGroupDomainSpec,
): void {
  const { binding } = spec
  const { domain } = binding

  ipcMain.handle(spec.channels.getEnabled, async () => {
    const config = controllerManager.getConfig()
    const prefs = config.getAllPreferences()
    const domainPrefs = prefs.cueDomains[domain]
    const { enabled, known } = reconcileEnabledGroups(
      domainPrefs.enabledGroups,
      domainPrefs.knownGroups,
      binding.getRegisteredIds(),
    )
    await config.updateCueDomain(domain, { enabledGroups: enabled })
    await config.updateCueDomain(domain, { knownGroups: known })
    binding.setEnabled(enabled)
    binding.setDisabled(domainPrefs.disabledCues)
    spec.afterGet?.(prefs)
    return enabled
  })

  ipcMain.handle(spec.channels.setEnabled, async (_, groupIds: unknown) => {
    try {
      const validation = validateOptionalStringArray(groupIds, 'groupIds')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const config = controllerManager.getConfig()
      await config.updateCueDomain(domain, { enabledGroups: validation.value })
      binding.setEnabled(validation.value)
      binding.setDisabled(config.getPreference('cueDomains')[domain].disabledCues)
      spec.afterSetEnabled?.(controllerManager)
      if (spec.changedEvent) {
        sendToAllWindows(spec.changedEvent, undefined)
      }
      log.info(`Updated ${domain} enabled cue groups:`, validation.value)
      return { success: true }
    } catch (error) {
      log.error(`Error setting enabled ${domain} cue groups:`, error)
      return ipcError(error)
    }
  })

  ipcMain.handle(spec.channels.getDisabled, async () => {
    const disabled = controllerManager.getConfig().getPreference('cueDomains')[domain].disabledCues
    binding.setDisabled(disabled)
    return disabled
  })

  ipcMain.handle(spec.channels.setDisabled, async (_, payload: unknown) => {
    try {
      const validation = validateDisabledCuesMap(payload, spec.disabledLabel)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const config = controllerManager.getConfig()
      await config.updateCueDomain(domain, { disabledCues: validation.value })
      binding.setDisabled(validation.value)
      spec.afterSetDisabled?.(controllerManager)
      if (spec.changedEvent) {
        sendToAllWindows(spec.changedEvent, undefined)
      }
      return { success: true }
    } catch (error) {
      log.error(`Error setting disabled ${domain} cues:`, error)
      return ipcError(error)
    }
  })
}

/** Activate the enabled groups so a group enabled at runtime is immediately selectable (no restart). */
function activateYargGroups(): void {
  const registry = YargCueRegistry.getInstance()
  registry.setActiveGroups(registry.getEnabledGroups())
}

function activateRb3Groups(): void {
  const registry = getRb3CueRegistry()
  registry.setActiveGroups(registry.getEnabledGroups())
}

export function registerCueSelectionConfigHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  const specs: CueGroupDomainSpec[] = [
    {
      binding: cueDomainBinding('yarg'),
      channels: {
        getEnabled: CONFIG.GET_ENABLED_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_YARG_CUES,
        setDisabled: CONFIG.SET_DISABLED_YARG_CUES,
      },
      disabledLabel: 'disabledYargCues',
      afterSetEnabled: activateYargGroups,
      afterGet: (prefs) => {
        const registry = YargCueRegistry.getInstance()
        const configPriority = prefs.stageKitPrefs?.yargPriority || 'random'
        if (registry.getStageKitPriority() !== configPriority) {
          registry.setStageKitPriority(configPriority)
        }
      },
    },
    {
      binding: cueDomainBinding('audio'),
      channels: {
        getEnabled: CONFIG.GET_ENABLED_AUDIO_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_AUDIO_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_AUDIO_CUES,
        setDisabled: CONFIG.SET_DISABLED_AUDIO_CUES,
      },
      disabledLabel: 'disabledAudioCues',
      changedEvent: RENDERER_RECEIVE.AUDIO_CUE_GROUPS_CHANGED,
      afterSetEnabled: (cm) => cm.refreshAudioCueSelection(),
      afterSetDisabled: (cm) => cm.refreshAudioCueSelection(),
    },
    {
      binding: cueDomainBinding('yargMotion'),
      channels: {
        getEnabled: CONFIG.GET_ENABLED_YARG_MOTION_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_YARG_MOTION_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_YARG_MOTION_CUES,
        setDisabled: CONFIG.SET_DISABLED_YARG_MOTION_CUES,
      },
      disabledLabel: 'disabledYargMotionCues',
      changedEvent: RENDERER_RECEIVE.YARG_MOTION_CUE_GROUPS_CHANGED,
    },
    {
      binding: cueDomainBinding('audioMotion'),
      channels: {
        getEnabled: CONFIG.GET_ENABLED_AUDIO_MOTION_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_AUDIO_MOTION_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_AUDIO_MOTION_CUES,
        setDisabled: CONFIG.SET_DISABLED_AUDIO_MOTION_CUES,
      },
      disabledLabel: 'disabledAudioMotionCues',
      changedEvent: RENDERER_RECEIVE.AUDIO_MOTION_CUE_GROUPS_CHANGED,
    },
    {
      binding: cueDomainBinding('rb3'),
      channels: {
        getEnabled: CONFIG.GET_ENABLED_RB3_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_RB3_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_RB3_CUES,
        setDisabled: CONFIG.SET_DISABLED_RB3_CUES,
      },
      disabledLabel: 'disabledRb3Cues',
      changedEvent: RENDERER_RECEIVE.RB3_CUE_GROUPS_CHANGED,
      afterSetEnabled: activateRb3Groups,
    },
    {
      binding: cueDomainBinding('rb3Motion'),
      channels: {
        getEnabled: CONFIG.GET_ENABLED_RB3_MOTION_CUE_GROUPS,
        setEnabled: CONFIG.SET_ENABLED_RB3_MOTION_CUE_GROUPS,
        getDisabled: CONFIG.GET_DISABLED_RB3_MOTION_CUES,
        setDisabled: CONFIG.SET_DISABLED_RB3_MOTION_CUES,
      },
      disabledLabel: 'disabledRb3MotionCues',
      changedEvent: RENDERER_RECEIVE.RB3_MOTION_CUE_GROUPS_CHANGED,
    },
  ]

  for (const spec of specs) {
    registerCueGroupDomain(ipcMain, controllerManager, spec)
  }
}
