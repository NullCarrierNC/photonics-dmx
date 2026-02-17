import { IpcMain, shell } from 'electron';
import * as path from 'path';
import { SHELL } from '../../shared/ipcChannels';

/**
 * Set up shell-related IPC handlers
 */
export function setupShellHandlers(ipcMain: IpcMain): void {
  /**
   * Show a file in the system file explorer
   */
  ipcMain.handle(SHELL.SHOW_ITEM_IN_FOLDER, async (_event, filePath: string) => {
    if (!filePath) return;
    shell.showItemInFolder(path.normalize(filePath));
  });

  /**
   * Open a path with the default system application
   */
  ipcMain.handle(SHELL.OPEN_PATH, async (_event, filePath: string) => {
    if (!filePath) return;
    return shell.openPath(path.normalize(filePath));
  });
}
