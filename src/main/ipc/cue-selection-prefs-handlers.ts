import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { CueRegistry } from '../../photonics-dmx/cues/registries/CueRegistry'
import { ipcError } from './ipcResult'
import { LIGHT } from '../../shared/ipcChannels'
import { validateCueGroupSelectionMode, validateNumberInRange } from './inputValidation'
import type { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import {
  createDefaultCueDomainPrefs,
  type CueDomain,
} from '../../services/configuration/cueDomainTypes'
import { createLogger } from '../../shared/logger'
const log = createLogger('cue-selection-prefs-handlers')

/**
 * One numeric motion tunable of one domain. Each is read, validated, persisted and read back the
 * same way, so all of them are registered from this table rather than as a handler pair apiece.
 */
interface MotionNumberPrefSpec {
  /** Used in log lines only. */
  label: string
  prefsDomain: CueDomain
  field: 'minimumHoldMs' | 'probabilityPercent'
  /** Key the renderer reads the value back under. */
  resultKey: 'minHoldMs' | 'percent'
  max: number
  validationLabel: string
  persist: (config: ConfigurationManager, value: number) => Promise<void>
  channels: { get: string; set: string }
}

const MOTION_NUMBER_PREFS: readonly MotionNumberPrefSpec[] = [
  {
    label: 'motion cue min hold',
    prefsDomain: 'yargMotion',
    field: 'minimumHoldMs',
    resultKey: 'minHoldMs',
    max: 600000,
    validationLabel: 'motionCueMinimumHoldMs',
    persist: (config, value) => config.setMotionCueMinimumHoldMs(value),
    channels: { get: LIGHT.GET_MOTION_CUE_MIN_HOLD_MS, set: LIGHT.SET_MOTION_CUE_MIN_HOLD_MS },
  },
  {
    label: 'RB3 motion cue min hold',
    prefsDomain: 'rb3Motion',
    field: 'minimumHoldMs',
    resultKey: 'minHoldMs',
    max: 600000,
    validationLabel: 'rb3MotionCueMinimumHoldMs',
    persist: (config, value) => config.updateCueDomain('rb3Motion', { minimumHoldMs: value }),
    channels: {
      get: LIGHT.GET_RB3_MOTION_CUE_MIN_HOLD_MS,
      set: LIGHT.SET_RB3_MOTION_CUE_MIN_HOLD_MS,
    },
  },
  {
    label: 'motion cue probability percent',
    prefsDomain: 'yargMotion',
    field: 'probabilityPercent',
    resultKey: 'percent',
    max: 100,
    validationLabel: 'motionCueProbabilityPercent',
    persist: (config, value) => config.setMotionCueProbabilityPercent(value),
    channels: {
      get: LIGHT.GET_MOTION_CUE_PROBABILITY_PERCENT,
      set: LIGHT.SET_MOTION_CUE_PROBABILITY_PERCENT,
    },
  },
  {
    label: 'audio motion cue probability percent',
    prefsDomain: 'audioMotion',
    field: 'probabilityPercent',
    resultKey: 'percent',
    max: 100,
    validationLabel: 'audioMotionCueProbabilityPercent',
    persist: (config, value) => config.setAudioMotionCueProbabilityPercent(value),
    channels: {
      get: LIGHT.GET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT,
      set: LIGHT.SET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT,
    },
  },
  {
    label: 'RB3 motion cue probability percent',
    prefsDomain: 'rb3Motion',
    field: 'probabilityPercent',
    resultKey: 'percent',
    max: 100,
    validationLabel: 'rb3MotionCueProbabilityPercent',
    persist: (config, value) => config.updateCueDomain('rb3Motion', { probabilityPercent: value }),
    channels: {
      get: LIGHT.GET_RB3_MOTION_CUE_PROBABILITY_PERCENT,
      set: LIGHT.SET_RB3_MOTION_CUE_PROBABILITY_PERCENT,
    },
  },
]

/**
 * IPC handlers for cue selection preferences (consistency window, motion min-hold, group selection mode).
 * Persists via ConfigurationManager and propagates to CueRegistry where applicable.
 */
export function setupCueSelectionPrefsHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(LIGHT.SET_CUE_CONSISTENCY_WINDOW, async (_, windowMs: unknown) => {
    try {
      const validated = validateNumberInRange(windowMs, 0, 600000, 'cueConsistencyWindow')
      if (!validated.ok) {
        return ipcError(new Error(validated.error))
      }
      const rounded = Math.round(validated.value)
      await controllerManager.getConfig().setPreference('cueConsistencyWindow', rounded)
      const registry = CueRegistry.getInstance()
      registry.setCueConsistencyWindow(rounded)
      return { success: true, windowMs: rounded }
    } catch (error) {
      log.error('Error setting cue consistency window:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_CUE_CONSISTENCY_WINDOW, async () => {
    try {
      const windowMs = controllerManager.getConfig().getPreference('cueConsistencyWindow')
      return { success: true, windowMs }
    } catch (error) {
      log.error('Error getting cue consistency window:', error)
      return ipcError(error)
    }
  })

  for (const spec of MOTION_NUMBER_PREFS) {
    // An unset tunable reads back as whatever a fresh install would have been seeded with, so the
    // preferences UI and the runtime never report different values for the same missing key.
    const read = () =>
      controllerManager.getConfig().getPreference('cueDomains')[spec.prefsDomain][spec.field] ??
      createDefaultCueDomainPrefs(spec.prefsDomain)[spec.field] ??
      0

    ipcMain.handle(spec.channels.get, async () => {
      try {
        return { success: true, [spec.resultKey]: read() }
      } catch (error) {
        log.error(`Error getting ${spec.label}:`, error)
        return ipcError(error)
      }
    })

    ipcMain.handle(spec.channels.set, async (_, value: unknown) => {
      try {
        const validated = validateNumberInRange(value, 0, spec.max, spec.validationLabel)
        if (!validated.ok) {
          return ipcError(new Error(validated.error))
        }
        await spec.persist(controllerManager.getConfig(), validated.value)
        return { success: true, [spec.resultKey]: read() }
      } catch (error) {
        log.error(`Error setting ${spec.label}:`, error)
        return ipcError(error)
      }
    })
  }

  ipcMain.handle(LIGHT.GET_YARG_FALLBACK_CUE_TIME_MS, async () => {
    try {
      const fallbackMs =
        controllerManager.getConfig().getPreference('yargFallbackCueTimeMs') ?? 20000
      return { success: true, fallbackMs }
    } catch (error) {
      log.error('Error getting YARG fallback cue time:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.SET_YARG_FALLBACK_CUE_TIME_MS, async (_, ms: unknown) => {
    try {
      const validated = validateNumberInRange(ms, 0, 600000, 'yargFallbackCueTimeMs')
      if (!validated.ok) {
        return ipcError(new Error(validated.error))
      }
      await controllerManager.getConfig().setYargFallbackCueTimeMs(validated.value)
      const fallbackMs =
        controllerManager.getConfig().getPreference('yargFallbackCueTimeMs') ?? 20000
      return { success: true, fallbackMs }
    } catch (error) {
      log.error('Error setting YARG fallback cue time:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_RB3_MOTION_CUE_DURATION, async () => {
    try {
      const domain = controllerManager.getConfig().getPreference('cueDomains').rb3Motion
      return { success: true, min: domain.cueDurationMin ?? 5, max: domain.cueDurationMax ?? 20 }
    } catch (error) {
      log.error('Error getting RB3 motion cue duration:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.SET_RB3_MOTION_CUE_DURATION, async (_, range: unknown) => {
    try {
      const r = range as { min?: unknown; max?: unknown }
      const minV = validateNumberInRange(r?.min, 0, 600, 'rb3MotionCueDurationMin')
      const maxV = validateNumberInRange(r?.max, 0, 600, 'rb3MotionCueDurationMax')
      if (!minV.ok) return ipcError(new Error(minV.error))
      if (!maxV.ok) return ipcError(new Error(maxV.error))
      // Keep the range ordered so the countdown draw never inverts.
      const min = Math.min(minV.value, maxV.value)
      const max = Math.max(minV.value, maxV.value)
      await controllerManager
        .getConfig()
        .updateCueDomain('rb3Motion', { cueDurationMin: min, cueDurationMax: max })
      return { success: true, min, max }
    } catch (error) {
      log.error('Error setting RB3 motion cue duration:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.SET_CUE_GROUP_SELECTION_MODE, async (_, mode: unknown) => {
    try {
      const validated = validateCueGroupSelectionMode(mode)
      if (!validated.ok) {
        return ipcError(new Error(validated.error))
      }
      await controllerManager
        .getConfig()
        .updateCueDomain('yarg', { selectionMode: validated.value })
      const registry = CueRegistry.getInstance()
      registry.setCueGroupSelectionMode(validated.value)
      return { success: true, mode: validated.value }
    } catch (error) {
      log.error('Error setting cue group selection mode:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_CUE_GROUP_SELECTION_MODE, async () => {
    try {
      const mode = controllerManager.getConfig().getCueGroupSelectionMode()
      return { success: true, mode }
    } catch (error) {
      log.error('Error getting cue group selection mode:', error)
      return ipcError(error)
    }
  })
}
