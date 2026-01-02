import { IpcMain, shell } from 'electron';
import * as path from 'path';

/**
 * Set up shell-related IPC handlers
 */
export function setupShellHandlers(ipcMain: IpcMain): void {
  /**
   * Show a file in the system file explorer
   */
  ipcMain.handle('shell:showItemInFolder', async (_event, filePath: string) => {
    if (!filePath) return;
    shell.showItemInFolder(path.normalize(filePath));
  });

  /**
   * Open a path with the default system application
   */
  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    if (!filePath) return;
    return shell.openPath(path.normalize(filePath));
  });
}
