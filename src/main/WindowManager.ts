import { BrowserWindow, shell, screen } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { ControllerManager } from './controllers/ControllerManager';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private controllerManager: ControllerManager | null = null;
  private resizeTimeout: NodeJS.Timeout | null = null;
  private moveTimeout: NodeJS.Timeout | null = null;
  
  /**
   * Sets the controller manager for accessing preferences
   */
  public setControllerManager(controllerManager: ControllerManager): void {
    this.controllerManager = controllerManager;
  }

  /**
   * Saves window state to preferences with debouncing
   */
  private saveWindowState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed() || !this.controllerManager) {
      return;
    }

    const bounds = this.mainWindow.getBounds();
    const windowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y
    };

    try {
      this.controllerManager.getConfig().updatePreferences({ windowState });
    } catch (error) {
      console.error('Failed to save window state:', error);
    }
  }

  /**
   * Debounced save for resize events
   */
  private debouncedSaveResize(): void {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(() => {
      this.saveWindowState();
    }, 500);
  }

  /**
   * Debounced save for move events
   */
  private debouncedSaveMove(): void {
    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout);
    }
    this.moveTimeout = setTimeout(() => {
      this.saveWindowState();
    }, 500);
  }

  /**
   * Validates window bounds to ensure window is visible on screen
   */
  private validateWindowBounds(bounds: { width: number; height: number; x: number; y: number }): { width: number; height: number; x: number; y: number } {
    const displays = screen.getAllDisplays();
    let isValid = false;

    // Check if window is visible on any display
    for (const display of displays) {
      const { x, y, width, height } = display.bounds;
      if (
        bounds.x >= x &&
        bounds.y >= y &&
        bounds.x + bounds.width <= x + width &&
        bounds.y + bounds.height <= y + height
      ) {
        isValid = true;
        break;
      }
    }

    // If not valid, center on primary display
    if (!isValid) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
      return {
        width: Math.min(bounds.width, screenWidth),
        height: Math.min(bounds.height, screenHeight),
        x: Math.floor((screenWidth - Math.min(bounds.width, screenWidth)) / 2),
        y: Math.floor((screenHeight - Math.min(bounds.height, screenHeight)) / 2)
      };
    }

    return bounds;
  }
  
  /**
   * Creates the main application window
   */
  public createMainWindow(): BrowserWindow {
    // Load saved window state or use defaults
    let windowState = {
      width: 1280,
      height: 1000,
      x: undefined as number | undefined,
      y: undefined as number | undefined
    };

    if (this.controllerManager) {
      const savedState = this.controllerManager.getConfig().getPreference('windowState');
      if (savedState) {
        windowState = {
          width: savedState.width || 1280,
          height: savedState.height || 1000,
          x: savedState.x,
          y: savedState.y
        };
      }
    }

    // Validate bounds
    const validatedBounds = this.validateWindowBounds({
      width: windowState.width,
      height: windowState.height,
      x: windowState.x ?? 0,
      y: windowState.y ?? 0
    });

    // Create the browser window
    this.mainWindow = new BrowserWindow({
      width: validatedBounds.width,
      height: validatedBounds.height,
      x: validatedBounds.x,
      y: validatedBounds.y,
      show: false,
      autoHideMenuBar: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // Set up event listeners for window state persistence
    this.mainWindow.on('resized', () => {
      this.debouncedSaveResize();
    });

    this.mainWindow.on('moved', () => {
      this.debouncedSaveMove();
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
    // Save window state one final time before closing
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.saveWindowState();
    }

    // Clear any pending timeouts
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout);
      this.moveTimeout = null;
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close();
    }
    this.mainWindow = null;
  }
} 