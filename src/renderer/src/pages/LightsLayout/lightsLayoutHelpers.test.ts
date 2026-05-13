import { describe, it, expect } from '@jest/globals'
import { ConfigStrobeType, FixtureTypes } from '../../../../photonics-dmx/types'
import type { DmxLight, LightingConfiguration } from '../../../../photonics-dmx/types'
import {
  LIGHT_LAYOUTS,
  lightingConfigsEqual,
  mapLightsToNewIdsForSave,
  buildMergedPrimaryLightsFromConfig,
} from './lightsLayoutHelpers'

describe('mapLightsToNewIdsForSave', () => {
  it('reuses one new id when the same logical light is listed twice', () => {
    const shared: DmxLight = {
      id: 'orig',
      position: 1,
      fixtureId: 'f1',
      fixture: FixtureTypes.RGB,
      name: 'a',
      label: 'a',
      isStrobeEnabled: false,
      channels: { red: 1, green: 2, blue: 3, masterDimmer: 4 },
      universe: 0,
    }
    const idMap: Record<string, string> = {}
    const a = mapLightsToNewIdsForSave([shared], idMap)
    const b = mapLightsToNewIdsForSave([shared], idMap)
    expect(a[0]!.id).toBe(b[0]!.id)
    expect(a[0]!.id).not.toBe('orig')
  })
})

describe('lightingConfigsEqual', () => {
  it('returns true for equivalent configs and false when a field changes', () => {
    const base: LightingConfiguration = {
      numLights: 2,
      lightLayout: LIGHT_LAYOUTS[0]!,
      strobeType: ConfigStrobeType.None,
      frontLights: [],
      backLights: [],
      strobeLights: [],
    }
    const copy: LightingConfiguration = { ...base, frontLights: [] }
    expect(lightingConfigsEqual(base, copy)).toBe(true)
    expect(lightingConfigsEqual(base, { ...base, strobeType: ConfigStrobeType.Dedicated })).toBe(
      false,
    )
  })
})

const minimalStrobe: DmxLight = {
  id: 's1',
  position: 1,
  fixtureId: 'f1',
  fixture: FixtureTypes.STROBE,
  name: 's',
  label: 's',
  isStrobeEnabled: true,
  channels: { masterDimmer: 1, strobeChannel: 1 },
  universe: 0,
}

describe('buildMergedPrimaryLightsFromConfig', () => {
  it('includes dedicated strobe rows only in Dedicated mode', () => {
    const dedicated = buildMergedPrimaryLightsFromConfig({
      strobeType: ConfigStrobeType.Dedicated,
      frontLights: [],
      backLights: [],
      strobeLights: [minimalStrobe],
    })
    expect(dedicated.some((l) => (l as DmxLight & { group?: string }).group === 'strobe')).toBe(
      true,
    )

    const allCap = buildMergedPrimaryLightsFromConfig({
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: [],
      backLights: [],
      strobeLights: [minimalStrobe],
    })
    expect(allCap).toHaveLength(0)
  })
})
