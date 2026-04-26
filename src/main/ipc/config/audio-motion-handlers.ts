import { IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import { YargCueRegistry } from '../../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueType } from '../../../photonics-dmx/cues/types/audioCueTypes'
import { ipcError } from '../ipcResult'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  isPlainObject,
  validateAudioConfigPayload,
  validateAudioGameModePayload,
} from '../inputValidation'

export function registerAudioMotionConfigHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(CONFIG.GET_AUDIO_REACTIVE_CUES, async () => {
    try {
      const cues = controllerManager.getAudioCueOptions()
      const activeCueType = controllerManager.getActiveAudioCueType()
      const secondaryCueType = controllerManager.getActiveSecondaryCueType()
      return {
        success: true,
        activeCueType,
        secondaryCueType,
        cues,
      }
    } catch (error) {
      console.error('Error getting audio reactive cue state:', error)
      return {
        ...ipcError(error),
        activeCueType: null,
        secondaryCueType: null,
        cues: [],
      }
    }
  })

  ipcMain.handle(CONFIG.SET_ACTIVE_AUDIO_CUE, async (_, cueType: AudioCueType) => {
    try {
      const result = controllerManager.setActiveAudioCueType(cueType)
      if (!result.success) {
        return result
      }
      return { success: true }
    } catch (error) {
      console.error('Error setting active audio cue:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_AUDIO_GAME_MODE, async () => {
    return controllerManager.getAudioGameModeConfig()
  })

  ipcMain.handle(CONFIG.SET_AUDIO_GAME_MODE, async (_, updates: unknown) => {
    try {
      const base = controllerManager.getAudioGameModeConfig()
      const validation = validateAudioGameModePayload(updates, base)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager.setAudioGameModeConfig(validation.value)
      sendToAllWindows(RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE, validation.value)
      return { success: true, config: validation.value }
    } catch (error) {
      console.error('Error setting audio game mode:', error)
      return { ...ipcError(error), success: false }
    }
  })

  ipcMain.handle(CONFIG.GET_MOTION_ENABLED, async () => {
    return controllerManager.getConfig().getPreference('motionEnabled') ?? true
  })

  ipcMain.handle(CONFIG.SET_MOTION_ENABLED, async (_, enabled: unknown) => {
    try {
      if (typeof enabled !== 'boolean') {
        return { success: false, error: 'motion enabled must be a boolean' }
      }
      await controllerManager.getConfig().setPreference('motionEnabled', enabled)
      controllerManager.setMotionEnabledGlobal(enabled)
      sendToAllWindows(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, enabled)
      return { success: true }
    } catch (error) {
      console.error('Error setting motion enabled:', error)
      return { ...ipcError(error), success: false }
    }
  })

  ipcMain.handle(CONFIG.GET_ACTIVE_AUDIO_MOTION_CUE, async () => {
    return (
      controllerManager.getConfig().getPreference('cueDomains').audioMotion.activeCueRef ?? null
    )
  })

  ipcMain.handle(CONFIG.SET_ACTIVE_AUDIO_MOTION_CUE, async (_, ref: unknown) => {
    try {
      if (ref !== null && ref !== undefined) {
        if (!isPlainObject(ref)) {
          return { success: false, error: 'Invalid active audio motion cue ref' }
        }
        const groupId =
          typeof (ref as { groupId?: unknown }).groupId === 'string'
            ? (ref as { groupId: string }).groupId.trim()
            : ''
        const cueId =
          typeof (ref as { cueId?: unknown }).cueId === 'string'
            ? (ref as { cueId: string }).cueId.trim()
            : ''
        if (!groupId || !cueId) {
          return { success: false, error: 'groupId and cueId are required' }
        }
        await controllerManager
          .getConfig()
          .updateCueDomain('audioMotion', { activeCueRef: { groupId, cueId } })
        controllerManager.setActiveAudioMotionCueRef({ groupId, cueId })
        return { success: true }
      }
      await controllerManager.getConfig().updateCueDomain('audioMotion', { activeCueRef: null })
      controllerManager.setActiveAudioMotionCueRef(null)
      return { success: true }
    } catch (error) {
      console.error('Error setting active audio motion cue:', error)
      return { ...ipcError(error), success: false }
    }
  })

  ipcMain.handle(CONFIG.GET_ACTIVE_YARG_MOTION_CUE, async () => {
    return controllerManager.getConfig().getPreference('cueDomains').yargMotion.activeCueRef ?? null
  })

  ipcMain.handle(CONFIG.SET_ACTIVE_YARG_MOTION_CUE, async (_, ref: unknown) => {
    try {
      if (ref !== null && ref !== undefined) {
        if (!isPlainObject(ref)) {
          return { success: false, error: 'Invalid active YARG motion cue ref' }
        }
        const groupId =
          typeof (ref as { groupId?: unknown }).groupId === 'string'
            ? (ref as { groupId: string }).groupId.trim()
            : ''
        const cueId =
          typeof (ref as { cueId?: unknown }).cueId === 'string'
            ? (ref as { cueId: string }).cueId.trim()
            : ''
        if (!groupId || !cueId) {
          return { success: false, error: 'groupId and cueId are required' }
        }
        await controllerManager
          .getConfig()
          .updateCueDomain('yargMotion', { activeCueRef: { groupId, cueId } })
        controllerManager.setActiveYargMotionCueRef({ groupId, cueId })
        return { success: true }
      }
      await controllerManager.getConfig().updateCueDomain('yargMotion', { activeCueRef: null })
      controllerManager.setActiveYargMotionCueRef(null)
      return { success: true }
    } catch (error) {
      console.error('Error setting active YARG motion cue:', error)
      return { ...ipcError(error), success: false }
    }
  })

  ipcMain.handle(CONFIG.GET_STAGE_KIT_PRIORITY, async () => {
    const prefs = controllerManager.getConfig().getAllPreferences()
    return prefs.stageKitPrefs?.yargPriority || 'prefer-for-tracked'
  })

  ipcMain.handle(
    CONFIG.SET_STAGE_KIT_PRIORITY,
    async (_, priority: 'prefer-for-tracked' | 'random' | 'never') => {
      try {
        if (!['prefer-for-tracked', 'random', 'never'].includes(priority)) {
          return { success: false, error: 'Invalid stage kit priority' }
        }
        await controllerManager.getConfig().updatePreferences({
          stageKitPrefs: { yargPriority: priority },
        })

        const registry = YargCueRegistry.getInstance()
        registry.setStageKitPriority(priority)

        registry.clearConsistencyTracking()

        console.log('Updated stage kit priority to:', priority)

        return { success: true }
      } catch (error) {
        console.error('Error setting stage kit priority:', error)
        return ipcError(error)
      }
    },
  )

  ipcMain.handle(CONFIG.GET_CLOCK_RATE, async () => {
    try {
      const clockRate = controllerManager.getConfig().getPreference('clockRate')
      return { success: true, clockRate }
    } catch (error) {
      console.error('Error getting clock rate:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.SET_CLOCK_RATE, async (_, clockRate: number) => {
    try {
      if (clockRate < 1 || clockRate > 100) {
        return {
          success: false,
          error: 'Clock rate must be between 1 and 100 milliseconds',
        }
      }

      await controllerManager.getConfig().setClockRate(clockRate)

      await controllerManager.restartControllers()

      console.log('Updated clock rate to:', clockRate, 'ms')

      return { success: true }
    } catch (error) {
      console.error('Error setting clock rate:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_AUDIO_CONFIG, async () => {
    return controllerManager.getConfig().getAudioConfig()
  })

  ipcMain.handle(CONFIG.SAVE_AUDIO_CONFIG, async (_, updates: unknown) => {
    try {
      const validation = validateAudioConfigPayload(updates)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const validatedUpdates = validation.value

      const currentConfig = controllerManager.getConfig().getAudioConfig()
      const currentDeviceId = currentConfig?.deviceId
      const newDeviceId = validatedUpdates.deviceId as string | undefined

      const deviceChanged = newDeviceId !== undefined && newDeviceId !== currentDeviceId

      await controllerManager.getConfig().updateAudioConfig(validatedUpdates)

      const updatedConfig = controllerManager.getConfig().getAudioConfig()

      sendToAllWindows(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, updatedConfig)
      console.log('Sent audio:config-update to renderer')

      if (controllerManager.getIsAudioEnabled()) {
        if (deviceChanged) {
          console.log('Device changed, restarting audio capture...')
          try {
            await controllerManager.disableAudio()
            await controllerManager.enableAudio()
          } catch (error) {
            console.error('Failed to restart audio with new device:', error)
          }
        } else {
          controllerManager.updateAudioConfig(updatedConfig)
        }
      }

      if (validatedUpdates.enabled !== undefined) {
        if (validatedUpdates.enabled) {
          await controllerManager.enableAudio()
        } else {
          await controllerManager.disableAudio()
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Error saving audio configuration:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_AUDIO_ENABLED, async () => {
    return controllerManager.getIsAudioEnabled()
  })

  ipcMain.handle(CONFIG.SET_AUDIO_ENABLED, async (_, enabled: boolean) => {
    try {
      if (enabled) {
        await controllerManager.enableAudio()
      } else {
        await controllerManager.disableAudio()
      }

      sendToAllWindows(RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED, { enabled })

      return { success: true }
    } catch (error) {
      console.error('Error setting audio enabled state:', error)
      return ipcError(error)
    }
  })
}
