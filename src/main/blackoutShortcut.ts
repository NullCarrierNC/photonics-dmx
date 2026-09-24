import { app, BrowserWindow, globalShortcut } from 'electron'
import {
  DEFAULT_BLACKOUT_SHORTCUT_KEY,
  DEFAULT_BLACKOUT_SHORTCUT_SCOPE,
  type BlackoutShortcutBinding,
  type BlackoutShortcutKey,
  type BlackoutShortcutScope,
} from '../shared/blackoutShortcut'
import { createLogger } from '../shared/logger'

const log = createLogger('blackoutShortcut')

/**
 * The OS-level half of the blackout shortcut, for `system-wide` only.
 *
 * Electron has no way to observe a global shortcut without consuming it, so an armed key is taken
 * from every other application. That is only tolerable because the hook is held exclusively while
 * Photonics is in the background: as soon as one of our windows takes focus the hook is dropped and
 * the renderer's own listener takes over, which is what leaves the key free to close dialogs and
 * deselect cue nodes while the app is being used. With no window open, as macOS allows,
 * the key goes back to the other applications until a window opens again.
 */

/** Long enough to swallow the blur that precedes a focus when moving between our own windows. */
const RECONCILE_DEBOUNCE_MS = 50

/**
 * Electron 43 types an accelerator as a bare string, so a wrong spelling here is a `register` that
 * returns false at runtime rather than a compile error. The backtick spelling is the one to suspect
 * first if the system-wide binding never arms, which is why the warning below names it.
 */
const ACCELERATORS: Record<BlackoutShortcutKey, string> = {
  escape: 'Escape',
  backquote: '`',
}

/**
 * Holds the OS hook for one application. Application owns the one instance, so the binding, the
 * held accelerator and the focus listeners live and die with it.
 */
export class BlackoutShortcut {
  private key: BlackoutShortcutKey = DEFAULT_BLACKOUT_SHORTCUT_KEY
  private scope: BlackoutShortcutScope = DEFAULT_BLACKOUT_SHORTCUT_SCOPE
  private onToggle: (() => void) | null = null
  private reconcileTimer: NodeJS.Timeout | null = null
  /**
   * The accelerator actually held, which can lag what the preference now asks for. Releasing
   * names this one, so a key change while armed frees the old key before the new one is taken.
   */
  private registeredAccelerator: string | null = null
  private registerFailureLogged = false

  private reconcile(): void {
    this.reconcileTimer = null

    // Electron says which window has focus, which stays correct for any number of windows as
    // focus passes between them.
    const inBackground =
      BrowserWindow.getFocusedWindow() === null && BrowserWindow.getAllWindows().length > 0
    const wanted = this.scope === 'system-wide' && inBackground ? ACCELERATORS[this.key] : null

    if (wanted === this.registeredAccelerator) {
      return
    }

    if (this.registeredAccelerator !== null) {
      globalShortcut.unregister(this.registeredAccelerator)
      this.registeredAccelerator = null
    }

    if (wanted === null) {
      return
    }

    if (globalShortcut.register(wanted, () => this.onToggle?.())) {
      this.registeredAccelerator = wanted
      return
    }

    if (!this.registerFailureLogged) {
      // Once, not once per blur. The binding still works while Photonics has focus, so the
      // preference stays on.
      log.warn(
        `Could not register ${wanted} as a system-wide shortcut, most likely because another ` +
          'application holds it. The key still toggles blackout while Photonics has focus.',
      )
      this.registerFailureLogged = true
    }
  }

  /** An arrow, so adding and removing it as a focus listener names the same function. */
  private readonly scheduleReconcile = (): void => {
    if (this.reconcileTimer) {
      clearTimeout(this.reconcileTimer)
    }
    this.reconcileTimer = setTimeout(() => this.reconcile(), RECONCILE_DEBOUNCE_MS)
  }

  /**
   * Starts watching focus so the OS hook is held only while no Photonics window has it.
   *
   * `toggle` runs on the main process, reading and writing the authoritative state directly rather
   * than asking a renderer, since in this mode there may be no focused window to ask.
   */
  public init(toggle: () => void, binding: BlackoutShortcutBinding): void {
    this.onToggle = toggle
    this.key = binding.key
    this.scope = binding.scope

    app.on('browser-window-focus', this.scheduleReconcile)
    app.on('browser-window-blur', this.scheduleReconcile)
    app.on('browser-window-created', this.scheduleReconcile)
    app.on('window-all-closed', this.scheduleReconcile)

    this.reconcile()
  }

  /** Applies a preference change. Takes effect without a restart. */
  public set(next: BlackoutShortcutBinding): void {
    // Both fields, because a key change with the scope unchanged still has to re-arm.
    if (next.key === this.key && next.scope === this.scope) {
      return
    }
    this.key = next.key
    this.scope = next.scope
    this.registerFailureLogged = false
    // Immediately rather than debounced: this is a deliberate user action, not a focus transient.
    if (this.reconcileTimer) {
      clearTimeout(this.reconcileTimer)
    }
    this.reconcile()
  }

  /**
   * Releases the hook and stops watching focus.
   *
   * Called from the application's own shutdown, not from `will-quit`: the quit path ends in
   * `app.exit()`, which never emits it.
   */
  public dispose(): void {
    if (this.reconcileTimer) {
      clearTimeout(this.reconcileTimer)
      this.reconcileTimer = null
    }
    app.removeListener('browser-window-focus', this.scheduleReconcile)
    app.removeListener('browser-window-blur', this.scheduleReconcile)
    app.removeListener('browser-window-created', this.scheduleReconcile)
    app.removeListener('window-all-closed', this.scheduleReconcile)

    if (this.registeredAccelerator !== null) {
      globalShortcut.unregister(this.registeredAccelerator)
      this.registeredAccelerator = null
    }
    this.onToggle = null
    this.key = DEFAULT_BLACKOUT_SHORTCUT_KEY
    this.scope = DEFAULT_BLACKOUT_SHORTCUT_SCOPE
    this.registerFailureLogged = false
  }
}
