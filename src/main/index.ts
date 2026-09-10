import * as path from 'path'
import { app, BrowserWindow, dialog } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { installDefaultSessionContentSecurityPolicy } from './rendererSessionSecurity'
import { Application } from './application'
import { createFileLogSink } from './logging/fileLogSink'
import { consoleLogSink, createLogger, setLogSink, setMinLogLevel } from '../shared/logger'

const log = createLogger('Main')

if (!app.isPackaged) {
  app.commandLine.appendSwitch('disable-http-cache')
}

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

// Global error handling: delegate network sender errors to ControllerManager for unified handling
process.on('uncaughtException', (error: unknown) => {
  const handled =
    applicationInstance?.getControllerManager()?.handleUncaughtException(error) ?? false
  if (!handled) {
    log.error('Uncaught exception:', error)
  }
})

// Global unhandled promise rejection handling
process.on('unhandledRejection', (reason, _promise) => {
  log.error('Unhandled promise rejection:', reason)
})

// Handle clean shutdown on process signals
process.on('SIGINT', async () => {
  log.info('Received SIGINT signal, shutting down gracefully...')

  // Set a hard timeout to force exit after 2 seconds
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
    log.error('Error during SIGINT shutdown:', error)
    await closeFileLogWithTimeout()
    clearTimeout(forceExitTimeout)
    process.exit(1)
  }
})

process.on('SIGTERM', async () => {
  log.info('Received SIGTERM signal, shutting down gracefully...')

  // Set a hard timeout to force exit after 2 seconds
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
    // Log BEFORE closing the file log so the shutdown-failure message is actually written.
    log.error('Error during SIGTERM shutdown:', error)
    await closeFileLogWithTimeout()
    clearTimeout(forceExitTimeout)
    process.exit(1)
  }
})

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

app
  .whenReady()
  .then(() => {
    const logsDir = path.join(app.getPath('appData'), 'Photonics.rocks', 'logs')
    startFileLogging(logsDir)
    // Named while the floor is still info, so the log file records where it is.
    log.info(`Writing logs to ${logsDir}`)
    if (!process.env.PHOTONICS_LOG_LEVEL && app.isPackaged) {
      setMinLogLevel('error')
    }

    installDefaultSessionContentSecurityPolicy()

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

    // Initialize application. A controller failure resolves and leaves the window reporting the
    // failed phase, so a rejection here means the window or IPC could not be set up and there is
    // nothing left to report through. Say so and stop rather than idling with no interface.
    applicationInstance.init().catch(reportStartupFailure)

    // Default session handlers
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
  })
  // Anything else in here throwing would abort startup with no window and no way to quit, so
  // report it the same way a failed Application build is reported.
  .catch(reportStartupFailure)

// Handle window-all-closed event
app.on('window-all-closed', () => {
  applicationInstance?.handleAllWindowsClosed()
})

// Handle activate event (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    applicationInstance?.handleActivate()
  }
})

// Handle before-quit event
app.on('before-quit', async (event) => {
  // Prevent the default quit behavior
  event.preventDefault()

  // Perform our graceful shutdown
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
})
