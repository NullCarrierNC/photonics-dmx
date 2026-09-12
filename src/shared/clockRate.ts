/**
 * The window the engine renders effects in, in milliseconds between frames.
 *
 * A slower clock costs less CPU and renders less. An effect that changes state faster than the
 * clock ticks cannot be shown, so the ceiling keeps the setting inside what the engine can render
 * rather than offering rates that turn animation into a held value.
 */

export const CLOCK_RATE_MS_MIN = 1
export const CLOCK_RATE_MS_MAX = 50
export const CLOCK_RATE_MS_DEFAULT = 10

/** Brings a stored or typed rate into the window. */
export function clampClockRateMs(rate: number): number {
  return Math.round(Math.max(CLOCK_RATE_MS_MIN, Math.min(CLOCK_RATE_MS_MAX, rate)))
}
