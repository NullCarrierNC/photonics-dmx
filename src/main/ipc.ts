import { ipcMain } from 'electron';
import { setupConfigHandlers } from './ipc/config-handlers';
import { setupLightHandlers } from './ipc/light-handlers';
import { setupCueHandlers } from './ipc/cue-handlers';
import { ControllerManager } from './controllers/ControllerManager';

export function setupIpcHandlers(controllerManager: ControllerManager): void {
  setupConfigHandlers(ipcMain, controllerManager);
  setupLightHandlers(ipcMain, controllerManager);
  setupCueHandlers(ipcMain, controllerManager);
}
