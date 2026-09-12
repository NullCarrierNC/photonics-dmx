/**
 * The universe numbers sACN defines. E1.31 reserves 0, and the sacn library throws when a sender
 * is built on it, so the field, the enable payload and the stored block all hold to this range.
 */

export const SACN_UNIVERSE_MIN = 1
export const SACN_UNIVERSE_MAX = 63999

/** Brings a stored or typed universe into range. */
export function clampSacnUniverse(universe: number): number {
  return Math.max(SACN_UNIVERSE_MIN, Math.min(SACN_UNIVERSE_MAX, Math.round(universe)))
}
