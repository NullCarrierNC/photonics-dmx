import { app, ipcMain } from 'electron'
import { WindowManager } from './WindowManager'
import { setupIpcHandlers } from './ipc/index'
import { ControllerManager } from './controllers/ControllerManager'
import { setupMenu } from './menu'
import { BlackoutShortcut } from './blackoutShortcut'
import { toggleMasterBlackout } from './ipc/master-output-handlers'
import {
  normalizeBlackoutShortcutKey,
  normalizeBlackoutShortcutScope,
} from '../services/configuration/configurationDefaults'
import { RENDERER_RECEIVE } from '../shared/ipcChannels'
import { sendToAllWindows } from './utils/windowUtils'
import { createLogger } from '../shared/logger'

const log = createLogger('Application')

export class Application {
  private windowManager: WindowManager
  private controllerManager: ControllerManager
  private applicationShutdownPromise: Promise<void> | null = null
  private applicationShutdownCompleted = false
  private readonly blackoutShortcut = new BlackoutShortcut()

  /**
   * Get any buffered log lines onto disk before a forced exit.
   *
   * The entry point owns the file sink and this module cannot reach it, so it hands the flush down
   * rather than being imported back the other way.
   */
  public flushLogs: (() => Promise<void>) | null = null

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
    setupIpcHandlers(ipcMain, this.controllerManager, this.windowManager, (binding) =>
      this.blackoutShortcut.set(binding),
    )
    this.controllerManager
      .getConfig()
      .setRecoveryQueuedListener(() =>
        sendToAllWindows(RENDERER_RECEIVE.CONFIG_RECOVERY_QUEUED, undefined),
      )

    // Set up application menu
    setupMenu()

    // Arm the blackout shortcut. Only the system-wide scope needs main: the in-app half lives in
    // the renderer, which reads the same preferences for itself. Caught here because the caller
    // treats a rejection from init as fatal, and a key binding is not worth the app over.
    try {
      const config = this.controllerManager.getConfig()
      this.blackoutShortcut.init(
        () => {
          toggleMasterBlackout(this.controllerManager)
        },
        {
          key: normalizeBlackoutShortcutKey(config.getPreference('blackoutShortcutKey')),
          scope: normalizeBlackoutShortcutScope(config.getPreference('blackoutShortcutScope')),
        },
      )
    } catch (error) {
      log.error('Failed to arm the blackout shortcut:', error)
    }

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

  /**
   * A Dock click brings the main window back when it was closed, even with another window open. It
   * opens nothing while a Quit closes the windows.
   */
  public handleActivate(): void {
    if (!this.windowManager.getMainWindow() && !this.windowManager.isQuitting()) {
      this.windowManager.createMainWindow()
    }
  }

  /** A second launch hands the user back to the window this instance already has. */
  public handleSecondInstance(): void {
    this.windowManager.focusMainWindow()
  }

  /**
   * Closes every window for a user's Quit, asking any page with unsaved changes first. False when
   * the user stays on one, and the app then keeps running.
   */
  public closeWindowsForQuit(): Promise<boolean> {
    return this.windowManager.closeWindowsForQuit()
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
        // At error level so a packaged build, which records nothing below it, still says why the
        // app went, and flushed before going since the line is still buffered in the stream.
        log.error('Shutdown taking too long, forcing exit')
        void Promise.resolve(this.flushLogs?.()).finally(() => process.exit(1))
      }, 5000)

      try {
        // Ahead of the controllers, but never at their expense: letting go of a key matters far
        // less than closing senders, so a failure here must not abort the rest of the shutdown.
        try {
          this.blackoutShortcut.dispose()
        } catch (error) {
          log.error('Failed to release the blackout shortcut:', error)
        }

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
