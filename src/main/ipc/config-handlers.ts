import { IpcMain, BrowserWindow } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
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
    controllerManager.getConfig().updateUserLights(data as DmxFixture[])
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
  ipcMain.handle(CONFIG.SAVE_LIGHT_LAYOUT, async (_, filename: string, data: unknown) => {
    try {
      const validation = validateLightingConfiguration(data)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      controllerManager.getConfig().updateLightingLayout(validation.value)

      // Then restart controllers to pick up the changes
      await controllerManager.restartControllers()

      // Send a notification to the renderer about the restart
      const mainWindow = require('electron').BrowserWindow.getFocusedWindow()
      if (mainWindow) {
        mainWindow.webContents.send(RENDERER_RECEIVE.CONTROLLERS_RESTARTED)
      }

      return { success: true }
    } catch (error) {
      console.error(`Error saving light layout ${filename}:`, error)
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
      config.saveDmxRig(rig)

      // If active state changed, restart controllers to update DMX output
      if (existingRig && previousActiveState !== rig.active) {
        await controllerManager.restartControllers()

        // Send a notification to the renderer about the restart
        const mainWindow = BrowserWindow.getFocusedWindow()
        if (mainWindow) {
          mainWindow.webContents.send(RENDERER_RECEIVE.CONTROLLERS_RESTARTED)
        }
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
      config.deleteDmxRig(id)

      // If the deleted rig was active, restart controllers
      if (wasActive) {
        await controllerManager.restartControllers()

        // Send a notification to the renderer about the restart
        const mainWindow = BrowserWindow.getFocusedWindow()
        if (mainWindow) {
          mainWindow.webContents.send(RENDERER_RECEIVE.CONTROLLERS_RESTARTED)
        }
      }

      return { success: true }
    } catch (error) {
      console.error(`Error deleting DMX rig ${id}:`, error)
      return ipcError(error)
    }
  })

  // Get app version
  ipcMain.handle(CONFIG.GET_APP_VERSION, () => {
    return require('electron').app.getVersion()
  })

  // Get app preferences
  ipcMain.handle(CONFIG.GET_PREFS, async () => {
    return controllerManager.getConfig().getAllPreferences()
  })

  // Save app preferences
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC payload shape varies
  ipcMain.handle(CONFIG.SAVE_PREFS, async (_, updates: any) => {
    try {
      if (!isPlainObject(updates)) {
        return { success: false, error: 'Preferences payload must be an object' }
      }
      controllerManager.getConfig().updatePreferences(updates)

      // Update global brightness configuration if brightness settings were changed
      if (updates.brightness) {
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
    const prefs = controllerManager.getConfig().getAllPreferences()
    let enabled = prefs.enabledCueGroups
    const allGroups = registry.getAllGroups()

    // If the preference hasn't been set, default to all groups enabled
    if (enabled === undefined) {
      enabled = allGroups
      controllerManager.getConfig().setEnabledCueGroups(enabled)
      registry.setEnabledGroups(enabled)
    } else {
      // Automatically enable any newly added cue groups so new groups are not hidden by default
      const missingGroups = allGroups.filter((id) => !enabled!.includes(id))
      if (missingGroups.length > 0) {
        enabled = [...enabled, ...missingGroups]
        controllerManager.getConfig().setEnabledCueGroups(enabled)
        registry.setEnabledGroups(enabled)
      }
    }

    // Initialize stage kit priority in the registry if not already set
    const currentPriority = registry.getStageKitPriority()
    const configPriority = prefs.stageKitPrefs?.yargPriority || 'prefer-for-tracked'

    if (currentPriority !== configPriority) {
      registry.setStageKitPriority(configPriority)
    }

    return enabled!
  })

  // Set enabled cue groups
  ipcMain.handle(CONFIG.SET_ENABLED_CUE_GROUPS, async (_, groupIds: string[]) => {
    try {
      const validation = validateOptionalStringArray(groupIds, 'groupIds')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      controllerManager.getConfig().setEnabledCueGroups(groupIds)

      // Update the CueRegistry with the new enabled groups
      const registry = YargCueRegistry.getInstance()

      registry.setEnabledGroups(groupIds)

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
    const enabled = controllerManager.getConfig().getEnabledAudioCueGroups()

    if (enabled && enabled.length > 0) {
      registry.setEnabledGroups(enabled)
      return enabled
    }

    const defaults = registry.getEnabledGroups()
    controllerManager.getConfig().setEnabledAudioCueGroups(defaults)
    return defaults
  })

  // Set enabled audio cue groups
  ipcMain.handle(CONFIG.SET_ENABLED_AUDIO_CUE_GROUPS, async (_, groupIds: string[]) => {
    try {
      const validation = validateOptionalStringArray(groupIds, 'groupIds')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      controllerManager.getConfig().setEnabledAudioCueGroups(groupIds)
      const registry = AudioCueRegistry.getInstance()
      registry.setEnabledGroups(groupIds)
      controllerManager.refreshAudioCueSelection()
      console.log('Updated AudioCueRegistry enabled groups:', groupIds)
      return { success: true }
    } catch (error) {
      console.error('Error setting enabled audio cue groups:', error)
      return ipcError(error)
    }
  })

  // Get cue options + active selection for audio reactive mode
  ipcMain.handle(CONFIG.GET_AUDIO_REACTIVE_CUES, async () => {
    try {
      const cues = controllerManager.getAudioCueOptions()
      const activeCueType = controllerManager.getActiveAudioCueType()
      return {
        success: true,
        activeCueType,
        cues,
      }
    } catch (error) {
      console.error('Error getting audio reactive cue state:', error)
      return {
        ...ipcError(error),
        activeCueType: null,
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
        controllerManager.getConfig().updatePreferences({
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
      controllerManager.getConfig().setClockRate(clockRate)

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC payload shape varies
  ipcMain.handle(CONFIG.SAVE_AUDIO_CONFIG, async (_, updates: any) => {
    try {
      if (!isPlainObject(updates)) {
        return { success: false, error: 'Audio configuration payload must be an object' }
      }
      // Get current config to check if deviceId changed
      const currentConfig = controllerManager.getConfig().getAudioConfig()
      const currentDeviceId = currentConfig?.deviceId
      const newDeviceId = updates.deviceId

      // Check if device changed (handle undefined/default case)
      const deviceChanged = newDeviceId !== undefined && newDeviceId !== currentDeviceId

      // Save the config
      controllerManager.getConfig().updateAudioConfig(updates)

      // Get updated config
      const updatedConfig = controllerManager.getConfig().getAudioConfig()

      // Always notify renderer process to update config, even if audio is disabled
      // This ensures the UI stays in sync with saved config
      const mainWindow = BrowserWindow.getFocusedWindow()
      if (mainWindow) {
        mainWindow.webContents.send(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, updatedConfig)
        console.log('Sent audio:config-update to renderer')
      }

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
      if (updates.enabled !== undefined) {
        if (updates.enabled) {
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

      return { success: true }
    } catch (error) {
      console.error('Error setting audio enabled state:', error)
      return ipcError(error)
    }
  })
}
