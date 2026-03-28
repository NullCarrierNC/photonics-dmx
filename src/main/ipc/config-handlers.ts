import { app, IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { sendToAllWindows } from '../utils/windowUtils'
import '../../photonics-dmx/cues'
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { AudioCueType } from '../../photonics-dmx/cues/types/audioCueTypes'
import { setGlobalBrightnessConfig } from '../../photonics-dmx/helpers/dmxHelpers'
import { DmxRig, DmxFixture } from '../../photonics-dmx/types'
import { ipcError } from './ipcResult'
import { CONFIG, RENDERER_RECEIVE } from '../../shared/ipcChannels'
import {
  isPlainObject,
  validateLightingConfiguration,
  validateOptionalStringArray,
  validatePreferencesPayload,
  validateAudioConfigPayload,
  validateAudioGameModePayload,
  validateDisabledCuesMap,
} from './inputValidation'

/**
 * Set up configuration-related IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupConfigHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  // Get light library (default templates)
  ipcMain.handle(CONFIG.GET_LIGHT_LIBRARY, async () => {
    return controllerManager.getConfig().getLightLibrary()
  })

  // Get user's lights
  ipcMain.handle(CONFIG.GET_MY_LIGHTS, async () => {
    return controllerManager.getConfig().getUserLights()
  })

  // Save user's lights
  ipcMain.on(CONFIG.SAVE_MY_LIGHTS, (_, data: unknown) => {
    if (!Array.isArray(data)) {
      console.error('SAVE_MY_LIGHTS: payload must be an array')
      return
    }
    controllerManager
      .getConfig()
      .updateUserLights(data as DmxFixture[])
      .catch((err) => {
        console.error('SAVE_MY_LIGHTS failed:', err)
      })
  })

  // Get light layout
  ipcMain.handle(CONFIG.GET_LIGHT_LAYOUT, async (_, filename: string) => {
    try {
      return controllerManager.getConfig().getLightingLayout()
    } catch (error) {
      console.error(`Error fetching light layout for ${filename}:`, error)
      throw error
    }
  })

  // Save light layout
  ipcMain.handle(CONFIG.SAVE_LIGHT_LAYOUT, async (_, data: unknown) => {
    try {
      const validation = validateLightingConfiguration(data)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager.getConfig().updateLightingLayout(validation.value)

      // Then restart controllers to pick up the changes
      await controllerManager.restartControllers()

      // Send a notification to the renderer about the restart
      sendToAllWindows(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, undefined)

      return { success: true }
    } catch (error) {
      console.error('Error saving light layout:', error)
      return ipcError(error)
    }
  })

  // DMX Rigs handlers

  // Get all DMX rigs
  ipcMain.handle(CONFIG.GET_DMX_RIGS, async () => {
    try {
      return controllerManager.getConfig().getDmxRigs()
    } catch (error) {
      console.error('Error fetching DMX rigs:', error)
      throw error
    }
  })

  // Get a specific DMX rig by ID
  ipcMain.handle(CONFIG.GET_DMX_RIG, async (_, id: string) => {
    try {
      return controllerManager.getConfig().getDmxRig(id)
    } catch (error) {
      console.error(`Error fetching DMX rig ${id}:`, error)
      throw error
    }
  })

  // Get only active DMX rigs
  ipcMain.handle(CONFIG.GET_ACTIVE_RIGS, async () => {
    try {
      return controllerManager.getConfig().getActiveRigs()
    } catch (error) {
      console.error('Error fetching active DMX rigs:', error)
      throw error
    }
  })

  // Save or update a DMX rig
  ipcMain.handle(CONFIG.SAVE_DMX_RIG, async (_, rig: DmxRig) => {
    try {
      if (!isPlainObject(rig) || typeof rig.id !== 'string' || rig.id.trim().length === 0) {
        return { success: false, error: 'Invalid DMX rig payload' }
      }
      const config = controllerManager.getConfig()
      const existingRig = config.getDmxRig(rig.id)
      const previousActiveState = existingRig?.active ?? false

      // Save the rig
      await config.saveDmxRig(rig)

      // If active state changed, refresh active rigs so DMX output picks up the change (senders stay running)
      if (existingRig && previousActiveState !== rig.active) {
        controllerManager.refreshActiveRigs()
        sendToAllWindows(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, undefined)
      }

      return { success: true }
    } catch (error) {
      console.error(`Error saving DMX rig ${rig.id}:`, error)
      return ipcError(error)
    }
  })

  // Delete a DMX rig
  ipcMain.handle(CONFIG.DELETE_DMX_RIG, async (_, id: string) => {
    try {
      const config = controllerManager.getConfig()
      const rig = config.getDmxRig(id)
      const wasActive = rig?.active ?? false

      // Delete the rig
      await config.deleteDmxRig(id)

      // If the deleted rig was active, refresh active rigs so DMX output picks up the change
      if (wasActive) {
        controllerManager.refreshActiveRigs()
        sendToAllWindows(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, undefined)
      }

      return { success: true }
    } catch (error) {
      console.error(`Error deleting DMX rig ${id}:`, error)
      return ipcError(error)
    }
  })

  // Get app version
  ipcMain.handle(CONFIG.GET_APP_VERSION, () => {
    return app.getVersion()
  })

  // Get and clear buffered validation errors from cue/effect load (before window existed)
  ipcMain.handle(CONFIG.GET_VALIDATION_ERRORS, () => {
    return controllerManager.flushValidationErrors()
  })

  // Get app preferences
  ipcMain.handle(CONFIG.GET_PREFS, async () => {
    return controllerManager.getConfig().getAllPreferences()
  })

  // Save app preferences
  ipcMain.handle(CONFIG.SAVE_PREFS, async (_, updates: unknown) => {
    try {
      const validation = validatePreferencesPayload(updates)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager.getConfig().updatePreferences(validation.value)

      if (validation.value.brightness) {
        const brightnessConfig = controllerManager.getConfig().getAllPreferences().brightness
        if (brightnessConfig) {
          setGlobalBrightnessConfig(brightnessConfig)
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Error saving preferences:', error)
      return ipcError(error)
    }
  })

  // Get enabled cue groups
  ipcMain.handle(CONFIG.GET_ENABLED_CUE_GROUPS, async () => {
    const registry = YargCueRegistry.getInstance()
    const config = controllerManager.getConfig()
    const prefs = config.getAllPreferences()
    let enabled = prefs.enabledCueGroups
    const allGroups = registry.getAllGroups()
    const knownYargCueGroups = prefs.knownYargCueGroups ?? []

    if (enabled === undefined) {
      enabled = allGroups
      await config.setEnabledCueGroups(enabled)
      await config.setKnownYargCueGroups(allGroups)
      registry.setEnabledGroups(enabled)
    } else {
      // Auto-enable only genuinely new groups (not yet in known list); user-disabled groups stay disabled
      const newGroups = allGroups.filter((id) => !knownYargCueGroups.includes(id))
      if (newGroups.length > 0) {
        enabled = [...enabled, ...newGroups]
        await config.setEnabledCueGroups(enabled)
      }
      await config.setKnownYargCueGroups(allGroups)
      registry.setEnabledGroups(enabled)
    }

    // Initialize stage kit priority in the registry if not already set
    const currentPriority = registry.getStageKitPriority()
    const configPriority = prefs.stageKitPrefs?.yargPriority || 'prefer-for-tracked'

    if (currentPriority !== configPriority) {
      registry.setStageKitPriority(configPriority)
    }

    const disabledYarg = config.getDisabledYargCues() ?? {}
    registry.setDisabledCues(disabledYarg)

    return enabled!
  })

  // Set enabled cue groups
  ipcMain.handle(CONFIG.SET_ENABLED_CUE_GROUPS, async (_, groupIds: string[]) => {
    try {
      const validation = validateOptionalStringArray(groupIds, 'groupIds')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager.getConfig().setEnabledCueGroups(groupIds)

      // Update the CueRegistry with the new enabled groups
      const registry = YargCueRegistry.getInstance()

      registry.setEnabledGroups(groupIds)
      const disabledYarg = controllerManager.getConfig().getDisabledYargCues() ?? {}
      registry.setDisabledCues(disabledYarg)

      console.log('Updated CueRegistry enabled groups:', groupIds)

      return { success: true }
    } catch (error) {
      console.error('Error setting enabled cue groups:', error)
      return ipcError(error)
    }
  })

  // Get enabled audio cue groups
  ipcMain.handle(CONFIG.GET_ENABLED_AUDIO_CUE_GROUPS, async () => {
    const registry = AudioCueRegistry.getInstance()
    const config = controllerManager.getConfig()
    const prefs = config.getAllPreferences()
    let enabled = prefs.enabledAudioCueGroups
    const allGroups = registry.getRegisteredGroups()
    const knownAudioCueGroups = prefs.knownAudioCueGroups ?? []

    if (!enabled || enabled.length === 0) {
      enabled = allGroups
      if (allGroups.length > 0) {
        await config.setEnabledAudioCueGroups(enabled)
      }
      await config.setKnownAudioCueGroups(allGroups)
      registry.setEnabledGroups(enabled)
    } else {
      // Auto-enable only genuinely new groups (not yet in known list); user-disabled groups stay disabled
      const newGroups = allGroups.filter((id) => !knownAudioCueGroups.includes(id))
      if (newGroups.length > 0) {
        enabled = [...enabled, ...newGroups]
        await config.setEnabledAudioCueGroups(enabled)
      }
      await config.setKnownAudioCueGroups(allGroups)
      registry.setEnabledGroups(enabled)
    }

    const disabledAudio = config.getDisabledAudioCues() ?? {}
    registry.setDisabledCues(disabledAudio)
    return enabled
  })

  // Set enabled audio cue groups
  ipcMain.handle(CONFIG.SET_ENABLED_AUDIO_CUE_GROUPS, async (_, groupIds: string[]) => {
    try {
      const validation = validateOptionalStringArray(groupIds, 'groupIds')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager.getConfig().setEnabledAudioCueGroups(groupIds)
      const registry = AudioCueRegistry.getInstance()
      registry.setEnabledGroups(groupIds)
      const disabledAudio = controllerManager.getConfig().getDisabledAudioCues() ?? {}
      registry.setDisabledCues(disabledAudio)
      controllerManager.refreshAudioCueSelection()
      sendToAllWindows(RENDERER_RECEIVE.AUDIO_CUE_GROUPS_CHANGED, undefined)
      console.log('Updated AudioCueRegistry enabled groups:', groupIds)
      return { success: true }
    } catch (error) {
      console.error('Error setting enabled audio cue groups:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_DISABLED_YARG_CUES, async () => {
    const disabled = controllerManager.getConfig().getDisabledYargCues() ?? {}
    YargCueRegistry.getInstance().setDisabledCues(disabled)
    return disabled
  })

  ipcMain.handle(CONFIG.SET_DISABLED_YARG_CUES, async (_, payload: unknown) => {
    try {
      const validation = validateDisabledCuesMap(payload, 'disabledYargCues')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager.getConfig().setDisabledYargCues(validation.value)
      YargCueRegistry.getInstance().setDisabledCues(validation.value)
      return { success: true }
    } catch (error) {
      console.error('Error setting disabled YARG cues:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_DISABLED_AUDIO_CUES, async () => {
    const disabled = controllerManager.getConfig().getDisabledAudioCues() ?? {}
    AudioCueRegistry.getInstance().setDisabledCues(disabled)
    return disabled
  })

  ipcMain.handle(CONFIG.SET_DISABLED_AUDIO_CUES, async (_, payload: unknown) => {
    try {
      const validation = validateDisabledCuesMap(payload, 'disabledAudioCues')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager.getConfig().setDisabledAudioCues(validation.value)
      AudioCueRegistry.getInstance().setDisabledCues(validation.value)
      controllerManager.refreshAudioCueSelection()
      sendToAllWindows(RENDERER_RECEIVE.AUDIO_CUE_GROUPS_CHANGED, undefined)
      return { success: true }
    } catch (error) {
      console.error('Error setting disabled audio cues:', error)
      return ipcError(error)
    }
  })

  // Get cue options + active selection for audio reactive mode
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

  // Set the active audio cue type
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

  // Get stage kit priority preference
  ipcMain.handle(CONFIG.GET_STAGE_KIT_PRIORITY, async () => {
    const prefs = controllerManager.getConfig().getAllPreferences()
    return prefs.stageKitPrefs?.yargPriority || 'prefer-for-tracked'
  })

  // Set stage kit priority preference
  ipcMain.handle(
    CONFIG.SET_STAGE_KIT_PRIORITY,
    async (_, priority: 'prefer-for-tracked' | 'random' | 'never') => {
      try {
        if (!['prefer-for-tracked', 'random', 'never'].includes(priority)) {
          return { success: false, error: 'Invalid stage kit priority' }
        }
        // Update the preference in the config
        await controllerManager.getConfig().updatePreferences({
          stageKitPrefs: { yargPriority: priority },
        })

        // Sync with the CueRegistry
        const registry = YargCueRegistry.getInstance()
        registry.setStageKitPriority(priority)

        // Clear any existing consistency tracking to ensure new priority takes effect immediately
        registry.clearConsistencyTracking()

        console.log('Updated stage kit priority to:', priority)

        return { success: true }
      } catch (error) {
        console.error('Error setting stage kit priority:', error)
        return ipcError(error)
      }
    },
  )

  // Get clock rate preference
  ipcMain.handle(CONFIG.GET_CLOCK_RATE, async () => {
    try {
      const clockRate = controllerManager.getConfig().getClockRate()
      return { success: true, clockRate }
    } catch (error) {
      console.error('Error getting clock rate:', error)
      return ipcError(error)
    }
  })

  // Set clock rate preference
  ipcMain.handle(CONFIG.SET_CLOCK_RATE, async (_, clockRate: number) => {
    try {
      // Validate clock rate range
      if (clockRate < 1 || clockRate > 100) {
        return {
          success: false,
          error: 'Clock rate must be between 1 and 100 milliseconds',
        }
      }

      // Update the preference in the config
      await controllerManager.getConfig().setClockRate(clockRate)

      // Restart controllers to apply the new clock rate
      await controllerManager.restartControllers()

      console.log('Updated clock rate to:', clockRate, 'ms')

      return { success: true }
    } catch (error) {
      console.error('Error setting clock rate:', error)
      return ipcError(error)
    }
  })

  // Audio configuration handlers

  // Get audio configuration
  ipcMain.handle(CONFIG.GET_AUDIO_CONFIG, async () => {
    return controllerManager.getConfig().getAudioConfig()
  })

  // Save audio configuration
  ipcMain.handle(CONFIG.SAVE_AUDIO_CONFIG, async (_, updates: unknown) => {
    try {
      const validation = validateAudioConfigPayload(updates)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const validatedUpdates = validation.value

      // Get current config to check if deviceId changed
      const currentConfig = controllerManager.getConfig().getAudioConfig()
      const currentDeviceId = currentConfig?.deviceId
      const newDeviceId = validatedUpdates.deviceId as string | undefined

      // Check if device changed (handle undefined/default case)
      const deviceChanged = newDeviceId !== undefined && newDeviceId !== currentDeviceId

      // Save the config
      await controllerManager.getConfig().updateAudioConfig(validatedUpdates)

      // Get updated config
      const updatedConfig = controllerManager.getConfig().getAudioConfig()

      // Always notify renderer process to update config, even if audio is disabled
      // This ensures the UI stays in sync with saved config
      sendToAllWindows(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, updatedConfig)
      console.log('Sent audio:config-update to renderer')

      // If audio is currently enabled, apply config updates immediately
      if (controllerManager.getIsAudioEnabled()) {
        // If device changed, we need to restart audio capture
        if (deviceChanged) {
          console.log('Device changed, restarting audio capture...')
          try {
            // Disable and re-enable to restart with new device
            await controllerManager.disableAudio()
            await controllerManager.enableAudio()
          } catch (error) {
            console.error('Failed to restart audio with new device:', error)
            // Don't throw - config is still saved, user can manually restart
          }
        } else {
          // Update running processor
          controllerManager.updateAudioConfig(updatedConfig)
        }
      }

      // If enabled state changed, start/stop audio
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

  // Get audio enabled state
  ipcMain.handle(CONFIG.GET_AUDIO_ENABLED, async () => {
    return controllerManager.getIsAudioEnabled()
  })

  // Enable/disable audio
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
