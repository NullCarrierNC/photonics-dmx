import { IpcMain } from 'electron'
import { WindowManager } from '../WindowManager'
import { ipcError } from './ipcResult'
import { WINDOW } from '../../shared/ipcChannels'

/**
 * Set up window-related IPC handlers
 */
export function setupWindowHandlers(ipcMain: IpcMain, windowManager: WindowManager): void {
  ipcMain.handle(WINDOW.OPEN_CUE_EDITOR, () => {
    try {
      windowManager.openCueEditorWindow()
      return { success: true }
    } catch (error) {
      console.error('Failed to open cue editor window:', error)
      return {
        ...ipcError(error),
      }
    }
  })
}
