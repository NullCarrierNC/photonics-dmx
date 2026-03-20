import { BrowserWindow, shell, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { ControllerManager } from './controllers/ControllerManager'
import { RENDERER_RECEIVE } from '../shared/ipcChannels'
import type { AudioLightingData } from '../photonics-dmx/listeners/Audio/AudioTypes'

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private cueEditorWindow: BrowserWindow | null = null
  private audioPreviewWindow: BrowserWindow | null = null
  private controllerManager: ControllerManager | null = null
  private resizeTimeout: NodeJS.Timeout | null = null
  private moveTimeout: NodeJS.Timeout | null = null
  private cueEditorResizeTimeout: NodeJS.Timeout | null = null
  private cueEditorMoveTimeout: NodeJS.Timeout | null = null
  private audioPreviewResizeTimeout: NodeJS.Timeout | null = null
  private audioPreviewMoveTimeout: NodeJS.Timeout | null = null

  /**
   * Sets the controller manager for accessing preferences
   */
  public setControllerManager(controllerManager: ControllerManager): void {
    this.controllerManager = controllerManager
  }

  /**
   * Saves window state to preferences with debouncing
   */
  private async saveWindowState(
    window: BrowserWindow,
    preferenceKey: 'windowState' | 'cueEditorWindowState' | 'audioPreviewWindowState',
  ): Promise<void> {
    if (window.isDestroyed() || !this.controllerManager) {
      return
    }

    const bounds = window.getBounds()
    const windowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    }

    try {
      await this.controllerManager.getConfig().updatePreferences({ [preferenceKey]: windowState })
    } catch (error) {
      console.error('Failed to save window state:', error)
    }
  }

  /**
   * Debounced save for resize events
   */
  private debouncedSaveMainResize(): void {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout)
    }
    this.resizeTimeout = setTimeout(() => {
      if (this.mainWindow) {
        this.saveWindowState(this.mainWindow, 'windowState')
      }
    }, 500)
  }

  /**
   * Debounced save for move events
   */
  private debouncedSaveMainMove(): void {
    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout)
    }
    this.moveTimeout = setTimeout(() => {
      if (this.mainWindow) {
        this.saveWindowState(this.mainWindow, 'windowState')
      }
    }, 500)
  }

  /**
   * Debounced save for cue editor resize events
   */
  private debouncedSaveCueEditorResize(): void {
    if (this.cueEditorResizeTimeout) {
      clearTimeout(this.cueEditorResizeTimeout)
    }
    this.cueEditorResizeTimeout = setTimeout(() => {
      if (this.cueEditorWindow) {
        this.saveWindowState(this.cueEditorWindow, 'cueEditorWindowState')
      }
    }, 500)
  }

  /**
   * Debounced save for cue editor move events
   */
  private debouncedSaveCueEditorMove(): void {
    if (this.cueEditorMoveTimeout) {
      clearTimeout(this.cueEditorMoveTimeout)
    }
    this.cueEditorMoveTimeout = setTimeout(() => {
      if (this.cueEditorWindow) {
        this.saveWindowState(this.cueEditorWindow, 'cueEditorWindowState')
      }
    }, 500)
  }

  private debouncedSaveAudioPreviewResize(): void {
    if (this.audioPreviewResizeTimeout) {
      clearTimeout(this.audioPreviewResizeTimeout)
    }
    this.audioPreviewResizeTimeout = setTimeout(() => {
      if (this.audioPreviewWindow) {
        this.saveWindowState(this.audioPreviewWindow, 'audioPreviewWindowState')
      }
    }, 500)
  }

  private debouncedSaveAudioPreviewMove(): void {
    if (this.audioPreviewMoveTimeout) {
      clearTimeout(this.audioPreviewMoveTimeout)
    }
    this.audioPreviewMoveTimeout = setTimeout(() => {
      if (this.audioPreviewWindow) {
        this.saveWindowState(this.audioPreviewWindow, 'audioPreviewWindowState')
      }
    }, 500)
  }

  /**
   * Validates window bounds to ensure window is visible on screen
   */
  private validateWindowBounds(bounds: { width: number; height: number; x: number; y: number }): {
    width: number
    height: number
    x: number
    y: number
  } {
    const displays = screen.getAllDisplays()
    let isValid = false

    // Check if window is visible on any display
    for (const display of displays) {
      const { x, y, width, height } = display.bounds
      if (
        bounds.x >= x &&
        bounds.y >= y &&
        bounds.x + bounds.width <= x + width &&
        bounds.y + bounds.height <= y + height
      ) {
        isValid = true
        break
      }
    }

    // If not valid, center on primary display
    if (!isValid) {
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
      return {
        width: Math.min(bounds.width, screenWidth),
        height: Math.min(bounds.height, screenHeight),
        x: Math.floor((screenWidth - Math.min(bounds.width, screenWidth)) / 2),
        y: Math.floor((screenHeight - Math.min(bounds.height, screenHeight)) / 2),
      }
    }

    return bounds
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
      y: undefined as number | undefined,
    }

    if (this.controllerManager) {
      const savedState = this.controllerManager.getConfig().getPreference('windowState')
      if (savedState) {
        windowState = {
          width: savedState.width || 1280,
          height: savedState.height || 1000,
          x: savedState.x,
          y: savedState.y,
        }
      }
    }

    // Validate bounds
    const validatedBounds = this.validateWindowBounds({
      width: windowState.width,
      height: windowState.height,
      x: windowState.x ?? 0,
      y: windowState.y ?? 0,
    })

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
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // Set up event listeners for window state persistence
    this.mainWindow.on('resized', () => {
      this.debouncedSaveMainResize()
    })

    this.mainWindow.on('moved', () => {
      this.debouncedSaveMainMove()
    })

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show()
    })

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // Load the renderer
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return this.mainWindow
  }

  /**
   * Creates the cue editor window
   */
  private createCueEditorWindow(): BrowserWindow {
    let windowState = {
      width: 1200,
      height: 900,
      x: undefined as number | undefined,
      y: undefined as number | undefined,
    }

    if (this.controllerManager) {
      const savedState = this.controllerManager.getConfig().getPreference('cueEditorWindowState')
      if (savedState) {
        windowState = {
          width: savedState.width || 1200,
          height: savedState.height || 900,
          x: savedState.x,
          y: savedState.y,
        }
      }
    }

    const validatedBounds = this.validateWindowBounds({
      width: windowState.width,
      height: windowState.height,
      x: windowState.x ?? 0,
      y: windowState.y ?? 0,
    })

    this.cueEditorWindow = new BrowserWindow({
      width: validatedBounds.width,
      height: validatedBounds.height,
      x: validatedBounds.x,
      y: validatedBounds.y,
      title: 'Cue Editor - Photonics',
      show: false,
      autoHideMenuBar: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    this.cueEditorWindow.on('resized', () => {
      this.debouncedSaveCueEditorResize()
    })

    this.cueEditorWindow.on('moved', () => {
      this.debouncedSaveCueEditorMove()
    })

    this.cueEditorWindow.on('ready-to-show', () => {
      this.cueEditorWindow?.show()
    })

    this.cueEditorWindow.on('closed', () => {
      this.cueEditorWindow = null
    })

    this.cueEditorWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.cueEditorWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?window=cue-editor`)
    } else {
      this.cueEditorWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        query: { window: 'cue-editor' },
      })
    }

    return this.cueEditorWindow
  }

  /**
   * Opens the cue editor window (focuses existing)
   */
  public openCueEditorWindow(): BrowserWindow {
    if (this.cueEditorWindow && !this.cueEditorWindow.isDestroyed()) {
      this.cueEditorWindow.focus()
      return this.cueEditorWindow
    }

    return this.createCueEditorWindow()
  }

  /**
   * Forwards analysed audio to the Audio Preview window (single target; avoids duplicate capture).
   */
  public broadcastAudioMirror(data: AudioLightingData): void {
    if (this.audioPreviewWindow && !this.audioPreviewWindow.isDestroyed()) {
      this.audioPreviewWindow.webContents.send(RENDERER_RECEIVE.AUDIO_DATA_MIRROR, data)
    }
  }

  /**
   * Creates the audio preview window
   */
  private createAudioPreviewWindow(): BrowserWindow {
    let windowState = {
      width: 560,
      height: 420,
      x: undefined as number | undefined,
      y: undefined as number | undefined,
    }

    if (this.controllerManager) {
      const savedState = this.controllerManager.getConfig().getPreference('audioPreviewWindowState')
      if (savedState) {
        windowState = {
          width: savedState.width || 560,
          height: savedState.height || 420,
          x: savedState.x,
          y: savedState.y,
        }
      }
    }

    const validatedBounds = this.validateWindowBounds({
      width: windowState.width,
      height: windowState.height,
      x: windowState.x ?? 0,
      y: windowState.y ?? 0,
    })

    this.audioPreviewWindow = new BrowserWindow({
      width: validatedBounds.width,
      height: validatedBounds.height,
      x: validatedBounds.x,
      y: validatedBounds.y,
      title: 'Audio Preview - Photonics',
      show: false,
      autoHideMenuBar: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    this.audioPreviewWindow.on('resized', () => {
      this.debouncedSaveAudioPreviewResize()
    })

    this.audioPreviewWindow.on('moved', () => {
      this.debouncedSaveAudioPreviewMove()
    })

    this.audioPreviewWindow.on('ready-to-show', () => {
      this.audioPreviewWindow?.show()
    })

    this.audioPreviewWindow.on('closed', () => {
      this.audioPreviewWindow = null
    })

    this.audioPreviewWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.audioPreviewWindow.loadURL(
        `${process.env['ELECTRON_RENDERER_URL']}?window=audio-preview`,
      )
    } else {
      this.audioPreviewWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        query: { window: 'audio-preview' },
      })
    }

    return this.audioPreviewWindow
  }

  /**
   * Opens the audio preview window (focuses existing)
   */
  public openAudioPreviewWindow(): BrowserWindow {
    if (this.audioPreviewWindow && !this.audioPreviewWindow.isDestroyed()) {
      this.audioPreviewWindow.focus()
      return this.audioPreviewWindow
    }

    return this.createAudioPreviewWindow()
  }

  /**
   * Checks if there are any open windows
   */
  public hasWindows(): boolean {
    return BrowserWindow.getAllWindows().length > 0
  }

  /**
   * Gets the main window instance
   */
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  /**
   * Closes all application windows
   */
  public async closeAllWindows(): Promise<void> {
    // Save window state one final time before closing
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      await this.saveWindowState(this.mainWindow, 'windowState')
    }
    if (this.cueEditorWindow && !this.cueEditorWindow.isDestroyed()) {
      await this.saveWindowState(this.cueEditorWindow, 'cueEditorWindowState')
    }
    if (this.audioPreviewWindow && !this.audioPreviewWindow.isDestroyed()) {
      await this.saveWindowState(this.audioPreviewWindow, 'audioPreviewWindowState')
    }

    // Clear any pending timeouts
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout)
      this.resizeTimeout = null
    }
    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout)
      this.moveTimeout = null
    }
    if (this.cueEditorResizeTimeout) {
      clearTimeout(this.cueEditorResizeTimeout)
      this.cueEditorResizeTimeout = null
    }
    if (this.cueEditorMoveTimeout) {
      clearTimeout(this.cueEditorMoveTimeout)
      this.cueEditorMoveTimeout = null
    }
    if (this.audioPreviewResizeTimeout) {
      clearTimeout(this.audioPreviewResizeTimeout)
      this.audioPreviewResizeTimeout = null
    }
    if (this.audioPreviewMoveTimeout) {
      clearTimeout(this.audioPreviewMoveTimeout)
      this.audioPreviewMoveTimeout = null
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close()
    }
    this.mainWindow = null

    if (this.cueEditorWindow && !this.cueEditorWindow.isDestroyed()) {
      this.cueEditorWindow.close()
    }
    this.cueEditorWindow = null

    if (this.audioPreviewWindow && !this.audioPreviewWindow.isDestroyed()) {
      this.audioPreviewWindow.close()
    }
    this.audioPreviewWindow = null
  }
}
