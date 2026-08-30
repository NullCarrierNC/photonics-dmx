import { app, ipcMain } from 'electron'
import { WindowManager } from './WindowManager'
import { setupIpcHandlers } from './ipc/index'
import { ControllerManager } from './controllers/ControllerManager'
import { setupMenu } from './menu'
import { createLogger } from '../shared/logger'

const log = createLogger('Application')

export class Application {
  private windowManager: WindowManager
  private controllerManager: ControllerManager
  private applicationShutdownPromise: Promise<void> | null = null
  private applicationShutdownCompleted = false

  constructor() {
    this.windowManager = new WindowManager()
    this.controllerManager = new ControllerManager()
  }

  /**
   * Brings the window and IPC up first, then the controller graph.
   *
   * The window is what reports a controller failure, so it has to exist before one can happen:
   * building it after `controllerManager.init()` means a bad config file or an unreadable appData
   * directory leaves a running process with no window and no IPC, and nothing for the user to act
   * on. Both surfaces read the configuration the manager built in its constructor, so neither
   * depends on init having run.
   *
   * Rejects only when the window or IPC could not be set up, which the caller treats as fatal. A
   * controller failure resolves instead, leaving the app on the `failed` phase with a retry.
   */
  public async init(): Promise<void> {
    // Set controller manager in window manager for window state persistence
    this.windowManager.setControllerManager(this.controllerManager)

    // Create main window
    this.windowManager.createMainWindow()

    // Set up IPC handlers
    setupIpcHandlers(ipcMain, this.controllerManager, this.windowManager)

    // Set up application menu
    setupMenu()

    // Initialize controllers
    try {
      await this.controllerManager.init()
    } catch (error) {
      log.error('Controller initialization failed, continuing so the window can report it:', error)
    }
  }

  public handleAllWindowsClosed(): void {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  }

  public handleActivate(): void {
    if (!this.windowManager.hasWindows()) {
      this.windowManager.createMainWindow()
    }
  }

  public getControllerManager(): ControllerManager {
    return this.controllerManager
  }

  public async shutdown(): Promise<void> {
    if (this.applicationShutdownCompleted) {
      return
    }

    this.applicationShutdownPromise ??= (async () => {
      log.info('Application shutdown initiated')

      // Allow max 5 seconds for shutdown
      const shutdownTimeout = setTimeout(() => {
        log.warn('Shutdown taking too long, forcing exit')
        process.exit(0)
      }, 5000)

      try {
        // Shutdown controller manager
        if (this.controllerManager) {
          await this.controllerManager.shutdown()
        }

        // Clear all windows
        if (this.windowManager) {
          await this.windowManager.closeAllWindows()
        }

        log.info('Application shutdown completed successfully')

        // Clear the timeout
        clearTimeout(shutdownTimeout)
        this.applicationShutdownCompleted = true
      } catch (error) {
        log.error('Error during application shutdown:', error)
        // Make sure we still clear the timeout
        clearTimeout(shutdownTimeout)
        throw error
      }
    })()

    try {
      await this.applicationShutdownPromise
    } finally {
      this.applicationShutdownPromise = null
    }
  }
}
