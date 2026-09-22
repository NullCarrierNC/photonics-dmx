import { BrowserWindow, shell, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { ControllerManager } from './controllers/ControllerManager'
import { RENDERER_RECEIVE } from '../shared/ipcChannels'
import type { AudioLightingData } from '../photonics-dmx/listeners/Audio/AudioTypes'
import { denyWebContentsWillNavigate } from './rendererSessionSecurity'
import { createLogger } from '../shared/logger'
import { fitWindowBounds, type WindowBounds } from './windowBounds'
const log = createLogger('WindowManager')

/** The window factories return synchronously and `ready-to-show` drives display, so nothing awaits a load. */
const onLoadFailure =
  (window: string) =>
  (err: unknown): void => {
    log.error(`Failed to load the ${window} renderer:`, err)
  }

/** The windows the app opens, at most one of each. */
type WindowRole = 'main' | 'cueEditor' | 'audioPreview'

interface WindowSpec {
  /** The preference the window's geometry is saved under. */
  stateKey: 'windowState' | 'cueEditorWindowState' | 'audioPreviewWindowState'
  width: number
  height: number
  /** Names the window in a failed-load log line. */
  label: string
  title?: string
  /** The renderer entry's `window` query. The main window loads the entry without one. */
  query?: string
}

const WINDOW_SPECS: Record<WindowRole, WindowSpec> = {
  main: { stateKey: 'windowState', width: 1280, height: 1000, label: 'main' },
  cueEditor: {
    stateKey: 'cueEditorWindowState',
    width: 1200,
    height: 900,
    label: 'cue editor',
    title: 'Cue Editor - Photonics',
    query: 'cue-editor',
  },
  audioPreview: {
    stateKey: 'audioPreviewWindowState',
    width: 560,
    height: 584,
    label: 'audio preview',
    title: 'Audio Preview - Photonics',
    query: 'audio-preview',
  },
}

const WINDOW_ROLES = Object.keys(WINDOW_SPECS) as WindowRole[]

/** How long a window's geometry has to settle after a move or resize before it is saved. */
const SAVE_DELAY_MS = 500

export class WindowManager {
  private readonly windows = new Map<WindowRole, BrowserWindow>()
  private readonly saveTimers = new Map<WindowRole, NodeJS.Timeout>()
  private controllerManager: ControllerManager | null = null

  /**
   * Sets the controller manager for accessing preferences
   */
  public setControllerManager(controllerManager: ControllerManager): void {
    this.controllerManager = controllerManager
  }

  /**
   * Opens a renderer-supplied URL in the system browser, allowing only http(s). Anything else
   * (file:, smb:, custom protocol handlers, unparseable strings) is dropped and logged — a
   * compromised renderer must not be able to launch arbitrary local handlers via window.open.
   */
  private openExternalSafely(url: string): void {
    let scheme: string
    try {
      scheme = new URL(url).protocol
    } catch {
      log.warn(`Blocked window.open to unparseable URL: ${url}`)
      return
    }
    if (scheme !== 'http:' && scheme !== 'https:') {
      log.warn(`Blocked window.open to non-http(s) URL: ${url}`)
      return
    }
    shell.openExternal(url).catch((err) => log.error(`Failed to open ${url} externally:`, err))
  }

  /** The window open in a role, or null when there is none or it has been destroyed. */
  private openWindow(role: WindowRole): BrowserWindow | null {
    const window = this.windows.get(role)
    return window && !window.isDestroyed() ? window : null
  }

  /** Saves an open window's geometry to preferences. */
  private async saveWindowState(role: WindowRole): Promise<void> {
    const window = this.openWindow(role)
    if (!window || !this.controllerManager) {
      return
    }

    const { width, height, x, y } = window.getBounds()
    try {
      await this.controllerManager
        .getConfig()
        .updatePreferences({ [WINDOW_SPECS[role].stateKey]: { width, height, x, y } })
    } catch (error) {
      log.error('Failed to save window state:', error)
    }
  }

  /** Saves a window's geometry once it has stopped moving and resizing. */
  private scheduleSave(role: WindowRole): void {
    const pending = this.saveTimers.get(role)
    if (pending) {
      clearTimeout(pending)
    }
    this.saveTimers.set(
      role,
      setTimeout(() => {
        this.saveTimers.delete(role)
        void this.saveWindowState(role)
      }, SAVE_DELAY_MS),
    )
  }

  /** The saved geometry for a role, or its default size, kept on screen. */
  private initialBounds(role: WindowRole): WindowBounds {
    const spec = WINDOW_SPECS[role]
    const saved = this.controllerManager?.getConfig().getPreference(spec.stateKey)
    return fitWindowBounds(
      {
        width: saved?.width || spec.width,
        height: saved?.height || spec.height,
        x: saved?.x ?? 0,
        y: saved?.y ?? 0,
      },
      screen.getAllDisplays().map((display) => display.workArea),
      screen.getPrimaryDisplay().workArea,
    )
  }

  private createWindow(role: WindowRole): BrowserWindow {
    const spec = WINDOW_SPECS[role]
    const window = new BrowserWindow({
      ...this.initialBounds(role),
      ...(spec.title ? { title: spec.title } : {}),
      show: false,
      autoHideMenuBar: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Audio capture and analysis run in the main window and drive the show. Chromium throttles
        // timers and frames in a hidden window, which is exactly the case where a game is running
        // full-screen in front of it.
        ...(role === 'main' ? { backgroundThrottling: false } : {}),
      },
    })
    this.windows.set(role, window)

    window.on('resized', () => this.scheduleSave(role))
    window.on('moved', () => this.scheduleSave(role))
    window.on('ready-to-show', () => window.show())
    window.on('closed', () => {
      if (this.windows.get(role) === window) {
        this.windows.delete(role)
      }
    })

    window.webContents.setWindowOpenHandler((details) => {
      this.openExternalSafely(details.url)
      return { action: 'deny' }
    })
    denyWebContentsWillNavigate(window.webContents)

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const failed = onLoadFailure(spec.label)
    if (is.dev && devUrl) {
      window.loadURL(spec.query ? `${devUrl}?window=${spec.query}` : devUrl).catch(failed)
    } else if (spec.query) {
      window
        .loadFile(join(__dirname, '../renderer/index.html'), { query: { window: spec.query } })
        .catch(failed)
    } else {
      window.loadFile(join(__dirname, '../renderer/index.html')).catch(failed)
    }

    return window
  }

  /** Fronts the window open in a role, or creates it. */
  private openOrFocus(role: WindowRole): BrowserWindow {
    const window = this.openWindow(role)
    if (window) {
      window.focus()
      return window
    }
    return this.createWindow(role)
  }

  /**
   * Creates the main application window
   */
  public createMainWindow(): BrowserWindow {
    return this.createWindow('main')
  }

  /**
   * Opens the cue editor window (focuses existing)
   */
  public openCueEditorWindow(): BrowserWindow {
    return this.openOrFocus('cueEditor')
  }

  /**
   * Opens the audio preview window (focuses existing)
   */
  public openAudioPreviewWindow(): BrowserWindow {
    return this.openOrFocus('audioPreview')
  }

  /**
   * Forwards analysed audio to the Audio Preview window, its only target, so capture runs once.
   */
  public broadcastAudioMirror(data: AudioLightingData): void {
    this.openWindow('audioPreview')?.webContents.send(RENDERER_RECEIVE.AUDIO_DATA_MIRROR, data)
  }

  /**
   * Gets the main window instance
   */
  public getMainWindow(): BrowserWindow | null {
    return this.windows.get('main') ?? null
  }

  /**
   * Brings the main window to the front, creating it if there is none.
   */
  public focusMainWindow(): void {
    const window = this.openWindow('main')
    if (!window) {
      this.createMainWindow()
      return
    }
    if (window.isMinimized()) {
      window.restore()
    }
    window.show()
    window.focus()
  }

  /**
   * Saves every open window's geometry, then closes them all.
   */
  public async closeAllWindows(): Promise<void> {
    for (const role of WINDOW_ROLES) {
      await this.saveWindowState(role)
    }

    for (const timer of this.saveTimers.values()) {
      clearTimeout(timer)
    }
    this.saveTimers.clear()

    for (const role of WINDOW_ROLES) {
      this.openWindow(role)?.close()
    }
    this.windows.clear()
  }
}
