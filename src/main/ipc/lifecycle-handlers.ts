import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { LIFECYCLE } from '../../shared/ipcChannels'

/**
 * Lifecycle IPC: a single read channel returning the current `ControllerManager` phase.
 * Phase changes are pushed to the renderer via `RENDERER_RECEIVE.LIFECYCLE_PHASE_CHANGED`
 * (emitted from `ControllerManager.setLifecyclePhase`); subscribe to that to stay in sync.
 */
export function setupLifecycleHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(LIFECYCLE.GET_PHASE, () => controllerManager.getLifecyclePhase())
}
