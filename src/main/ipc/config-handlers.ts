import { IpcMain } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import '../../photonics-dmx/cues';
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry';
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry';
import { AudioCueType } from '../../photonics-dmx/cues/types/audioCueTypes';
import { setGlobalBrightnessConfig } from '../../photonics-dmx/helpers/dmxHelpers';
import { BrowserWindow } from 'electron';
import { DmxRig } from '../../photonics-dmx/types';

/**
 * Set up configuration-related IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupConfigHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  // Get light library (default templates)
  ipcMain.handle('get-light-library', async () => {
    return controllerManager.getConfig().getLightLibrary();
  });

  // Get user's lights
  ipcMain.handle('get-my-lights', async () => {
    return controllerManager.getConfig().getUserLights();
  });

  // Save user's lights
  ipcMain.on('save-my-lights', (_, data) => {
    controllerManager.getConfig().updateUserLights(data);
  });

  // Get light layout
  ipcMain.handle('get-light-layout', async (_, filename: string) => {
    try {
      return controllerManager.getConfig().getLightingLayout();
    } catch (error) {
      console.error(`Error fetching light layout for ${filename}:`, error);
      throw error;
    }
  });

  // Save light layout
  ipcMain.handle('save-light-layout', async (_, filename: string, data: any) => {
    try {
      // First save the layout
      controllerManager.getConfig().updateLightingLayout(data);
      
      // Then restart controllers to pick up the changes
      await controllerManager.restartControllers();
      
      // Send a notification to the renderer about the restart
      const mainWindow = require('electron').BrowserWindow.getFocusedWindow();
      if (mainWindow) {
        mainWindow.webContents.send('controllers-restarted');
      }
      
      return { success: true };
    } catch (error) {
      console.error(`Error saving light layout ${filename}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // DMX Rigs handlers

  // Get all DMX rigs
  ipcMain.handle('get-dmx-rigs', async () => {
    try {
      return controllerManager.getConfig().getDmxRigs();
    } catch (error) {
      console.error('Error fetching DMX rigs:', error);
      throw error;
    }
  });

  // Get a specific DMX rig by ID
  ipcMain.handle('get-dmx-rig', async (_, id: string) => {
    try {
      return controllerManager.getConfig().getDmxRig(id);
    } catch (error) {
      console.error(`Error fetching DMX rig ${id}:`, error);
      throw error;
    }
  });

  // Get only active DMX rigs
  ipcMain.handle('get-active-rigs', async () => {
    try {
      return controllerManager.getConfig().getActiveRigs();
    } catch (error) {
      console.error('Error fetching active DMX rigs:', error);
      throw error;
    }
  });

  // Save or update a DMX rig
  ipcMain.handle('save-dmx-rig', async (_, rig: DmxRig) => {
    try {
      const config = controllerManager.getConfig();
      const existingRig = config.getDmxRig(rig.id);
      const previousActiveState = existingRig?.active ?? false;
      
      // Save the rig
      config.saveDmxRig(rig);
      
      // If active state changed, restart controllers to update DMX output
      if (existingRig && previousActiveState !== rig.active) {
        await controllerManager.restartControllers();
        
        // Send a notification to the renderer about the restart
        const mainWindow = BrowserWindow.getFocusedWindow();
        if (mainWindow) {
          mainWindow.webContents.send('controllers-restarted');
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error(`Error saving DMX rig ${rig.id}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Delete a DMX rig
  ipcMain.handle('delete-dmx-rig', async (_, id: string) => {
    try {
      const config = controllerManager.getConfig();
      const rig = config.getDmxRig(id);
      const wasActive = rig?.active ?? false;
      
      // Delete the rig
      config.deleteDmxRig(id);
      
      // If the deleted rig was active, restart controllers
      if (wasActive) {
        await controllerManager.restartControllers();
        
        // Send a notification to the renderer about the restart
        const mainWindow = BrowserWindow.getFocusedWindow();
        if (mainWindow) {
          mainWindow.webContents.send('controllers-restarted');
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error(`Error deleting DMX rig ${id}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get app version
  ipcMain.handle('get-app-version', () => {
    return require('electron').app.getVersion();
  });

  // Get app preferences
  ipcMain.handle('get-prefs', async () => {
    return controllerManager.getConfig().getAllPreferences();
  });

  // Save app preferences
  ipcMain.handle('save-prefs', async (_, updates: any) => {
    try {
      controllerManager.getConfig().updatePreferences(updates);
      
      // Update global brightness configuration if brightness settings were changed
      if (updates.brightness) {
        setGlobalBrightnessConfig(updates.brightness);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error saving preferences:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get enabled cue groups
  ipcMain.handle('get-enabled-cue-groups', async () => {
    const registry = YargCueRegistry.getInstance();
    const prefs = controllerManager.getConfig().getAllPreferences();
    let enabled = prefs.enabledCueGroups;
    const allGroups = registry.getAllGroups();

    // If the preference hasn't been set, default to all groups enabled
    if (enabled === undefined) {
      enabled = allGroups;
      controllerManager.getConfig().setEnabledCueGroups(enabled);
      registry.setEnabledGroups(enabled);
    } else {
      // Automatically enable any newly added cue groups so new groups are not hidden by default
      const missingGroups = allGroups.filter(id => !enabled!.includes(id));
      if (missingGroups.length > 0) {
        enabled = [...enabled, ...missingGroups];
        controllerManager.getConfig().setEnabledCueGroups(enabled);
        registry.setEnabledGroups(enabled);
      }
    }

    // Initialize stage kit priority in the registry if not already set
    const currentPriority = registry.getStageKitPriority();
    const configPriority = prefs.stageKitPrefs?.yargPriority || 'prefer-for-tracked';
    
    if (currentPriority !== configPriority) {
      registry.setStageKitPriority(configPriority);
    }

    return enabled!;
  });

  // Set enabled cue groups
  ipcMain.handle('set-enabled-cue-groups', async (_, groupIds: string[]) => {
    try {
      controllerManager.getConfig().setEnabledCueGroups(groupIds);
      
      // Update the CueRegistry with the new enabled groups
      const registry = YargCueRegistry.getInstance();
      
      registry.setEnabledGroups(groupIds);
      
      console.log('Updated CueRegistry enabled groups:', groupIds);
      
      return { success: true };
    } catch (error) {
      console.error('Error setting enabled cue groups:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get enabled audio cue groups
  ipcMain.handle('get-enabled-audio-cue-groups', async () => {
    const registry = AudioCueRegistry.getInstance();
    const enabled = controllerManager.getConfig().getEnabledAudioCueGroups();

    if (enabled && enabled.length > 0) {
      registry.setEnabledGroups(enabled);
      return enabled;
    }

    const defaults = registry.getEnabledGroups();
    controllerManager.getConfig().setEnabledAudioCueGroups(defaults);
    return defaults;
  });

  // Set enabled audio cue groups
  ipcMain.handle('set-enabled-audio-cue-groups', async (_, groupIds: string[]) => {
    try {
      controllerManager.getConfig().setEnabledAudioCueGroups(groupIds);
      const registry = AudioCueRegistry.getInstance();
      registry.setEnabledGroups(groupIds);
      controllerManager.refreshAudioCueSelection();
      console.log('Updated AudioCueRegistry enabled groups:', groupIds);
      return { success: true };
    } catch (error) {
      console.error('Error setting enabled audio cue groups:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get cue options + active selection for audio reactive mode
  ipcMain.handle('get-audio-reactive-cues', async () => {
    try {
      const cues = controllerManager.getAudioCueOptions();
      const activeCueType = controllerManager.getActiveAudioCueType();
      return {
        success: true,
        activeCueType,
        cues
      };
    } catch (error) {
      console.error('Error getting audio reactive cue state:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        activeCueType: null,
        cues: []
      };
    }
  });

  // Set the active audio cue type
  ipcMain.handle('set-active-audio-cue', async (_, cueType: AudioCueType) => {
    try {
      const result = controllerManager.setActiveAudioCueType(cueType);
      if (!result.success) {
        return result;
      }
      return { success: true };
    } catch (error) {
      console.error('Error setting active audio cue:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get stage kit priority preference
  ipcMain.handle('get-stage-kit-priority', async () => {
    const prefs = controllerManager.getConfig().getAllPreferences();
    return prefs.stageKitPrefs?.yargPriority || 'prefer-for-tracked';
  });

  // Set stage kit priority preference
  ipcMain.handle('set-stage-kit-priority', async (_, priority: 'prefer-for-tracked' | 'random' | 'never') => {
    try {
      // Update the preference in the config
      controllerManager.getConfig().updatePreferences({
        stageKitPrefs: { yargPriority: priority }
      });

      // Sync with the CueRegistry
      const registry = YargCueRegistry.getInstance();
      registry.setStageKitPriority(priority);

      // Clear any existing consistency tracking to ensure new priority takes effect immediately
      registry.clearConsistencyTracking();

      console.log('Updated stage kit priority to:', priority);

      return { success: true };
    } catch (error) {
      console.error('Error setting stage kit priority:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get clock rate preference
  ipcMain.handle('get-clock-rate', async () => {
    try {
      const clockRate = controllerManager.getConfig().getClockRate();
      return { success: true, clockRate };
    } catch (error) {
      console.error('Error getting clock rate:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Set clock rate preference
  ipcMain.handle('set-clock-rate', async (_, clockRate: number) => {
    try {
      // Validate clock rate range
      if (clockRate < 1 || clockRate > 100) {
        return {
          success: false,
          error: 'Clock rate must be between 1 and 100 milliseconds'
        };
      }

      // Update the preference in the config
      controllerManager.getConfig().setClockRate(clockRate);

      // Restart controllers to apply the new clock rate
      await controllerManager.restartControllers();

      console.log('Updated clock rate to:', clockRate, 'ms');

      return { success: true };
    } catch (error) {
      console.error('Error setting clock rate:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Audio configuration handlers
  
  // Get audio configuration
  ipcMain.handle('get-audio-config', async () => {
    return controllerManager.getConfig().getAudioConfig();
  });

  // Save audio configuration
  ipcMain.handle('save-audio-config', async (_, updates: any) => {
    try {
      // Get current config to check if deviceId changed
      const currentConfig = controllerManager.getConfig().getAudioConfig();
      const currentDeviceId = currentConfig?.deviceId;
      const newDeviceId = updates.deviceId;
      
      // Check if device changed (handle undefined/default case)
      const deviceChanged = newDeviceId !== undefined && 
                           newDeviceId !== currentDeviceId;
      
      // Save the config
      controllerManager.getConfig().updateAudioConfig(updates);
      
      // Get updated config
      const updatedConfig = controllerManager.getConfig().getAudioConfig();
      
      // Always notify renderer process to update config, even if audio is disabled
      // This ensures the UI stays in sync with saved config
      const mainWindow = BrowserWindow.getFocusedWindow();
      if (mainWindow) {
        mainWindow.webContents.send('audio:config-update', updatedConfig);
        console.log('Sent audio:config-update to renderer');
      }
      
      // If audio is currently enabled, apply config updates immediately
      if (controllerManager.getIsAudioEnabled()) {
        // If device changed, we need to restart audio capture
        if (deviceChanged) {
          console.log('Device changed, restarting audio capture...');
          try {
            // Disable and re-enable to restart with new device
            await controllerManager.disableAudio();
            await controllerManager.enableAudio();
          } catch (error) {
            console.error('Failed to restart audio with new device:', error);
            // Don't throw - config is still saved, user can manually restart
          }
        } else {
          // Update running processor
          controllerManager.updateAudioConfig(updatedConfig);
        }
      }
      
      // If enabled state changed, start/stop audio
      if (updates.enabled !== undefined) {
        if (updates.enabled) {
          await controllerManager.enableAudio();
        } else {
          await controllerManager.disableAudio();
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error saving audio configuration:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get audio enabled state
  ipcMain.handle('get-audio-enabled', async () => {
    return controllerManager.getIsAudioEnabled();
  });

  // Enable/disable audio
  ipcMain.handle('set-audio-enabled', async (_, enabled: boolean) => {
    try {
      if (enabled) {
        await controllerManager.enableAudio();
      } else {
        await controllerManager.disableAudio();
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error setting audio enabled state:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
} 