import * as path from 'path'
import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { installDefaultSessionContentSecurityPolicy } from './rendererSessionSecurity'
import { Application } from './application'
import { createFileLogSink } from './logging/fileLogSink'
import { consoleLogSink, createLogger, setLogSink, setMinLogLevel } from '../shared/logger'

const log = createLogger('Main')

let closeFileLog: (() => Promise<void>) | null = null

function closeFileLogWithTimeout(): Promise<void> {
  if (!closeFileLog) {
    return Promise.resolve()
  }
  const c = closeFileLog
  closeFileLog = null
  return Promise.race([c(), new Promise<void>((resolve) => setTimeout(resolve, 500))])
}

// Global reference to application for error handling
let applicationInstance: Application | null = null

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

// Create application instance
const application = new Application()
applicationInstance = application // Store reference for error handling

// Handle clean shutdown on process signals
process.on('SIGINT', async () => {
  log.info('Received SIGINT signal, shutting down gracefully...')

  // Set a hard timeout to force exit after 2 seconds
  const forceExitTimeout = setTimeout(() => {
    log.error('Forced exit due to shutdown timeout!')
    process.exit(1)
  }, 2000)

  try {
    await application.shutdown()
    await closeFileLogWithTimeout()
    clearTimeout(forceExitTimeout)
    app.quit()
  } catch (error) {
    await closeFileLogWithTimeout()
    log.error('Error during SIGINT shutdown:', error)
    clearTimeout(forceExitTimeout)
    process.exit(1)
  }
})

process.on('SIGTERM', async () => {
  log.info('Received SIGTERM signal, shutting down gracefully...')

  // Set a hard timeout to force exit after 2 seconds
  const forceExitTimeout = setTimeout(() => {
    log.error('Forced exit due to shutdown timeout!')
    process.exit(1)
  }, 2000)

  try {
    await application.shutdown()
    await closeFileLogWithTimeout()
    clearTimeout(forceExitTimeout)
    app.quit()
  } catch (error) {
    await closeFileLogWithTimeout()
    log.error('Error during SIGTERM shutdown:', error)
    clearTimeout(forceExitTimeout)
    process.exit(1)
  }
})

// Handle app lifecycle events
app.whenReady().then(() => {
  const logsDir = path.join(app.getPath('appData'), 'Photonics.rocks', 'logs')
  const { sink: fileSink, close: fileLogClose } = createFileLogSink({ logsDir })
  closeFileLog = fileLogClose
  setLogSink((entry) => {
    consoleLogSink(entry)
    fileSink(entry)
  })
  if (!process.env.PHOTONICS_LOG_LEVEL && app.isPackaged) {
    setMinLogLevel('error')
  }
  log.info(`Writing logs to ${logsDir}`)

  installDefaultSessionContentSecurityPolicy()

  // Set up the app
  electronApp.setAppUserModelId('rocks.photonics')

  // Set app name
  app.name = 'Photonics'

  // Initialize application
  application.init().catch((err) => {
    log.error('Failed to initialize application:', err)
  })

  // Default session handlers
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
})

// Handle window-all-closed event
app.on('window-all-closed', () => {
  application.handleAllWindowsClosed()
})

// Handle activate event (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    application.handleActivate()
  }
})

// Handle before-quit event
app.on('before-quit', async (event) => {
  // Prevent the default quit behavior
  event.preventDefault()

  // Perform our graceful shutdown
  log.info('Application is shutting down, cleaning up resources...')
  try {
    await application.shutdown()
    await closeFileLogWithTimeout()
    log.info('Graceful shutdown completed.')
    // Now we can actually quit
    app.exit(0)
  } catch (error) {
    await closeFileLogWithTimeout()
    log.error('Error during shutdown:', error)
    app.exit(1)
  }
})
