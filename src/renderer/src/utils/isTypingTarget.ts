/**
 * Whether a key event landed somewhere the user is entering text.
 *
 * Used by the blackout shortcut when the bound key is one people type. A shortcut listening in the
 * capture phase beats the field it fires over, so without this a backtick would never reach an
 * expression, a cue name or the JSON editor.
 *
 * `closest` rather than a check on the event target itself, because a keydown inside CodeMirror
 * originates on a child span and has to walk up to the editable ancestor.
 */

/**
 * Everything that consumes a keystroke as input. `select` counts, because it takes a printable
 * keystroke as type-ahead.
 *
 * The three editable values are spelled out rather than matched as a bare `[contenteditable]`, so
 * `contenteditable="false"`, which CodeMirror sets on its widget decorations, is not read as a
 * place someone is typing.
 */
const TYPING_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'

export function isTypingTarget(target: EventTarget | null): boolean {
  // An event dispatched straight at the window or document has no element to ask.
  if (!(target instanceof Element)) {
    return false
  }
  return target.closest(TYPING_SELECTOR) !== null
}
