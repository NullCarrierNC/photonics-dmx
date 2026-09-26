/**
 * One place that turns a tempo into a beat duration.
 *
 * The two domain extractors and the tempo node all read the conversion and the no-tempo value from
 * here, so two cues that both mean "one beat" last the same time on a song the game reports no
 * tempo for.
 */

/** Beat duration used when no tempo is available, i.e. 120 BPM. */
export const DEFAULT_BEAT_MS = 500

const MS_PER_MINUTE = 60000

/**
 * Milliseconds per beat at `bpm`, or `fallbackMs` when there is no usable tempo.
 *
 * Callers reach this with values off a wire or an audio analyser, so a non-finite or non-positive
 * tempo is treated as absent rather than propagated into timing maths.
 */
export function beatDurationMs(
  bpm: number | undefined,
  fallbackMs: number = DEFAULT_BEAT_MS,
): number {
  if (bpm === undefined || !Number.isFinite(bpm) || bpm <= 0) {
    return fallbackMs
  }
  const beatMs = Math.round(MS_PER_MINUTE / bpm)
  return beatMs > 0 ? beatMs : fallbackMs
}
