import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { Application } from './application'
import { SenderError } from '../photonics-dmx/senders/BaseSender'
import { 
  isSenderErrorHandled, 
  markSenderErrorHandled, 
  getLastErrorHandledTime,
  removeSenderErrorHandled 
} from './senderErrorTracking'

// Global reference to application for error handling
let applicationInstance: Application | null = null;

// Global error handling
process.on('uncaughtException', (error: any) => {
  console.error('Uncaught exception:', error)
  
  // Check if this is a network sender error (UDP socket error)
  const isNetworkError = error && (
    error.code === 'EHOSTUNREACH' ||
    error.code === 'EHOSTDOWN' ||
    error.code === 'ENETUNREACH' ||
    error.code === 'ETIMEDOUT'
  ) && error.syscall === 'send';
  
  if (!isNetworkError || !applicationInstance) {
    return;
  }
  
  // Determine which sender this error is from based on port
  let senderId: string | null = null;
  if (error.port === 6454) {
    senderId = 'artnet';
  } else if (error.port === 5568) {
    senderId = 'sacn';
  } else if (error.address) {
    // If we have an address but port doesn't match, try to determine from enabled senders
    // This handles cases where port might be different or we need to check by address
    const controllerManager = applicationInstance.getControllerManager();
    if (controllerManager && controllerManager.getIsInitialized()) {
      const senderManager = controllerManager.getSenderManager();
      if (senderManager) {
        // Check which network sender is enabled and might be using this address
        if (senderManager.isSenderEnabled('artnet')) {
          senderId = 'artnet';
        } else if (senderManager.isSenderEnabled('sacn')) {
          senderId = 'sacn';
        }
      }
    }
  }
  
  if (senderId && applicationInstance) {
    const now = Date.now();
    const lastHandled = getLastErrorHandledTime(senderId);
    
    // Debounce: only handle errors for the same sender once per second
    if (now - lastHandled < 1000) {
      return; // Skip if we just handled an error for this sender
    }
    
    // Check if we've already permanently handled this sender's error
    if (isSenderErrorHandled(senderId)) {
      return; // Already handled, prevent loop
    }
    
    try {
      const controllerManager = applicationInstance.getControllerManager();
      if (controllerManager && controllerManager.getIsInitialized()) {
        const senderManager = controllerManager.getSenderManager();
        if (senderManager && senderManager.isSenderEnabled(senderId)) {
          // Mark as handled immediately to prevent loops
          markSenderErrorHandled(senderId, now);
          
          // IMMEDIATELY remove from enabled senders to stop further send() calls
          // This prevents the loop by stopping the sender from receiving more data
          const sender = (senderManager as any).enabledSenders?.get(senderId);
          if (sender) {
            // Remove from enabled senders map immediately to stop send() calls
            (senderManager as any).enabledSenders.delete(senderId);
            (senderManager as any).senderUniverseMap.delete(senderId);
            
            // Now emit the error (this will trigger cleanup and UI update)
            const senderError = new SenderError(error);
            (senderError as any).isNetworkError = true;
            (senderError as any).shouldDisable = true;
            
            if (sender.eventEmitter) {
              sender.eventEmitter.emit('SenderError', senderError);
            }
            
            // Stop the sender asynchronously (don't await to avoid blocking)
            sender.stop().catch((stopErr: any) => {
              console.error(`Error stopping ${senderId} sender after network error:`, stopErr);
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error handling ${senderId} uncaught exception:`, err);
      // Remove from handled set on error so we can retry
      removeSenderErrorHandled(senderId);
    }
  }
})

// Global unhandled promise rejection handling
process.on('unhandledRejection', (reason, _promise) => {
  console.error('Unhandled promise rejection:', reason)
})

// Create application instance
const application = new Application()
applicationInstance = application; // Store reference for error handling

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
  application.init().catch(err => {
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