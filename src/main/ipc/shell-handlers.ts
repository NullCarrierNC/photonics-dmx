import { IpcMain, shell } from 'electron';
import { SHELL } from '../../shared/ipcChannels';
import { validatePathUnderAllowedRoots } from './inputValidation';

/**
 * Set up shell-related IPC handlers
 */
export function setupShellHandlers(ipcMain: IpcMain): void {
  /**
   * Show a file in the system file explorer
   */
  ipcMain.handle(SHELL.SHOW_ITEM_IN_FOLDER, async (_event, filePath: string) => {
    const validatedPath = validatePathUnderAllowedRoots(filePath);
    if (!validatedPath.ok) {
      return validatedPath.error;
    }
    shell.showItemInFolder(validatedPath.value);
    return '';
  });

  /**
   * Open a path with the default system application
   */
  ipcMain.handle(SHELL.OPEN_PATH, async (_event, filePath: string) => {
    const validatedPath = validatePathUnderAllowedRoots(filePath);
    if (!validatedPath.ok) {
      return validatedPath.error;
    }
    return shell.openPath(validatedPath.value);
  });
}
