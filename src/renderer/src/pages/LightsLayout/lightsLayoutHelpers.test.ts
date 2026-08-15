import { describe, it, expect } from '@jest/globals'
import { ConfigStrobeType, FixtureTypes } from '../../../../photonics-dmx/types'
import type { DmxFixture, DmxLight, LightingConfiguration } from '../../../../photonics-dmx/types'
import {
  LIGHT_LAYOUTS,
  createDmxLightInstance,
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

describe('createDmxLightInstance', () => {
  const rgbTemplate: DmxFixture = {
    id: 'tpl-rgb',
    position: 1,
    fixture: FixtureTypes.RGB,
    name: 'PAR',
    label: 'PAR',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
    universe: 0,
  }

  it('auto-addresses ten channels apart', () => {
    const light = createDmxLightInstance('front', 3, [rgbTemplate])
    const channels = light.channels as unknown as Record<string, number>
    expect(channels).toEqual({ masterDimmer: 31, red: 32, green: 33, blue: 34 })
  })

  it('caps auto-addressing at the last address the template fits in', () => {
    // 1 + 60*10 = 601, which would derive base channels past the universe
    const light = createDmxLightInstance('front', 60, [rgbTemplate])
    const channels = light.channels as unknown as Record<string, number>
    expect(channels).toEqual({ masterDimmer: 509, red: 510, green: 511, blue: 512 })
  })

  it('leaves room for added channels when capping', () => {
    const withExtra: DmxFixture = {
      ...rgbTemplate,
      extraChannels: [{ type: 'amber', channel: 9 }], // offset +8
    }
    const light = createDmxLightInstance('front', 60, [withExtra])
    const channels = light.channels as unknown as Record<string, number>
    expect(channels.masterDimmer).toBe(504)
    expect(light.extraChannels).toEqual([{ type: 'amber', channel: 512 }])
  })
})
