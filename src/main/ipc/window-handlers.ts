import { IpcMain } from 'electron';
import { WindowManager } from '../WindowManager';

/**
 * Set up window-related IPC handlers
 */
export function setupWindowHandlers(ipcMain: IpcMain, windowManager: WindowManager): void {
  ipcMain.handle('open-cue-editor-window', () => {
    try {
      windowManager.openCueEditorWindow();
      return { success: true };
    } catch (error) {
      console.error('Failed to open cue editor window:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}
