import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { Application } from './application'

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
})

// Global unhandled promise rejection handling
process.on('unhandledRejection', (reason, _promise) => {
  console.error('Unhandled promise rejection:', reason)
})

// Create application instance
const application = new Application()

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