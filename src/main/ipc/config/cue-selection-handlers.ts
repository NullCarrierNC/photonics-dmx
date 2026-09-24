import { IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import {
  cueDomainBinding,
  reconcileAndApplyGroups,
  serializeCueDomainOp,
  type CueDomainRegistryBinding,
} from '../../controllers/cueDomainBindings'
import { ipcError } from '../ipcResult'
import { CONFIG } from '../../../shared/ipcChannels'
import { validateOptionalStringArray, validateDisabledCuesMap } from '../inputValidation'
import { createLogger } from '../../../shared/logger'
import { handleInvoke } from '../handleInvoke'
const log = createLogger('cue-selection-handlers')

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
  /** SET-disabled side effect (refresh selection); runs after disabled is applied. */
  afterSetDisabled?: (controllerManager: ControllerManager) => void
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

  const serialize = <T>(op: () => Promise<T>): Promise<T> => serializeCueDomainOp(domain, op)

  handleInvoke(ipcMain, spec.channels.getEnabled, log, () =>
    serialize(async () => {
      const config = controllerManager.getConfig()
      const reconciled = await reconcileAndApplyGroups(binding, config)
      return reconciled.enabled
    }),
  )

  handleInvoke(ipcMain, spec.channels.setEnabled, log, (_, groupIds: unknown) =>
    serialize(async () => {
      try {
        const validation = validateOptionalStringArray(groupIds, 'groupIds')
        if (!validation.ok) {
          return { success: false, error: validation.error }
        }
        const config = controllerManager.getConfig()
        await config.updateCueDomain(domain, { enabledGroups: validation.value })
        binding.setEnabled(validation.value)
        binding.setDisabled(config.getPreference('cueDomains')[domain].disabledCues)
        binding.afterEnabledChange?.(controllerManager)
        if (binding.changedEvent) {
          sendToAllWindows(binding.changedEvent, undefined)
        }
        log.info(`Updated ${domain} enabled cue groups:`, validation.value)
        return { success: true }
      } catch (error) {
        log.error(`Error setting enabled ${domain} cue groups:`, error)
        return ipcError(error)
      }
    }),
  )

  handleInvoke(ipcMain, spec.channels.getDisabled, log, () =>
    serialize(async () => {
      const disabled = controllerManager.getConfig().getPreference('cueDomains')[
        domain
      ].disabledCues
      binding.setDisabled(disabled)
      return disabled
    }),
  )

  handleInvoke(ipcMain, spec.channels.setDisabled, log, (_, payload: unknown) =>
    serialize(async () => {
      try {
        const validation = validateDisabledCuesMap(payload, spec.disabledLabel)
        if (!validation.ok) {
          return { success: false, error: validation.error }
        }
        const config = controllerManager.getConfig()
        await config.updateCueDomain(domain, { disabledCues: validation.value })
        binding.setDisabled(validation.value)
        spec.afterSetDisabled?.(controllerManager)
        if (binding.changedEvent) {
          sendToAllWindows(binding.changedEvent, undefined)
        }
        return { success: true }
      } catch (error) {
        log.error(`Error setting disabled ${domain} cues:`, error)
        return ipcError(error)
      }
    }),
  )
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
      afterSetDisabled: (cm) => cm.refreshRb3CueSelection(),
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
    },
  ]

  for (const spec of specs) {
    registerCueGroupDomain(ipcMain, controllerManager, spec)
  }
}
