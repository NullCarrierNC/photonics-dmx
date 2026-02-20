import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { Application } from './application'
import { SenderError, SenderId } from '../photonics-dmx/senders/BaseSender'
import {
  isSenderErrorHandled,
  markSenderErrorHandled,
  getLastErrorHandledTime,
  removeSenderErrorHandled,
} from './senderErrorTracking'

// Global reference to application for error handling
let applicationInstance: Application | null = null

// Type for Node.js network errors (code, syscall, port, address)
interface NetworkErrorLike {
  code?: string
  syscall?: string
  port?: number
  address?: string
}

function isNetworkErrorLike(err: unknown): err is NetworkErrorLike {
  return err !== null && typeof err === 'object' && 'code' in err && 'syscall' in err
}

// Global error handling
process.on('uncaughtException', (error: unknown) => {
  // Check if this is a network sender error (UDP socket error)
  const isNetworkError =
    isNetworkErrorLike(error) &&
    (error.code === 'EHOSTUNREACH' ||
      error.code === 'EHOSTDOWN' ||
      error.code === 'ENETUNREACH' ||
      error.code === 'ETIMEDOUT') &&
    error.syscall === 'send'

  if (!isNetworkError || !applicationInstance) {
    console.error('Uncaught exception:', error)
    return
  }

  // Determine which sender this error is from (use configured port, then address fallback)
  let senderId: string | null = null
  if (isNetworkErrorLike(error)) {
    const controllerManager = applicationInstance.getControllerManager()
    if (controllerManager && controllerManager.getIsInitialized()) {
      const senderManager = controllerManager.getSenderManager()
      if (senderManager) {
        if (error.port != null) {
          senderId = senderManager.getSenderIdByPort(error.port)
        }
        if (!senderId && error.port == null && error.address) {
          // Port absent only — fall back to checking which network sender is enabled.
          // Do NOT fall back when a port was present but unmatched: that indicates a
          // cleanup error from a sender already being stopped, not a new fault.
          if (senderManager.isSenderEnabled('artnet')) {
            senderId = 'artnet'
          } else if (senderManager.isSenderEnabled('sacn')) {
            senderId = 'sacn'
          }
        }
      }
    }
  }

  if (senderId && applicationInstance) {
    const now = Date.now()
    const lastHandled = getLastErrorHandledTime(senderId)

    // Debounce: only handle errors for the same sender once per second
    if (now - lastHandled < 1000) {
      return
    }

    // Check if we've already permanently handled this sender's error
    if (isSenderErrorHandled(senderId)) {
      return
    }

    try {
      const controllerManager = applicationInstance.getControllerManager()
      if (controllerManager && controllerManager.getIsInitialized()) {
        const senderManager = controllerManager.getSenderManager()
        if (senderManager && senderManager.isSenderEnabled(senderId)) {
          // Mark as handled immediately to prevent loops
          markSenderErrorHandled(senderId, now)

          const senderError = new SenderError(error, {
            senderId: senderId as SenderId,
            shouldDisable: true,
          })

          // Remove from enabled senders to stop further send() calls (returns null if still initializing)
          const sender = senderManager.getAndRemoveSenderForEmergency(senderId)
          if (sender) {
            console.error(`Network sender error (${senderId}):`, error)
            const senderWithEmit = sender as {
              eventEmitter?: { emit(event: string, payload: SenderError): void }
            }
            if (senderWithEmit.eventEmitter) {
              senderWithEmit.eventEmitter.emit('SenderError', senderError)
            }
            sender.stop().catch((stopErr: unknown) => {
              console.error(`Error stopping ${senderId} sender after network error:`, stopErr)
            })
          } else {
            // Sender is still initializing; mark so enableSender aborts, then emit to frontend
            console.error(`Network sender error (${senderId}):`, error)
            senderManager.markInitFailed(senderId)
            senderManager.emitSenderError(senderError)
          }
        }
      }
    } catch (err) {
      console.error(`Error handling ${senderId} uncaught exception:`, err)
      removeSenderErrorHandled(senderId)
    }
  } else {
    console.error('Uncaught exception:', error)
  }
})

// Global unhandled promise rejection handling
process.on('unhandledRejection', (reason, _promise) => {
  console.error('Unhandled promise rejection:', reason)
})

// Create application instance
const application = new Application()
applicationInstance = application // Store reference for error handling

// Handle clean shutdown on process signals
process.on('SIGINT', async () => {
  console.log('Received SIGINT signal, shutting down gracefully...')

  // Set a hard timeout to force exit after 2 seconds
  const forceExitTimeout = setTimeout(() => {
    console.error('Forced exit due to shutdown timeout!')
    process.exit(1)
  }, 2000)

  try {
    await application.shutdown()
    clearTimeout(forceExitTimeout)
    app.quit()
  } catch (error) {
    console.error('Error during SIGINT shutdown:', error)
    clearTimeout(forceExitTimeout)
    process.exit(1)
  }
})

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM signal, shutting down gracefully...')

  // Set a hard timeout to force exit after 2 seconds
  const forceExitTimeout = setTimeout(() => {
    console.error('Forced exit due to shutdown timeout!')
    process.exit(1)
  }, 2000)

  try {
    await application.shutdown()
    clearTimeout(forceExitTimeout)
    app.quit()
  } catch (error) {
    console.error('Error during SIGTERM shutdown:', error)
    clearTimeout(forceExitTimeout)
    process.exit(1)
  }
})

// Handle app lifecycle events
app.whenReady().then(() => {
  // Set up the app
  electronApp.setAppUserModelId('rocks.photonics')

  // Set app name
  app.name = 'Photonics'

  // Initialize application
  application.init().catch((err) => {
    console.error('Failed to initialize application:', err)
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
  console.log('Application is shutting down, cleaning up resources...')
  try {
    await application.shutdown()
    console.log('Graceful shutdown completed.')
    // Now we can actually quit
    app.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    app.exit(1)
  }
})
