/**
 * The keyboard shortcut for the master blackout: which key, and how far it reaches.
 *
 * `focused` binds inside Photonics only, so it works from any of the app's windows while one of
 * them has focus. `system-wide` additionally registers the key with the OS while the app is in the
 * background, which takes it away from every other application for as long as it is armed.
 *
 * The OS hook is deliberately dropped whenever a Photonics window takes focus, handing back to the
 * in-app listener. That is what keeps Escape closing dialogs while the app is actually in use.
 *
 * The two keys behave differently on purpose. Escape is not a character anyone types, so it fires
 * everywhere and stands aside only for the things that want Escape itself. A backtick is typed, so
 * it stands aside while the focus is in a field and keeps its reach everywhere else.
 */

export const BLACKOUT_SHORTCUT_KEYS = ['escape', 'backquote'] as const

export type BlackoutShortcutKey = (typeof BLACKOUT_SHORTCUT_KEYS)[number]

export const DEFAULT_BLACKOUT_SHORTCUT_KEY: BlackoutShortcutKey = 'escape'

export const BLACKOUT_SHORTCUT_SCOPES = ['disabled', 'focused', 'system-wide'] as const

export type BlackoutShortcutScope = (typeof BLACKOUT_SHORTCUT_SCOPES)[number]

export const DEFAULT_BLACKOUT_SHORTCUT_SCOPE: BlackoutShortcutScope = 'focused'

/** Always resolved as a pair, so a window is never left applying one half of a change. */
export interface BlackoutShortcutBinding {
  key: BlackoutShortcutKey
  scope: BlackoutShortcutScope
}

export function isBlackoutShortcutKey(value: unknown): value is BlackoutShortcutKey {
  return typeof value === 'string' && (BLACKOUT_SHORTCUT_KEYS as readonly string[]).includes(value)
}

export function isBlackoutShortcutScope(value: unknown): value is BlackoutShortcutScope {
  return (
    typeof value === 'string' && (BLACKOUT_SHORTCUT_SCOPES as readonly string[]).includes(value)
  )
}
