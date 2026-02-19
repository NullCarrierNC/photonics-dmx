import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { WindowManager } from '../WindowManager'
import { setupConfigHandlers } from './config-handlers'
import { setupLightHandlers } from './light-handlers'
import { setupCueHandlers } from './cue-handlers'
import { setupNodeCueHandlers } from './node-cue-handlers'
import { setupEffectHandlers } from './effect-handlers'
import { setupShellHandlers } from './shell-handlers'
import { setupWindowHandlers } from './window-handlers'

/**
 * Set up all IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupIpcHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
  windowManager: WindowManager,
): void {
  setupConfigHandlers(ipcMain, controllerManager)
  setupLightHandlers(ipcMain, controllerManager)
  setupCueHandlers(ipcMain, controllerManager)
  setupNodeCueHandlers(ipcMain, controllerManager)
  setupEffectHandlers(ipcMain, controllerManager)
  setupShellHandlers(ipcMain)
  setupWindowHandlers(ipcMain, windowManager)
}
