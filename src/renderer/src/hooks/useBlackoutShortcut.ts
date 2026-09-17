import { useEffect, useState } from 'react'
import { useSetAtom } from 'jotai'
import { toggleBlackoutAtom } from '../state/masterOutput'
import { isEscapeClaimed } from '../utils/escClaims'
import { isTypingTarget } from '../utils/isTypingTarget'
import { getPrefs } from '../ipcApi'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  DEFAULT_BLACKOUT_SHORTCUT_KEY,
  DEFAULT_BLACKOUT_SHORTCUT_SCOPE,
  type BlackoutShortcutBinding,
  type BlackoutShortcutKey,
} from '../../../shared/blackoutShortcut'
import { createLogger } from '../../../shared/logger'

const log = createLogger('useBlackoutShortcut')

/**
 * Whether this press is the bound key.
 *
 * Escape matches on `key`, which is remap-independent: Caps Lock remapped to Escape, a common
 * setup, reports `key: 'Escape'` with `code: 'CapsLock'`, and matching the code would quietly lose
 * the panic key for those users.
 *
 * Backquote matches the physical position or the printed character, because neither alone covers
 * every layout. `code` binds the position, which is what muscle memory for a panic key really is,
 * but on a UK or ISO Mac keyboard that position is the section key and the one printing a backtick
 * reports `IntlBackslash`.
 */
function matchesKey(event: KeyboardEvent, key: BlackoutShortcutKey): boolean {
  if (key === 'escape') {
    return event.key === 'Escape'
  }
  return event.code === 'Backquote' || event.key === '`' || event.key === '~'
}

/**
 * Reads the blackout shortcut preferences for this window.
 *
 * Read over IPC rather than from `lightingPrefsAtom`, because only the main window fills that atom
 * and the shortcut has to work in the cue editor and audio preview windows too. Held as one pair so
 * a change to either half rebinds once.
 */
function useBlackoutShortcutBinding(): BlackoutShortcutBinding {
  const [binding, setBinding] = useState<BlackoutShortcutBinding>({
    key: DEFAULT_BLACKOUT_SHORTCUT_KEY,
    scope: DEFAULT_BLACKOUT_SHORTCUT_SCOPE,
  })

  useEffect(() => {
    let current = true
    void getPrefs()
      .then((prefs) => {
        if (!current) return
        setBinding({
          key: prefs.blackoutShortcutKey ?? DEFAULT_BLACKOUT_SHORTCUT_KEY,
          scope: prefs.blackoutShortcutScope ?? DEFAULT_BLACKOUT_SHORTCUT_SCOPE,
        })
      })
      .catch((err) => log.error('Failed to read the blackout shortcut preferences', err))
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    return registerIpcListener(RENDERER_RECEIVE.BLACKOUT_SHORTCUT_CHANGED, (next) => {
      setBinding(next)
    })
  }, [])

  return binding
}

/**
 * Binds a key to the master blackout across the whole window.
 *
 * Listens in the capture phase on `window`, which is the only position that runs before React's
 * delegated handlers at the root container. That is what lets it suppress React Flow's node
 * deselect, so one press means one thing. The cost is that it also outruns every other consumer of
 * the key, which is what the stand-asides below are for.
 *
 * Three of those stand-asides are specific to one key or the other, because the keys are not alike.
 * Nothing yields Escape to a typist, since no field here uses it, while a dialog and a drag in
 * flight both want Escape and neither has any interest in a backtick.
 *
 * `system-wide` behaves identically here. Its extra reach is an OS-level hook held by the main
 * process only while no Photonics window has focus, so whenever this listener could run at all, it
 * is the one that should.
 */
export function useBlackoutShortcut(): void {
  const { key, scope } = useBlackoutShortcutBinding()
  const toggleBlackout = useSetAtom(toggleBlackoutAtom)
  const enabled = scope !== 'disabled'

  useEffect(() => {
    if (!enabled) {
      return
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!matchesKey(event, key)) return
      // A chord is somebody else's shortcut. Cmd+backtick cycles windows on macOS, Ctrl+backtick
      // toggles a terminal panel by long habit, and AltGr+backtick is literally ctrl+alt on
      // Windows. Shift is deliberately not disqualifying: shift+backtick is a tilde on the same
      // physical key, and a panic press cannot depend on whether Shift happened to be down.
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // Held keys auto-repeat around 30 times a second, and every repeat would be a write and a
      // full DMX re-publish, strobing the rig off the panic key.
      if (event.repeat) return
      // A composition in progress is the user's text, not a blackout. This matters most for the
      // backquote, which is a dead key for grave accents on several layouts.
      if (event.isComposing) return
      // A typed key leaves the field alone. Escape is not typed anywhere in this app, so it keeps
      // working with the focus in a text box, which is where an operator's hands often are.
      if (key === 'backquote' && isTypingTarget(event.target)) return
      // An open dialog keeps Escape: it closes, and output is left alone. A dialog has no use for
      // a backquote, so it does not get to swallow it.
      if (key === 'escape' && document.querySelector('[aria-modal="true"]')) return
      // A drag in flight keeps Escape, so it can cancel rather than commit. With any other key
      // bound, Escape still reaches the drag and blackout stays available mid-rearrangement.
      if (key === 'escape' && isEscapeClaimed()) return

      event.preventDefault()
      event.stopPropagation()
      toggleBlackout()
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [enabled, key, toggleBlackout])
}
