import { handleInvoke } from './handleInvoke'
import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { CueData } from '../../photonics-dmx/cues/types/cueTypes'
import { sendToAllWindows } from '../utils/windowUtils'
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
  handleInvoke(ipcMain, CUE.DISABLE_YARG, log, async () => {
    await controllerManager.disableYarg()
    return { success: true }
  })

  // Disable RB3
  handleInvoke(ipcMain, CUE.DISABLE_RB3, log, async () => {
    await controllerManager.disableRb3()
    return { success: true }
  })

  // Get RB3 current mode
  handleInvoke(ipcMain, CUE.RB3E_GET_MODE, log, () => {
    return controllerManager.getListenerLifecycle().yargRb3.getRb3Mode()
  })

  // Get RB3 processor statistics
  handleInvoke(ipcMain, CUE.RB3E_GET_STATS, log, () => {
    return controllerManager.getListenerLifecycle().yargRb3.getRb3ProcessorStats()
  })

  // Send handled cue data to renderer
  const sendCueHandledData = (cueData: CueData) => {
    sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, cueData)
  }

  // Listen for cue data
  ipcMain.on(CUE.SET_LISTEN_CUE_DATA, (_, shouldListen: unknown) => {
    // The YARG listener and RB3 cue mode expose the cue-mirror through separate handler refs, and
    // ProcessorManager carries RB3E direct mode, so all three are covered. Each subscription is
    // removed before it is added, so however often the page asks there is one, and one request
    // to stop ends it.
    const listen = shouldListen === true
    for (const handler of [
      controllerManager.getCueHandler(),
      controllerManager.getRb3CueHandler(),
    ]) {
      handler?.removeCueHandledListener(sendCueHandledData)
      if (listen) handler?.addCueHandledListener(sendCueHandledData)
    }
    const processorManager = controllerManager.getProcessorManager()
    processorManager?.off('cueHandled', sendCueHandledData)
    if (listen) processorManager?.on('cueHandled', sendCueHandledData)
  })

  // Set cue style
  ipcMain.on(CUE.CUE_STYLE, (_, style: unknown) => {
    if (style !== 'simple' && style !== 'complex') {
      log.warn(`Ignoring invalid cue style payload: ${String(style)}`)
      return
    }
    controllerManager
      .getConfig()
      .setPreference('complex', style === 'complex')
      .catch((err) => log.error('Failed to save cue style preference:', err))
  })

  // Get YARG enabled state
  handleInvoke(ipcMain, CUE.GET_YARG_ENABLED, log, () => {
    return controllerManager.getIsYargEnabled()
  })

  // Get RB3 enabled state
  handleInvoke(ipcMain, CUE.GET_RB3_ENABLED, log, () => {
    return controllerManager.getIsRb3Enabled()
  })
}
