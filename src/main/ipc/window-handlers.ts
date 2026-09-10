import { IpcMain } from 'electron'
import { WindowManager } from '../WindowManager'
import { ipcError } from './ipcResult'
import { WINDOW } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
import { handleInvoke } from './handleInvoke'
const log = createLogger('window-handlers')

/**
 * Set up window-related IPC handlers
 */
export function setupWindowHandlers(ipcMain: IpcMain, windowManager: WindowManager): void {
  handleInvoke(ipcMain, WINDOW.OPEN_CUE_EDITOR, log, () => {
    try {
      windowManager.openCueEditorWindow()
      return { success: true }
    } catch (error) {
      log.error('Failed to open cue editor window:', error)
      return {
        ...ipcError(error),
      }
    }
  })

  handleInvoke(ipcMain, WINDOW.OPEN_AUDIO_PREVIEW, log, () => {
    try {
      windowManager.openAudioPreviewWindow()
      return { success: true }
    } catch (error) {
      log.error('Failed to open audio preview window:', error)
      return {
        ...ipcError(error),
      }
    }
  })
}
