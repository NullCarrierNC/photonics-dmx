import { BrowserWindow, dialog, shell, screen, type WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { ControllerManager } from './controllers/ControllerManager'
import { RENDERER_RECEIVE } from '../shared/ipcChannels'
import type { AudioLightingData } from '../photonics-dmx/listeners/Audio/AudioTypes'
import { denyWebContentsWillNavigate } from './rendererSessionSecurity'
import { rendererPageUrl } from './rendererScheme'
import { createLogger } from '../shared/logger'
import { centredIn, fitWindowBounds, type WindowBounds } from './windowBounds'
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

/** The order a Quit asks about pages with unsaved changes, the main window last. */
const QUIT_ASK_ORDER: WindowRole[] = ['cueEditor', 'audioPreview', 'main']

/** How long a closing page has to answer before a Quit carries on without it. Pages share it. */
const CLOSE_ANSWER_MS = 5000

/** How long a window's geometry has to settle after a move or resize before it is saved. */
const SAVE_DELAY_MS = 500

/** Where a page with unsaved changes stands on the close or reload it refused. */
interface UnloadState {
  /** The window was asked to close, so Leave closes it. Otherwise the unload was a reload. */
  closing: boolean
  /** The user is being asked. */
  asking: boolean
  /** The user chose Leave, so the next unload goes through without asking. */
  leaving: boolean
}

export class WindowManager {
  private readonly windows = new Map<WindowRole, BrowserWindow>()
  private readonly saveTimers = new Map<WindowRole, NodeJS.Timeout>()
  private controllerManager: ControllerManager | null = null
  /** Set once the app closes its windows to quit. No page is asked to stay after that. */
  private quitting = false
  /** The pages that report unsaved changes, by web contents id. */
  private readonly unsavedPages = new Set<number>()

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

    // The normal bounds, so a window closed maximised or full screen reopens at the size it
    // returns to.
    const { width, height, x, y } = window.getNormalBounds()
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

  /** Saves a window's geometry now when a save is waiting for it to settle. */
  private flushSave(role: WindowRole): void {
    const pending = this.saveTimers.get(role)
    if (!pending) {
      return
    }
    clearTimeout(pending)
    this.saveTimers.delete(role)
    void this.saveWindowState(role)
  }

  /**
   * The saved geometry for a role, kept on screen, or its default size centred in the primary work
   * area. A saved window always has a position, so a stored size without one was never the user's
   * and the default size applies.
   */
  private initialBounds(role: WindowRole): WindowBounds {
    const spec = WINDOW_SPECS[role]
    const stored = this.controllerManager?.getConfig().getPreference(spec.stateKey)
    const primary = screen.getPrimaryDisplay().workArea
    if (stored?.x === undefined || stored.y === undefined) {
      return centredIn(spec, primary)
    }
    return fitWindowBounds(
      {
        width: stored.width || spec.width,
        height: stored.height || spec.height,
        x: stored.x,
        y: stored.y,
      },
      screen.getAllDisplays().map((display) => display.workArea),
      primary,
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
        // DevTools open only while developing, so a packaged build offers no console.
        devTools: is.dev,
        // Audio capture and analysis run in the main window and drive the show. Chromium throttles
        // timers and frames in a hidden window, which is exactly the case where a game is running
        // full-screen in front of it.
        ...(role === 'main' ? { backgroundThrottling: false } : {}),
      },
    })
    this.windows.set(role, window)

    // Linux emits only `move` and `resize`. The save waits for the window to settle either way.
    const save = (): void => this.scheduleSave(role)
    window.on('resized', save)
    window.on('moved', save)
    window.on('resize', save)
    window.on('move', save)
    // The last chance to read the geometry, so a save still waiting to settle runs now.
    window.on('close', () => this.flushSave(role))
    window.on('ready-to-show', () => window.show())
    const webContentsId = window.webContents.id
    window.on('closed', () => {
      this.unsavedPages.delete(webContentsId)
      if (this.windows.get(role) === window) {
        this.windows.delete(role)
      }
    })
    // The record belongs to the page's document, and a reload the page let go commits a new one.
    // Emitted for the main frame only, and never for a same-document navigation.
    window.webContents.on('did-navigate', () => {
      this.unsavedPages.delete(webContentsId)
    })
    if (role === 'main') {
      this.stopAudioWith(window)
    }

    window.webContents.setWindowOpenHandler((details) => {
      this.openExternalSafely(details.url)
      return { action: 'deny' }
    })
    denyWebContentsWillNavigate(window.webContents)
    const unload: UnloadState = { closing: false, asking: false, leaving: false }
    window.on('close', () => {
      unload.closing = true
    })
    window.webContents.on('will-prevent-unload', (event) =>
      this.onUnloadRefused(window, unload, event),
    )

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const failed = onLoadFailure(spec.label)
    if (is.dev && devUrl) {
      window.loadURL(spec.query ? `${devUrl}?window=${spec.query}` : devUrl).catch(failed)
    } else {
      window.loadURL(rendererPageUrl(spec.query)).catch(failed)
    }

    return window
  }

  /**
   * Audio capture runs in the main window's page, so audio stops when that page goes. The disable
   * blacks the rig out and tells every window, as the audio switch does.
   */
  private stopAudioWith(window: BrowserWindow): void {
    const stop = (): void => {
      this.controllerManager?.disableAudio().catch((err: unknown) => {
        log.error('Failed to stop audio with the main window:', err)
      })
    }
    window.on('closed', stop)
    window.webContents.on('render-process-gone', stop)
  }

  /**
   * A page with unsaved changes refused to unload, and Electron cancels the close or reload unless
   * this lets it go. The user is asked without holding up the main process, whose timers drive the
   * show, and a Leave repeats the close or reload with the page let through.
   */
  private onUnloadRefused(
    window: BrowserWindow,
    unload: UnloadState,
    event: { preventDefault: () => void },
  ): void {
    if (this.quitting || unload.leaving) {
      unload.leaving = false
      event.preventDefault()
      return
    }
    if (unload.asking) {
      return
    }
    unload.asking = true
    void this.confirmLeave(window).then((leave) => {
      const closing = unload.closing
      unload.asking = false
      unload.closing = false
      if (window.isDestroyed()) {
        return
      }
      if (!leave) {
        return
      }
      unload.leaving = true
      if (closing) {
        window.close()
      } else {
        window.webContents.reload()
      }
    })
  }

  /** Asks whether to leave a page that holds unsaved changes. True to leave. */
  private async confirmLeave(window: BrowserWindow): Promise<boolean> {
    try {
      const { response } = await dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['Leave', 'Stay'],
        defaultId: 1,
        cancelId: 1,
        title: 'Unsaved changes',
        message: 'This page has unsaved changes.',
        detail: 'Leave anyway and lose them?',
      })
      return response === 0
    } catch (error) {
      log.error('Could not ask about unsaved changes, keeping the page:', error)
      return false
    }
  }

  /** Brings a window to the front, restoring it first when it is minimised. */
  private front(window: BrowserWindow): void {
    if (window.isMinimized()) {
      window.restore()
    }
    window.show()
    window.focus()
  }

  /** Fronts the window open in a role, or creates it. */
  private openOrFocus(role: WindowRole): BrowserWindow {
    const window = this.openWindow(role)
    if (window) {
      this.front(window)
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
    this.front(window)
  }

  /** Opens the main window for audio capture, unless one is open or a Quit is under way. */
  public ensureMainWindow(): void {
    if (!this.quitting && !this.openWindow('main')) {
      this.createMainWindow()
    }
  }

  /** Records whether a page holds unsaved changes, as the page reports it. */
  public setUnsavedChanges(webContents: WebContents, unsaved: boolean): void {
    if (unsaved) {
      this.unsavedPages.add(webContents.id)
    } else {
      this.unsavedPages.delete(webContents.id)
    }
  }

  /** Whether the app is closing its windows to quit or shut down. */
  public isQuitting(): boolean {
    return this.quitting
  }

  /**
   * Saves every open window's geometry and asks about each page with unsaved changes before any
   * window closes, so a Stay leaves every window as it was. Once every page is let go the windows
   * close, and true comes back once they have gone.
   */
  public async closeWindowsForQuit(): Promise<boolean> {
    for (const role of WINDOW_ROLES) {
      await this.saveWindowState(role)
    }
    for (const role of QUIT_ASK_ORDER) {
      const window = this.openWindow(role)
      if (window && this.unsavedPages.has(window.webContents.id)) {
        if (!(await this.confirmLeave(window))) {
          return false
        }
      }
    }
    this.quitting = true
    const open = WINDOW_ROLES.map((role) => this.openWindow(role)).filter(
      (window) => window !== null,
    )
    await Promise.all(open.map((window) => this.closeWithin(window)))
    return true
  }

  /** Closes a window and settles once it has gone. A page that never answers counts as gone. */
  private closeWithin(window: BrowserWindow): Promise<void> {
    return new Promise((resolve) => {
      const settle = (): void => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(settle, CLOSE_ANSWER_MS)
      window.on('closed', settle)
      window.close()
    })
  }

  /**
   * Saves every open window's geometry, then closes them all. The app calls this to shut down, so
   * no page with unsaved changes is asked to stay.
   */
  public async closeAllWindows(): Promise<void> {
    this.quitting = true
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
