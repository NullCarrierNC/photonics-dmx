import { app, ipcMain } from 'electron';
import { WindowManager } from './WindowManager';
import { setupIpcHandlers } from './ipc/index';
import { ControllerManager } from './controllers/ControllerManager';
import { setupMenu } from './menu';
import { setGlobalBrightnessConfig } from '../photonics-dmx/helpers/dmxHelpers';

export class Application {
  private windowManager: WindowManager;
  private controllerManager: ControllerManager;

  constructor() {
    this.windowManager = new WindowManager();
    this.controllerManager = new ControllerManager();
  }

  public async init(): Promise<void> {
    // Initialize controllers
    await this.controllerManager.init();
    
    // Initialize global brightness configuration
    const brightnessConfig = this.controllerManager.getConfig().getPreference('brightness');
    if (brightnessConfig) {
      setGlobalBrightnessConfig(brightnessConfig);
    }
    
    // Create main window
    this.windowManager.createMainWindow();
    
    // Set up IPC handlers
    setupIpcHandlers(ipcMain, this.controllerManager);
    
    // Set up application menu
    setupMenu();
  }

  public handleAllWindowsClosed(): void {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }

  public handleActivate(): void {
    if (!this.windowManager.hasWindows()) {
      this.windowManager.createMainWindow();
    }
  }

  public async shutdown(): Promise<void> {
    console.log("Application shutdown initiated");
    
    // Allow max 5 seconds for shutdown
    const shutdownTimeout = setTimeout(() => {
      console.warn("Shutdown taking too long, forcing exit");
      process.exit(0);
    }, 5000);
    
    try {
      // Shutdown controller manager
      if (this.controllerManager) {
        await this.controllerManager.shutdown();
      }
      
      // Clear all windows
      if (this.windowManager) {
        this.windowManager.closeAllWindows();
      }
      
      console.log("Application shutdown completed successfully");
      
      // Clear the timeout
      clearTimeout(shutdownTimeout);
    } catch (error) {
      console.error("Error during application shutdown:", error);
      // Make sure we still clear the timeout
      clearTimeout(shutdownTimeout);
      throw error;
    }
  }
}
