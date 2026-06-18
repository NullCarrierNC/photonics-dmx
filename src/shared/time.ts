import { performance } from 'perf_hooks'

/**
 * Monotonic clock for all interval/duration math (throttles, cooldowns, consistency windows,
 * "time since" calculations, cue start times).
 *
 * Returns a process-relative millisecond timestamp from `performance.now()`. Unlike `Date.now()`
 * it is monotonic: it never jumps backwards or sideways when the wall clock is adjusted (NTP
 * step/slew, manual change, DST), so durations derived from it stay correct over long-running
 * shows.
 *
 * Convention:
 * - Use this for any "how long has it been" / "is enough time elapsed" comparison.
 * - NEVER compare these values against `Date.now()` values — they are different frames of
 *   reference (process origin vs Unix epoch).
 * - Keep `Date.now()` only for true wall-clock concerns: user-facing timestamps, persisted
 *   metadata (e.g. file `updatedAt`), renderer-bound event payloads, and ID entropy.
 *
 * `performance.now()` is read dynamically (not captured at module load) so that the headless
 * cue simulator's `VirtualTime`, which patches `perf_hooks` performance in place, advances it
 * deterministically alongside `setTimeout`/`Date`.
 */
export function monotonicNowMs(): number {
  return performance.now()
}
