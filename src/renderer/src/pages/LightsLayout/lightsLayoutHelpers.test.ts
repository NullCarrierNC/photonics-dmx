import { describe, it, expect } from '@jest/globals'
import { ConfigStrobeType, FixtureTypes } from '../../../../photonics-dmx/types'
import type { DmxFixture, DmxLight, LightingConfiguration } from '../../../../photonics-dmx/types'
import { findSharedChannelNumbers } from '../../components/lightChannelDisplay'
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

  /** A template occupying 14 channels: masterDimmer 1 plus base 2-4 plus an extra at 14. */
  const wideTemplate: DmxFixture = {
    ...rgbTemplate,
    id: 'tpl-wide',
    extraChannels: [{ type: 'amber', channel: 14 }],
  }

  const place = (existing: DmxLight[], template: DmxFixture): DmxLight => {
    const { light } = createDmxLightInstance('front', existing, [template])
    return light
  }

  const masterOf = (light: DmxLight): number =>
    (light.channels as unknown as Record<string, number>).masterDimmer

  it('addresses the first light at 1', () => {
    expect(masterOf(place([], rgbTemplate))).toBe(1)
  })

  it('steps a narrow fixture in tens so addressing stays readable', () => {
    const one = place([], rgbTemplate)
    const two = place([one], rgbTemplate)
    const three = place([one, two], rgbTemplate)
    expect([masterOf(one), masterOf(two), masterOf(three)]).toEqual([1, 11, 21])
  })

  it('clears a fixture wider than the step instead of landing inside it', () => {
    const one = place([], wideTemplate)
    expect(one.extraChannels).toEqual([{ type: 'amber', channel: 14 }])
    // The next light must clear channel 14, not take 11 and collide with the amber extra.
    expect(masterOf(place([one], wideTemplate))).toBe(21)
  })

  it('packs after a hand-edited address rather than under it', () => {
    const moved = place([], rgbTemplate)
    ;(moved.channels as unknown as Record<string, number>).masterDimmer = 100
    ;(moved.channels as unknown as Record<string, number>).blue = 103
    expect(masterOf(place([moved], rgbTemplate))).toBe(111)
  })

  it('reports the address as capped when the universe has no room left', () => {
    const full = place([], rgbTemplate)
    ;(full.channels as unknown as Record<string, number>).blue = 512
    const { light, addressCapped } = createDmxLightInstance('front', [full], [rgbTemplate])
    expect(addressCapped).toBe(true)
    expect(masterOf(light)).toBe(509)
  })

  it('leaves room for added channels when capping', () => {
    const full = place([], rgbTemplate)
    ;(full.channels as unknown as Record<string, number>).blue = 512
    const { light, addressCapped } = createDmxLightInstance('front', [full], [wideTemplate])
    expect(addressCapped).toBe(true)
    // Widest offset is +13, so the master must sit at 512 - 13.
    expect(masterOf(light)).toBe(499)
    expect(light.extraChannels).toEqual([{ type: 'amber', channel: 512 }])
  })

  it('bootstraps an initial sequence from one wide template without overlapping channels', () => {
    const bootstrap = (count: number): DmxLight[] => {
      const placed: DmxLight[] = []
      for (let i = 0; i < count; i++) {
        const { light } = createDmxLightInstance('front', placed, [wideTemplate])
        placed.push(light)
      }
      return placed
    }

    const lights = bootstrap(3)
    expect(lights.map(masterOf)).toEqual([1, 21, 41])
    expect(findSharedChannelNumbers(lights)).toEqual([])
  })
})
