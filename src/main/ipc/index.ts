import { IpcMain } from 'electron';
import { ControllerManager } from '../controllers/ControllerManager';
import { setupConfigHandlers } from './config-handlers';
import { setupLightHandlers } from './light-handlers';
import { setupCueHandlers } from './cue-handlers';

/**
 * Set up all IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupIpcHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  setupConfigHandlers(ipcMain, controllerManager);
  setupLightHandlers(ipcMain, controllerManager);
  setupCueHandlers(ipcMain, controllerManager);
} 