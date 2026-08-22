import type { DmxFixture } from '../../../photonics-dmx/types'

/** A fixture's base channels plus its added ones: every address its preview reads. */
export function fixtureChannelNumbers(fixture: DmxFixture): number[] {
  const base = Object.values(fixture.channels) as number[]
  const extras = (fixture.extraChannels ?? []).map((ec) => ec.channel)
  return [...base, ...extras]
}

/**
 * True when a fixture reads the same values out of both buffers. The publisher sends a fresh buffer
 * object every frame, so the preview memoizes on this rather than on buffer identity.
 */
export function fixtureDmxValuesEqual(
  fixture: DmxFixture,
  a: Record<number, number>,
  b: Record<number, number>,
): boolean {
  if (a === b) return true
  for (const channel of fixtureChannelNumbers(fixture)) {
    if ((a[channel] ?? 0) !== (b[channel] ?? 0)) return false
  }
  return true
}
