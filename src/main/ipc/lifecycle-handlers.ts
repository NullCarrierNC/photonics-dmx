import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { LIFECYCLE } from '../../shared/ipcChannels'
import { ipcError, ipcSuccess } from './ipcResult'
import { createLogger } from '../../shared/logger'

const log = createLogger('lifecycle-handlers')

/**
 * Lifecycle IPC: a read channel returning the current `ControllerManager` phase, and a retry that
 * brings the controller graph up after a failure. Phase changes are pushed to the renderer via
 * `RENDERER_RECEIVE.LIFECYCLE_PHASE_CHANGED` (emitted from the lifecycle's phase setter);
 * subscribe to that to stay in sync.
 */
export function setupLifecycleHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(LIFECYCLE.GET_PHASE, () => controllerManager.getLifecyclePhase())

  ipcMain.handle(LIFECYCLE.RETRY_INIT, async () => {
    try {
      // A graph that never came up has nothing to tear down, so build it. One that is up gets the
      // full restart, which is what picks up a configuration the user repaired in the meantime.
      if (controllerManager.getIsInitialized()) {
        await controllerManager.restartControllers()
      } else {
        await controllerManager.init()
      }
      return ipcSuccess()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('Retrying controller initialization failed:', error)
      return ipcError(message)
    }
  })
}
