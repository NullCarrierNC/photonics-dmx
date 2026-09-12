import { handleInvoke } from '../handleInvoke'
import { IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import { CueRegistry } from '../../../photonics-dmx/cues/registries/CueRegistry'
import { ipcError } from '../ipcResult'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  validateAudioCueType,
  validateAudioConfigPayload,
  validateAudioGameModePayload,
  validateCueRefPayload,
  validateNumberInRange,
  validateStageKitPriority,
} from '../inputValidation'
import { createLogger } from '../../../shared/logger'
import { CLOCK_RATE_MS_MAX, CLOCK_RATE_MS_MIN } from '../../../shared/clockRate'

const log = createLogger('audio-motion-handlers')

/** Shorthand for the audio listener surface every handler below drives. */
function audioOf(
  manager: ControllerManager,
): ReturnType<ControllerManager['getListenerLifecycle']>['audio'] {
  return manager.getListenerLifecycle().audio
}

export function registerAudioMotionConfigHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  handleInvoke(ipcMain, CONFIG.GET_AUDIO_REACTIVE_CUES, log, async () => {
    try {
      const cues = audioOf(controllerManager).getAudioCueOptions()
      const activeCueType = audioOf(controllerManager).getActiveAudioCueType()
      const secondaryCueType = audioOf(controllerManager).getActiveSecondaryCueType()
      return {
        success: true,
        activeCueType,
        secondaryCueType,
        cues,
      }
    } catch (error) {
      log.error('Error getting audio reactive cue state:', error)
      return {
        ...ipcError(error),
        activeCueType: null,
        secondaryCueType: null,
        cues: [],
      }
    }
  })

  handleInvoke(ipcMain, CONFIG.SET_ACTIVE_AUDIO_CUE, log, async (_, cueType: unknown) => {
    // Structural validation rejects unknown cue types up front; the controller still re-checks
    // membership against currently-enabled groups (cue may be registered but disabled).
    const validation = validateAudioCueType(cueType)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }
    const result = audioOf(controllerManager).setActiveAudioCueType(validation.value)
    if (!result.success) {
      return result
    }
    return { success: true }
  })

  handleInvoke(ipcMain, CONFIG.GET_AUDIO_GAME_MODE, log, async () => {
    return audioOf(controllerManager).getAudioGameModeConfig()
  })

  handleInvoke(ipcMain, CONFIG.SET_AUDIO_GAME_MODE, log, async (_, updates: unknown) => {
    try {
      const base = audioOf(controllerManager).getAudioGameModeConfig()
      const validation = validateAudioGameModePayload(updates, base)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await audioOf(controllerManager).setAudioGameModeConfig(validation.value)
      sendToAllWindows(RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE, validation.value)
      return { success: true, config: validation.value }
    } catch (error) {
      log.error('Error setting audio game mode:', error)
      return { ...ipcError(error), success: false }
    }
  })

  handleInvoke(ipcMain, CONFIG.GET_MOTION_ENABLED, log, async () => {
    return controllerManager.getConfig().getPreference('motionEnabled') ?? true
  })

  handleInvoke(ipcMain, CONFIG.SET_MOTION_ENABLED, log, async (_, enabled: unknown) => {
    try {
      if (typeof enabled !== 'boolean') {
        return { success: false, error: 'motion enabled must be a boolean' }
      }
      await controllerManager.getConfig().setPreference('motionEnabled', enabled)
      controllerManager.setMotionEnabledGlobal(enabled)
      sendToAllWindows(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, enabled)
      return { success: true }
    } catch (error) {
      log.error('Error setting motion enabled:', error)
      return { ...ipcError(error), success: false }
    }
  })

  handleInvoke(ipcMain, CONFIG.GET_ACTIVE_AUDIO_MOTION_CUE, log, async () => {
    return (
      controllerManager.getConfig().getPreference('cueDomains').audioMotion.activeCueRef ?? null
    )
  })

  handleInvoke(ipcMain, CONFIG.SET_ACTIVE_AUDIO_MOTION_CUE, log, async (_, ref: unknown) => {
    try {
      const validation = validateCueRefPayload(ref)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager
        .getConfig()
        .updateCueDomain('audioMotion', { activeCueRef: validation.value })
      audioOf(controllerManager).setActiveAudioMotionCueRef(validation.value)
      return { success: true }
    } catch (error) {
      log.error('Error setting active audio motion cue:', error)
      return { ...ipcError(error), success: false }
    }
  })

  handleInvoke(ipcMain, CONFIG.GET_ACTIVE_YARG_MOTION_CUE, log, async () => {
    return controllerManager.getConfig().getPreference('cueDomains').yargMotion.activeCueRef ?? null
  })

  handleInvoke(ipcMain, CONFIG.SET_ACTIVE_YARG_MOTION_CUE, log, async (_, ref: unknown) => {
    try {
      const validation = validateCueRefPayload(ref)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager
        .getConfig()
        .updateCueDomain('yargMotion', { activeCueRef: validation.value })
      controllerManager.setActiveYargMotionCueRef(validation.value)
      return { success: true }
    } catch (error) {
      log.error('Error setting active YARG motion cue:', error)
      return { ...ipcError(error), success: false }
    }
  })

  handleInvoke(ipcMain, CONFIG.GET_ACTIVE_RB3_MOTION_CUE, log, async () => {
    return controllerManager.getConfig().getPreference('cueDomains').rb3Motion.activeCueRef ?? null
  })

  handleInvoke(ipcMain, CONFIG.SET_ACTIVE_RB3_MOTION_CUE, log, async (_, ref: unknown) => {
    try {
      const validation = validateCueRefPayload(ref)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager
        .getConfig()
        .updateCueDomain('rb3Motion', { activeCueRef: validation.value })
      controllerManager.setActiveRb3MotionCueRef(validation.value)
      return { success: true }
    } catch (error) {
      log.error('Error setting active RB3 motion cue:', error)
      return { ...ipcError(error), success: false }
    }
  })

  handleInvoke(ipcMain, CONFIG.GET_STAGE_KIT_PRIORITY, log, async () => {
    const prefs = controllerManager.getConfig().getAllPreferences()
    return prefs.stageKitPrefs?.yargPriority || 'random'
  })

  handleInvoke(ipcMain, CONFIG.SET_STAGE_KIT_PRIORITY, log, async (_, priority: unknown) => {
    const validation = validateStageKitPriority(priority)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }
    await controllerManager.getConfig().updatePreferences({
      stageKitPrefs: { yargPriority: validation.value },
    })

    const registry = CueRegistry.getInstance()
    registry.setStageKitPriority(validation.value)
    registry.clearConsistencyTracking()

    log.info('Updated stage kit priority to:', validation.value)

    return { success: true }
  })

  handleInvoke(ipcMain, CONFIG.GET_CLOCK_RATE, log, async () => {
    const clockRate = controllerManager.getConfig().getPreference('clockRate')
    return { success: true, clockRate }
  })

  handleInvoke(ipcMain, CONFIG.SET_CLOCK_RATE, log, async (_, clockRate: unknown) => {
    const rateValidation = validateNumberInRange(
      clockRate,
      CLOCK_RATE_MS_MIN,
      CLOCK_RATE_MS_MAX,
      'clockRate',
    )
    if (!rateValidation.ok) {
      return { success: false, error: rateValidation.error }
    }

    await controllerManager.getConfig().setClockRate(rateValidation.value)

    await controllerManager.restartControllers()

    log.info('Updated clock rate to:', rateValidation.value, 'ms')

    return { success: true }
  })

  handleInvoke(ipcMain, CONFIG.GET_AUDIO_CONFIG, log, async () => {
    return controllerManager.getConfig().getAudioConfig()
  })

  handleInvoke(ipcMain, CONFIG.SAVE_AUDIO_CONFIG, log, async (_, updates: unknown) => {
    const validation = validateAudioConfigPayload(updates)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }
    const validatedUpdates = validation.value

    const currentConfig = controllerManager.getConfig().getAudioConfig()
    const currentDeviceId = currentConfig?.deviceId
    const hasDeviceIdUpdate = 'deviceId' in validatedUpdates
    const newDeviceId = validatedUpdates.deviceId

    const deviceChanged =
      hasDeviceIdUpdate && (newDeviceId ?? undefined) !== (currentDeviceId ?? undefined)

    await controllerManager.getConfig().updateAudioConfig(validatedUpdates)

    const updatedConfig = controllerManager.getConfig().getAudioConfig()

    sendToAllWindows(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, updatedConfig)
    log.info('Sent audio:config-update to renderer')

    let warning: string | undefined
    if (controllerManager.getIsAudioEnabled()) {
      if (deviceChanged) {
        log.info('Device changed, restarting audio capture...')
        try {
          await controllerManager.disableAudio()
          await controllerManager.enableAudio()
        } catch (error) {
          log.error('Failed to restart audio with new device:', error)
          // The selection is saved, so keep it rather than reverting, but tell the renderer
          // that capture is not running on it.
          warning = `Saved, but audio capture failed to restart: ${
            error instanceof Error ? error.message : String(error)
          }`
        }
      } else {
        audioOf(controllerManager).updateAudioConfig(updatedConfig)
      }
    }

    if (validatedUpdates.enabled !== undefined) {
      if (validatedUpdates.enabled) {
        await controllerManager.enableAudio()
      } else {
        await controllerManager.disableAudio()
      }
    }

    return warning ? { success: true, warning } : { success: true }
  })

  handleInvoke(ipcMain, CONFIG.GET_AUDIO_ENABLED, log, async () => {
    return controllerManager.getIsAudioEnabled()
  })

  handleInvoke(ipcMain, CONFIG.SET_AUDIO_ENABLED, log, async (_, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      return { success: false, error: 'enabled must be a boolean' }
    }
    if (enabled) {
      await controllerManager.enableAudio()
    } else {
      await controllerManager.disableAudio()
    }

    sendToAllWindows(RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED, { enabled })

    return { success: true }
  })
}
