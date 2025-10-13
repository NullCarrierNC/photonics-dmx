import { IpcMain } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import '../../photonics-dmx/cues';
import { CueRegistry } from '../../photonics-dmx/cues/CueRegistry';
import { setGlobalBrightnessConfig } from '../../photonics-dmx/helpers/dmxHelpers';

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
    const enabled = controllerManager.getConfig().getEnabledCueGroups();

    // If the preference hasn't been set, default to all groups enabled
    if (enabled === undefined) {
      const registry = CueRegistry.getInstance();
      return registry.getAllGroups();
    }

    // Initialize stage kit priority in the registry if not already set
    const registry = CueRegistry.getInstance();
    const prefs = controllerManager.getConfig().getAllPreferences();
    const currentPriority = registry.getStageKitPriority();
    const configPriority = prefs.stageKitPrefs?.yargPriority || 'prefer-for-tracked';
    
    if (currentPriority !== configPriority) {
      registry.setStageKitPriority(configPriority);
    }

    return enabled;
  });

  // Set enabled cue groups
  ipcMain.handle('set-enabled-cue-groups', async (_, groupIds: string[]) => {
    try {
      controllerManager.getConfig().setEnabledCueGroups(groupIds);
      
      // Update the CueRegistry with the new enabled groups
      const registry = CueRegistry.getInstance();
      
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
      const registry = CueRegistry.getInstance();
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
} 