import * as path from 'path'
import { app, dialog } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import {
  installDefaultSessionContentSecurityPolicy,
  installDefaultSessionPermissionHandlers,
} from './rendererSessionSecurity'
import { Application } from './application'
import { createFileLogSink } from './logging/fileLogSink'
import {
  consoleLogSink,
  createLogger,
  setLogSink,
  setMinLogLevel,
  setScopeMinLogLevel,
} from '../shared/logger'

const log = createLogger('Main')

if (!app.isPackaged) {
  app.commandLine.appendSwitch('disable-http-cache')
}

/**
 * Scopes kept at `info` when a packaged build raises the floor to `error`.
 *
 * These record what became of the user's own files: which one was loaded, what a migration
 * rewrote, and what a recovery replaced. The failure itself logs at `error`, and these are the
 * lines that say what took its place. A handful a launch, none of them on a frame path.
 */
const STARTUP_ACCOUNT_SCOPES = ['ConfigFile', 'ConfigurationManager', 'copyDefaultData']

let closeFileLog: (() => Promise<void>) | null = null

function closeFileLogWithTimeout(): Promise<void> {
  if (!closeFileLog) {
    return Promise.resolve()
  }
  const c = closeFileLog
  closeFileLog = null
  return Promise.race([c(), new Promise<void>((resolve) => setTimeout(resolve, 500))])
}

// Global reference to application for error handling. Null until `whenReady` builds it.
let applicationInstance: Application | null = null

/** Tell the user why there is no window, then stop. */
function reportStartupFailure(err: unknown): void {
  log.error('Failed to initialize application:', err)
  dialog.showErrorBox(
    'Photonics could not start',
    `${err instanceof Error ? err.message : String(err)}\n\nLogs: ${path.join(app.getPath('appData'), 'Photonics.rocks', 'logs')}`,
  )
  app.exit(1)
}

// A network sender error stays with the senders. Anything else holds the lighting controllers
// failed and dark until a restart (ControllerManager.handleUncaughtException), and the process
// carries on so the blackout reaches the rig.
process.on('uncaughtException', (error: unknown) => {
  const handled =
    applicationInstance?.getControllerManager()?.handleUncaughtException(error) ?? false
  if (!handled) {
    log.error('Uncaught exception:', error)
  }
})

// Logged only, and the show carries on. A rejection nobody awaited is async work failing after
// its caller moved on.
process.on('unhandledRejection', (reason, _promise) => {
  log.error('Unhandled promise rejection:', reason)
})

/** Shuts down cleanly on a process signal, forcing the exit if that takes more than 2 seconds. */
async function shutdownOnSignal(signal: NodeJS.Signals): Promise<void> {
  log.info(`Received ${signal} signal, shutting down gracefully...`)

  const forceExitTimeout = setTimeout(() => {
    log.error('Forced exit due to shutdown timeout!')
    // The line explaining the forced exit is the one worth having, and it is still buffered in the
    // stream at this point, so give the flush its chance before going.
    void closeFileLogWithTimeout().finally(() => process.exit(1))
  }, 2000)

  try {
    await applicationInstance?.shutdown()
    await closeFileLogWithTimeout()
    clearTimeout(forceExitTimeout)
    app.quit()
  } catch (error) {
    // Log BEFORE closing the file log, or the one message explaining the failed shutdown never
    // reaches the log file.
    log.error(`Error during ${signal} shutdown:`, error)
    await closeFileLogWithTimeout()
    clearTimeout(forceExitTimeout)
    process.exit(1)
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdownOnSignal(signal)
  })
}

/**
 * Start writing to the daily log file, or carry on without it.
 *
 * The sink creates its directory up front, which fails on an unwritable appData or where something
 * else already occupies the path. Losing the log file costs us diagnostics. Letting the throw out
 * would cost the window, the error dialog and any way to quit, since everything that builds those
 * runs later in the same callback.
 */
function startFileLogging(logsDir: string): void {
  try {
    const { sink: fileSink, close: fileLogClose } = createFileLogSink({ logsDir })
    closeFileLog = fileLogClose
    setLogSink((entry) => {
      consoleLogSink(entry)
      fileSink(entry)
    })
  } catch (err) {
    log.error(`Cannot write logs to ${logsDir}, continuing without a log file:`, err)
  }
}

/** Everything that builds the window, the IPC surface and the error dialog. */
function onReady(): void {
  const logsDir = path.join(app.getPath('appData'), 'Photonics.rocks', 'logs')
  startFileLogging(logsDir)
  // Named while the floor is still info, so the log file records where it is.
  log.info(`Writing logs to ${logsDir}`)
  if (!process.env.PHOTONICS_LOG_LEVEL && app.isPackaged) {
    setMinLogLevel('error')
    for (const scope of STARTUP_ACCOUNT_SCOPES) {
      setScopeMinLogLevel(scope, 'info')
    }
  }

  installDefaultSessionContentSecurityPolicy()
  installDefaultSessionPermissionHandlers()

  // Set up the app
  electronApp.setAppUserModelId('rocks.photonics')

  // Set app name
  app.name = 'Photonics'

  // Built here rather than at module scope: the constructor reads configuration off disk and
  // throws when that directory cannot be created, and a throw during module evaluation would
  // skip the signal handlers, the window and this error path, leaving a process with no interface
  // and no way to quit it.
  try {
    applicationInstance = new Application()
    applicationInstance.flushLogs = closeFileLogWithTimeout
  } catch (err) {
    reportStartupFailure(err)
    return
  }

  // Default session handlers, ahead of init so the main window it builds gets them too.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize application. A controller failure resolves and leaves the window reporting the
  // failed phase, so a rejection here means the window or IPC could not be set up and there is
  // nothing left to report through. Say so and stop rather than idling with no interface.
  applicationInstance.init().catch(reportStartupFailure)
}

/**
 * A second copy would share the configuration files with this one, bind the same UDP ports and
 * write the same daily log against a byte counter neither knows about. The second launch hands the
 * user back to this window instead.
 */
if (!app.requestSingleInstanceLock()) {
  // Nothing is built yet, so there is nothing to shut down on the way out.
  app.exit(0)
} else {
  app.on('second-instance', () => {
    applicationInstance?.handleSecondInstance()
  })

  // Anything in onReady throwing would abort startup with no window and no way to quit, so report
  // it the same way a failed Application build is reported.
  app.whenReady().then(onReady).catch(reportStartupFailure)
}

// Handle window-all-closed event
app.on('window-all-closed', () => {
  applicationInstance?.handleAllWindowsClosed()
})

// Handle activate event (macOS)
app.on('activate', () => {
  applicationInstance?.handleActivate()
})

// Handle before-quit event
async function shutdownBeforeQuit(): Promise<void> {
  log.info('Application is shutting down, cleaning up resources...')
  try {
    await applicationInstance?.shutdown()
    // Log the outcome BEFORE closing the file log, so both the success and failure messages are
    // actually written rather than logged into an already-closed sink.
    log.info('Graceful shutdown completed.')
    await closeFileLogWithTimeout()
    // Now we can actually quit
    app.exit(0)
  } catch (error) {
    log.error('Error during shutdown:', error)
    await closeFileLogWithTimeout()
    app.exit(1)
  }
}

let quitInProgress = false

/**
 * A Quit from the menu, Cmd+Q or the Dock closes the windows first, so a page with unsaved changes
 * can ask, and the controllers shut down only once every window has gone.
 */
async function quitWhenWindowsClose(): Promise<void> {
  if (quitInProgress) {
    return
  }
  quitInProgress = true
  if (applicationInstance && !(await applicationInstance.closeWindowsForQuit())) {
    log.info('Quit cancelled, a window kept its unsaved changes')
    quitInProgress = false
    return
  }
  await shutdownBeforeQuit()
}

app.on('before-quit', (event) => {
  // Prevent the default quit behavior
  event.preventDefault()
  void quitWhenWindowsClose()
})
