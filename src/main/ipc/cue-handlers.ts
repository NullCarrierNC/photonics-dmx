import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { CueData } from '../../photonics-dmx/cues/types/cueTypes'
import { sendToAllWindows } from '../utils/windowUtils'
import { ipcError } from './ipcResult'
import { CUE, RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
const log = createLogger('cue-handlers')

/**
 * Set up cue-related IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupCueHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  // Event listeners for YARG and RB3. These are fire-and-forget: the lifecycle queue already logs
  // any enable/disable failure once, so a no-op catch here just keeps an init-time rejection from
  // surfacing as an unhandledRejection in the main process.
  const ignoreToggleRejection = () => {}
  ipcMain.on(CUE.YARG_LISTENER_ENABLED, () => {
    controllerManager.enableYarg().catch(ignoreToggleRejection)
  })

  ipcMain.on(CUE.YARG_LISTENER_DISABLED, () => {
    controllerManager.disableYarg().catch(ignoreToggleRejection)
  })

  ipcMain.on(CUE.RB3E_LISTENER_ENABLED, () => {
    controllerManager.enableRb3().catch(ignoreToggleRejection)
  })

  ipcMain.on(CUE.RB3E_LISTENER_DISABLED, () => {
    controllerManager.disableRb3().catch(ignoreToggleRejection)
  })

  // Disable YARG
  ipcMain.handle(CUE.DISABLE_YARG, async () => {
    try {
      await controllerManager.disableYarg()
      return { success: true }
    } catch (error) {
      log.error('Error disabling YARG:', error)
      return ipcError(error)
    }
  })

  // Disable RB3
  ipcMain.handle(CUE.DISABLE_RB3, async () => {
    try {
      await controllerManager.disableRb3()
      return { success: true }
    } catch (error) {
      log.error('Error disabling RB3:', error)
      return ipcError(error)
    }
  })

  // Get RB3 current mode
  ipcMain.handle(CUE.RB3E_GET_MODE, () => {
    return controllerManager.getRb3Mode()
  })

  // Get RB3 processor statistics
  ipcMain.handle(CUE.RB3E_GET_STATS, () => {
    return controllerManager.getRb3ProcessorStats()
  })

  // Send handled cue data to renderer
  const sendCueHandledData = (cueData: CueData) => {
    sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, cueData)
  }

  // Listen for cue data
  ipcMain.on(CUE.SET_LISTEN_CUE_DATA, (_, shouldListen: boolean) => {
    // The YARG listener and RB3 cue mode expose the cue-mirror through separate handler refs;
    // at most one is non-null at a time, so subscribing both covers whichever is active.
    if (shouldListen) {
      controllerManager.getCueHandler()?.addCueHandledListener(sendCueHandledData)
      controllerManager.getRb3CueHandler()?.addCueHandledListener(sendCueHandledData)

      // Also listen to ProcessorManager for RB3E direct mode
      const processorManager = controllerManager.getProcessorManager()
      if (processorManager) {
        processorManager.on('cueHandled', sendCueHandledData)
      }
    } else {
      controllerManager.getCueHandler()?.removeCueHandledListener(sendCueHandledData)
      controllerManager.getRb3CueHandler()?.removeCueHandledListener(sendCueHandledData)

      const processorManager = controllerManager.getProcessorManager()
      if (processorManager) {
        processorManager.off('cueHandled', sendCueHandledData)
      }
    }
  })

  // Set cue style
  ipcMain.on(CUE.CUE_STYLE, (_, style: unknown) => {
    if (style !== 'simple' && style !== 'complex') {
      log.warn(`Ignoring invalid cue style payload: ${String(style)}`)
      return
    }
    void controllerManager
      .getConfig()
      .setPreference('complex', style === 'complex')
      .catch((err) => log.error('Failed to save cue style preference:', err))
  })

  // Get YARG enabled state
  ipcMain.handle(CUE.GET_YARG_ENABLED, () => {
    return controllerManager.getIsYargEnabled()
  })

  // Get RB3 enabled state
  ipcMain.handle(CUE.GET_RB3_ENABLED, () => {
    return controllerManager.getIsRb3Enabled()
  })
}
