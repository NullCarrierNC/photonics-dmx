import { ConfigStrobeType, DmxLight, FixtureTypes, LightingConfiguration } from '../types'

/**
 * The simulator's rig: RGB fixtures in a front row, a back row and a strobe row, numbered on from
 * one row to the next, four channels each on universe 1.
 */
export function buildSimRig(
  frontCount: number,
  backCount: number,
  strobeCount: number,
): LightingConfiguration {
  const makeLights = (count: number, group: 'front' | 'back' | 'strobe', start: number) =>
    Array.from({ length: count }, (_, index) => {
      const position = start + index + 1
      const base = position * 4 - 3
      return {
        id: `${group}-${position}`,
        name: `${group} ${position}`,
        label: `${group} ${position}`,
        isStrobeEnabled: group === 'strobe',
        universe: 1,
        fixture: FixtureTypes.RGB,
        group,
        position,
        channels: {
          red: base,
          green: base + 1,
          blue: base + 2,
          masterDimmer: base + 3,
        },
        fixtureId: `${group}-${position}`,
      } as DmxLight
    })

  const frontLights = makeLights(frontCount, 'front', 0)
  const backLights = makeLights(backCount, 'back', frontCount)
  const strobeLights = makeLights(strobeCount, 'strobe', frontCount + backCount)

  return {
    numLights: frontCount + backCount + strobeCount,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights,
    backLights,
    strobeLights,
  }
}
