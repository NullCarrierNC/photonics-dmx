import type { DmxLight, LightingConfiguration } from '../types'

/**
 * Per-rig mirror flags. Both default to false (absent). Composing both = 180° rotation.
 *  - `horiz`: mirror left/right — reverse light order within each row (front, back, strobe).
 *  - `vert`: mirror front/back — swap the front and back rows. Strobe is untouched.
 */
export interface RigMirror {
  horiz?: boolean
  vert?: boolean
}

/**
 * Returns a new `LightingConfiguration` with the requested mirror transform applied:
 *  - `horiz` reverses position values within each of `frontLights`, `backLights`,
 *    `strobeLights` independently, using rank-based reversal so non-contiguous position values
 *    (e.g. `[1, 2, 5, 8]` → `[8, 5, 2, 1]`) round-trip correctly. Even/odd parity flips with
 *    the new positions, which is the intended behaviour for a mirrored rig.
 *  - `vert` swaps the `frontLights` and `backLights` array references. `strobeLights` is left
 *    alone (strobe is a side-channel, not part of the front/back semantic).
 *
 * Returns the input reference unchanged when both flags are false — callers can use
 * reference identity to short-circuit work.
 *
 * The input config is never mutated; each transformed light is shallow-cloned before its
 * `position` is reassigned.
 */
export function applyMirrorToConfig(
  config: LightingConfiguration,
  mirror: RigMirror,
): LightingConfiguration {
  const horiz = mirror.horiz === true
  const vert = mirror.vert === true
  if (!horiz && !vert) return config

  const front = horiz ? mirrorPositionsInRow(config.frontLights) : config.frontLights
  const back = horiz ? mirrorPositionsInRow(config.backLights) : config.backLights
  const strobe = horiz ? mirrorPositionsInRow(config.strobeLights) : config.strobeLights

  return {
    ...config,
    frontLights: vert ? back : front,
    backLights: vert ? front : back,
    strobeLights: strobe,
  }
}

/**
 * Rank-based reversal of `position` within a single row. The original array order is
 * preserved (callers like `DmxLightManager.initializeLights` re-sort by position anyway),
 * only the position values are reassigned to their reversed-rank counterparts.
 */
function mirrorPositionsInRow(lights: DmxLight[]): DmxLight[] {
  if (lights.length === 0) return lights
  const sortedPositions = lights
    .map((l) => l.position)
    .slice()
    .sort((a, b) => a - b)
  return lights.map((light) => {
    const rank = sortedPositions.indexOf(light.position)
    const mirroredPosition = sortedPositions[sortedPositions.length - 1 - rank]!
    return { ...light, position: mirroredPosition }
  })
}
