import { IpcMain } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import { CueData } from '../../photonics-dmx/cues/cueTypes';
import { BrowserWindow } from 'electron';

/**
 * Set up cue-related IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupCueHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  // Event listeners for YARG and RB3
  ipcMain.on('yarg-listener-enabled', () => {
    controllerManager.enableYarg();
  });

  ipcMain.on('yarg-listener-disabled', () => {
    controllerManager.disableYarg();
  });

  ipcMain.on('rb3e-listener-enabled', () => {
    controllerManager.enableRb3();
  });

  ipcMain.on('rb3e-listener-disabled', () => {
    controllerManager.disableRb3();
  });

  // RB3 mode switching
  ipcMain.on('rb3e-switch-mode', (_, mode: 'direct' | 'cueBased') => {
    controllerManager.switchRb3Mode(mode);
  });

  // Get RB3 current mode
  ipcMain.handle('rb3e-get-mode', () => {
    return controllerManager.getRb3Mode();
  });

  // Get RB3 processor statistics
  ipcMain.handle('rb3e-get-stats', () => {
    return controllerManager.getRb3ProcessorStats();
  });
  
  // Send cue data to renderer
  const sendCueDebouncedData = (cueData: CueData) => {
    // Get all windows and send data to the first one
    const allWindows = BrowserWindow.getAllWindows();
    const mainWindow = allWindows.length > 0 ? allWindows[0] : null;
    if (mainWindow) {
      mainWindow.webContents.send('cue-debounced', cueData);
    }
  };
  
  // Send handled cue data to renderer
  const sendCueHandledData = (cueData: CueData) => {
    // Get all windows and send data to the first one
    const allWindows = BrowserWindow.getAllWindows();
    const mainWindow = allWindows.length > 0 ? allWindows[0] : null;
    if (mainWindow) {
      mainWindow.webContents.send('cue-handled', cueData);
    }
  };
  
  // Listen for cue data
  ipcMain.on('set-listen-cue-data', (_, shouldListen: boolean) => {
    const cueHandler = controllerManager.getCueHandler();
    if (!cueHandler) return;
    
    if (shouldListen) {
      cueHandler.addCueDebouncedListener(sendCueDebouncedData);
      cueHandler.addCueHandledListener(sendCueHandledData);
    } else {
      cueHandler.removeCueDebouncedListener(sendCueDebouncedData);
      cueHandler.removeCueHandledListener(sendCueHandledData);
    }
  });

  // Update effect debounce time
  ipcMain.on('update-effect-debounce', (_, debounceTime: number) => {
    // Save the debounce time to preferences
    controllerManager.getConfig().setPreference('effectDebounce', debounceTime);
    
    // Update the cue handler if it exists
    const cueHandler = controllerManager.getCueHandler();
    if (cueHandler) {
      if ('setEffectDebouncePeriod' in cueHandler) {
        cueHandler.setEffectDebouncePeriod(debounceTime);
      }
    }
  });

  // Set cue style
  ipcMain.on('cue-style', (_, style: 'simple' | 'complex') => {
    // Save complex cue style preference
    controllerManager.getConfig().setPreference('complex', style === 'complex');
  });
} 