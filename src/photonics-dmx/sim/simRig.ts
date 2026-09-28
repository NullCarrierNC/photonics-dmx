import {
  ConfigStrobeType,
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  DmxLight,
  FixtureTypes,
  LightingConfiguration,
} from '../types'

/**
 * The simulator's rig: RGB fixtures in a front row, a back row and a strobe row, numbered on from
 * one row to the next, four channels each on universe 1. With `movingHeads`, the front and back
 * rows are RGB moving heads at the default head config, with pan and tilt after the four.
 */
export function buildSimRig(
  frontCount: number,
  backCount: number,
  strobeCount: number,
  movingHeads = false,
): LightingConfiguration {
  const width = movingHeads ? 6 : 4
  const makeLights = (count: number, group: 'front' | 'back' | 'strobe', start: number) =>
    Array.from({ length: count }, (_, index): DmxLight => {
      const position = start + index + 1
      const base = position * width - width + 1
      if (movingHeads && group !== 'strobe') {
        return {
          id: `${group}-${position}`,
          name: `${group} ${position}`,
          label: `${group} ${position}`,
          isStrobeEnabled: false,
          universe: 1,
          fixture: FixtureTypes.RGBMH,
          group,
          position,
          channels: {
            red: base,
            green: base + 1,
            blue: base + 2,
            masterDimmer: base + 3,
            pan: base + 4,
            tilt: base + 5,
          },
          config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG },
          fixtureId: `${group}-${position}`,
        }
      }
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
      }
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
