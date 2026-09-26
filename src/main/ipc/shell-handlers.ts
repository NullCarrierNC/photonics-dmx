import { IpcMain, shell } from 'electron'
import { SHELL } from '../../shared/ipcChannels'
import { validateOpenablePath, validatePathUnderAllowedRoots } from './inputValidation'
import { ipcError, ipcSuccess } from './ipcResult'
import { createLogger } from '../../shared/logger'
import { handleInvoke } from './handleInvoke'

const log = createLogger('shell-handlers')

/**
 * Set up shell-related IPC handlers
 */
export function setupShellHandlers(ipcMain: IpcMain): void {
  /**
   * Show a file in the system file explorer
   */
  handleInvoke(ipcMain, SHELL.SHOW_ITEM_IN_FOLDER, log, async (_event, filePath: unknown) => {
    const validatedPath = validatePathUnderAllowedRoots(filePath)
    if (!validatedPath.ok) {
      return ipcError(validatedPath.error)
    }
    shell.showItemInFolder(validatedPath.value)
    return ipcSuccess()
  })

  /**
   * Open a path with the default system application
   */
  handleInvoke(ipcMain, SHELL.OPEN_PATH, log, async (_event, filePath: unknown) => {
    const validatedPath = validateOpenablePath(filePath)
    if (!validatedPath.ok) {
      return ipcError(validatedPath.error)
    }
    // shell.openPath resolves to a non-empty message string when the open FAILED.
    const result = await shell.openPath(validatedPath.value)
    return result ? ipcError(result) : ipcSuccess()
  })
}
