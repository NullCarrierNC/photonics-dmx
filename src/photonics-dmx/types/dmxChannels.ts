/**
 * DMX addressing primitives: what counts as an assigned channel, and how a derived one is clamped.
 */

/**
 * DMX-related types
 */
export type DmxChannel = {
  universe: number
  channel: number
  value: number // 0-255
}

export type BaseDmxFixture = {
  masterDimmer: number
}

/**
 * Highest addressable channel in a DMX universe. Channel numbers run 1-512, and 0 is the
 * "unassigned" sentinel every layer shares (see the `channel` field on an extra channel).
 *
 * Every layer that bounds a channel number - the mixer, the IPC validators, the template and rig
 * editors - reads it from here, so a fixture can be addressed to the same limit wherever it is
 * edited and the wire agrees with what the editor allowed.
 */
export const DMX_CHANNEL_MAX = 512

/** True for an assigned, addressable channel number. 0 (unassigned) is deliberately not valid. */
export function isValidDmxChannel(channel: number): boolean {
  return Number.isInteger(channel) && channel >= 1 && channel <= DMX_CHANNEL_MAX
}

/**
 * Normalises an offset-derived channel number to the persisted domain (0, or 1-512).
 *
 * Anything outside the universe collapses to 0 ("unassigned") and deliberately **not** to 512:
 * saturating at the bound would land two channels of one fixture on a single address and misroute
 * output, whereas 0 carries the "invalid until set" meaning the rest of the app already acts on.
 * The mixer excludes and reports the channel ({@link isValidDmxChannel}) and `myValidDmxLightsAtom`
 * keeps the fixture out of a rig until the user reassigns it. A visibly unusable fixture beats a
 * quietly wrong one.
 */
export function clampDerivedDmxChannel(channel: number): number {
  if (!Number.isFinite(channel)) return 0
  const rounded = Math.round(channel)
  return isValidDmxChannel(rounded) ? rounded : 0
}
