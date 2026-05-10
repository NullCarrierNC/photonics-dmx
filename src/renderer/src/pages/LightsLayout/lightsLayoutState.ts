import { FixtureTypes } from '../../../../photonics-dmx/types'
import type { DmxLight } from '../../../../photonics-dmx/types'

/**
 * Reassigns front vs back for non-strobe primary rows without mutating the input.
 */
export function reassignNonStrobeGroups(
  nonStrobeSorted: DmxLight[],
  frontCount: number,
  backCount: number,
): DmxLight[] {
  let f = frontCount
  let b = backCount
  return nonStrobeSorted.map((light, idx) => {
    let group: 'front' | 'back'
    if (f > 0) {
      group = 'front'
      f--
    } else if (b > 0) {
      group = 'back'
      b--
    } else {
      group = 'front'
    }
    return { ...light, group, position: idx + 1 }
  })
}

/**
 * In dedicated strobe mode, strobe group rows get STROBE fixture and flags, without mutating.
 */
export function mapDedicatedStrobeGroupRows(lights: DmxLight[]): DmxLight[] {
  return lights.map((light) => {
    const g = (light as DmxLight & { group?: string }).group
    return g === 'strobe'
      ? { ...light, fixture: FixtureTypes.STROBE, isStrobeEnabled: true }
      : light
  })
}
