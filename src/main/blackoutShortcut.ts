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
 * deselect cue nodes while the app is being used.
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

let key: BlackoutShortcutKey = DEFAULT_BLACKOUT_SHORTCUT_KEY
let scope: BlackoutShortcutScope = DEFAULT_BLACKOUT_SHORTCUT_SCOPE
let onToggle: (() => void) | null = null
let reconcileTimer: NodeJS.Timeout | null = null
/**
 * What is actually held, rather than what the preference now asks for. Releasing has to name the
 * accelerator we took, or changing the key while armed would free the key being taken and keep
 * holding the old one, leaving it stolen from every other application until Photonics quits.
 */
let registeredAccelerator: string | null = null
let registerFailureLogged = false

function reconcile(): void {
  reconcileTimer = null

  // Asking Electron which window has focus is correct for any number of windows, where tracking
  // focus and blur events ourselves would drift the moment two windows hand off.
  const appHasFocus = BrowserWindow.getFocusedWindow() !== null
  const wanted = scope === 'system-wide' && !appHasFocus ? ACCELERATORS[key] : null

  if (wanted === registeredAccelerator) {
    return
  }

  if (registeredAccelerator !== null) {
    globalShortcut.unregister(registeredAccelerator)
    registeredAccelerator = null
  }

  if (wanted === null) {
    return
  }

  if (globalShortcut.register(wanted, () => onToggle?.())) {
    registeredAccelerator = wanted
    return
  }

  if (!registerFailureLogged) {
    // Once, not once per blur. The binding still works while Photonics has focus, so this is a
    // partial loss worth reporting rather than a reason to turn the preference off.
    log.warn(
      `Could not register ${wanted} as a system-wide shortcut, most likely because another ` +
        'application holds it. The key still toggles blackout while Photonics has focus.',
    )
    registerFailureLogged = true
  }
}

function scheduleReconcile(): void {
  if (reconcileTimer) {
    clearTimeout(reconcileTimer)
  }
  reconcileTimer = setTimeout(reconcile, RECONCILE_DEBOUNCE_MS)
}

/**
 * Starts watching focus so the OS hook is held only while no Photonics window has it.
 *
 * `toggle` runs on the main process, reading and writing the authoritative state directly rather
 * than asking a renderer, since in this mode there may be no focused window to ask.
 */
export function initBlackoutShortcut(toggle: () => void, binding: BlackoutShortcutBinding): void {
  onToggle = toggle
  key = binding.key
  scope = binding.scope

  app.on('browser-window-focus', scheduleReconcile)
  app.on('browser-window-blur', scheduleReconcile)
  app.on('browser-window-created', scheduleReconcile)
  app.on('window-all-closed', scheduleReconcile)

  reconcile()
}

/** Applies a preference change. Takes effect without a restart. */
export function setBlackoutShortcut(next: BlackoutShortcutBinding): void {
  // Both fields, because a key change with the scope unchanged still has to re-arm.
  if (next.key === key && next.scope === scope) {
    return
  }
  key = next.key
  scope = next.scope
  registerFailureLogged = false
  // Immediately rather than debounced: this is a deliberate user action, not a focus transient.
  if (reconcileTimer) {
    clearTimeout(reconcileTimer)
  }
  reconcile()
}

/**
 * Releases the hook and stops watching focus.
 *
 * Called from the application's own shutdown, not from `will-quit`: the quit path ends in
 * `app.exit()`, which never emits it.
 */
export function disposeBlackoutShortcut(): void {
  if (reconcileTimer) {
    clearTimeout(reconcileTimer)
    reconcileTimer = null
  }
  app.removeListener('browser-window-focus', scheduleReconcile)
  app.removeListener('browser-window-blur', scheduleReconcile)
  app.removeListener('browser-window-created', scheduleReconcile)
  app.removeListener('window-all-closed', scheduleReconcile)

  if (registeredAccelerator !== null) {
    globalShortcut.unregister(registeredAccelerator)
    registeredAccelerator = null
  }
  onToggle = null
  key = DEFAULT_BLACKOUT_SHORTCUT_KEY
  scope = DEFAULT_BLACKOUT_SHORTCUT_SCOPE
  registerFailureLogged = false
}
