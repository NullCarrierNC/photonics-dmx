/**
 * The window a lag compensation delay sits in, in milliseconds.
 *
 * A TV or an AV receiver spends tens to hundreds of milliseconds on picture and sound before either
 * reaches the operator, so the rig runs ahead of both. `DmxPublisher` holds wire output this long
 * to put them back together, taking the value from `videoLagCompensationMs` or
 * `audioLagCompensationMs` according to what is driving the rig.
 *
 * The ceiling covers the slowest chains anyone reasonably plays on. 0 is off, and is the default.
 */

export const LAG_COMPENSATION_MS_MIN = 0
export const LAG_COMPENSATION_MS_MAX = 500
export const LAG_COMPENSATION_MS_DEFAULT = 0

/** Brings a typed or stored delay into the window. */
export function clampLagCompensationMs(ms: number): number {
  return Math.round(Math.max(LAG_COMPENSATION_MS_MIN, Math.min(LAG_COMPENSATION_MS_MAX, ms)))
}

/**
 * Reads a delay from an untyped source, a stored preferences file above all. Anything that is not a
 * usable number reads as off: lights that run late for no visible reason are harder to diagnose
 * than lights that do not.
 */
export function normalizeLagCompensationMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return LAG_COMPENSATION_MS_DEFAULT
  }
  return clampLagCompensationMs(value)
}
