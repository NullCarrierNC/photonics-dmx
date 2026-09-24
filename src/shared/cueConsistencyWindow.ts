/**
 * The window a cue called again after another cue reuses its last group in, in milliseconds.
 *
 * A held cue keeps its group whatever the window. 0 rolls a new group every time a cue comes back,
 * and the ceiling is five minutes.
 */

export const CUE_CONSISTENCY_WINDOW_MS_MIN = 0
export const CUE_CONSISTENCY_WINDOW_MS_MAX = 300000

/** Brings a typed or stored window into range. */
export function clampCueConsistencyWindowMs(ms: number): number {
  return Math.round(
    Math.max(CUE_CONSISTENCY_WINDOW_MS_MIN, Math.min(CUE_CONSISTENCY_WINDOW_MS_MAX, ms)),
  )
}
