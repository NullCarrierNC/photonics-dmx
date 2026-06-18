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

  it('treats a light without strobeValues as unequal to one where it is materialized', () => {
    // The editor builds lights without `strobeValues`; the backend materializes that key on read
    // (template-sync). fast-deep-equal treats an absent key as different from a present one, so a
    // raw config never equals its normalized form — which is why the saved baseline must be taken
    // from the backend-canonical read rather than the editor's raw config.
    const base: LightingConfiguration = {
      numLights: 1,
      lightLayout: LIGHT_LAYOUTS[0]!,
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: [minimalStrobe],
      backLights: [],
      strobeLights: [],
    }
    const materialized: LightingConfiguration = {
      ...base,
      frontLights: [{ ...minimalStrobe, strobeValues: { value: 1 } } as unknown as DmxLight],
    }
    expect(lightingConfigsEqual(base, materialized)).toBe(false)
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
