import { IpcMain } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';

/**
 * Set up configuration-related IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupConfigHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  // Get light library
  ipcMain.handle('get-light-library', async () => {
    return controllerManager.getConfig().lightingConfig;
  });

  // Get user's lights
  ipcMain.handle('get-my-lights', async () => {
    return await controllerManager.getConfig().loadMyLights();
  });

  // Save user's lights
  ipcMain.on('save-my-lights', (_, data) => {
    controllerManager.getConfig().saveMyLights(data);
  });

  // Get light layout
  ipcMain.handle('get-light-layout', async (_, filename: string) => {
    try {
      return await controllerManager.getConfig().loadLightLayout();
    } catch (error) {
      console.error(`Error fetching light layout for ${filename}:`, error);
      throw error;
    }
  });

  // Save light layout
  ipcMain.handle('save-light-layout', async (_, filename: string, data: any) => {
    try {
      // First save the layout
      await controllerManager.getConfig().saveLightLayout(data);
      
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
    return await controllerManager.getConfig().getPrefs();
  });
} 