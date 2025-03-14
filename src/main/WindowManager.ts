import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  
  /**
   * Creates the main application window
   */
  public createMainWindow(): BrowserWindow {
    // Create the browser window
    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      autoHideMenuBar: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show();
    });

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });

    // Load the renderer
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return this.mainWindow;
  }

  /**
   * Checks if there are any open windows
   */
  public hasWindows(): boolean {
    return BrowserWindow.getAllWindows().length > 0;
  }

  /**
   * Gets the main window instance
   */
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Closes all application windows
   */
  public closeAllWindows(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close();
    }
    this.mainWindow = null;
  }
} 