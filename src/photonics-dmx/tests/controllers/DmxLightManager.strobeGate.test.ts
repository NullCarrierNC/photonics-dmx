/**
 * isStrobeEnabled must gate ALL strobe output. The 'strobe' light group resolved by
 * DmxLightManager (which the opacity-flash strobe cues target) must exclude any light that is
 * not strobe-enabled, even if the layout placed it in the strobe array.
 */
import { describe, expect, it } from '@jest/globals'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ConfigStrobeType, FixtureTypes } from '../../types'
import type { DmxLight, LightingConfiguration } from '../../types'

function strobeRow(id: string, isStrobeEnabled: boolean, position: number): DmxLight {
  return {
    id,
    fixtureId: 'tpl-1',
    position,
    fixture: FixtureTypes.RGB,
    label: id,
    name: id,
    isStrobeEnabled,
    group: 'strobe',
    universe: 1,
    mount: 'floor',
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
  }
}

function makeConfig(strobeLights: DmxLight[]): LightingConfiguration {
  return {
    numLights: strobeLights.length,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.Dedicated,
    frontLights: [],
    backLights: [],
    strobeLights,
  }
}

describe('DmxLightManager strobe group gating', () => {
  it("excludes lights that aren't strobe-enabled from the 'strobe' group", () => {
    const mgr = new DmxLightManager(
      makeConfig([
        strobeRow('on-1', true, 1),
        strobeRow('off-1', false, 2),
        strobeRow('on-2', true, 3),
      ]),
    )
    const ids = mgr.getLightsInGroup('strobe').map((l) => l.id)
    expect(ids).toEqual(['on-1', 'on-2'])
  })

  it("returns an empty 'strobe' group when no strobe-array light is enabled", () => {
    const mgr = new DmxLightManager(makeConfig([strobeRow('off-1', false, 1)]))
    expect(mgr.getLightsInGroup('strobe')).toEqual([])
  })

  it('still excludes null-id lights', () => {
    const withNull = { ...strobeRow('x', true, 1), id: null } as unknown as DmxLight
    const mgr = new DmxLightManager(makeConfig([withNull, strobeRow('on-1', true, 2)]))
    expect(mgr.getLightsInGroup('strobe').map((l) => l.id)).toEqual(['on-1'])
  })
})
