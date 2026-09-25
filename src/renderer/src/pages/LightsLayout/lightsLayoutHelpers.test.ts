import { describe, it, expect } from '@jest/globals'
import {
  ConfigStrobeType,
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
} from '../../../../photonics-dmx/types'
import type { DmxFixture, DmxLight, LightingConfiguration } from '../../../../photonics-dmx/types'
import { findSharedChannelNumbers } from '../../components/lightChannelDisplay'
import { rgbLight } from '../../../../photonics-dmx/tests/helpers/testFixtures'
import {
  LIGHT_LAYOUTS,
  createDmxLightInstance,
  lightingConfigsEqual,
  mapLightsToNewIdsForSave,
  buildMergedPrimaryLightsFromConfig,
  buildRigConfigForSave,
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
      frontLights: [{ ...minimalStrobe, strobeValues: { ...DEFAULT_STROBE_CHANNEL_VALUES } }],
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
    expect(dedicated.some((l) => l.group === 'strobe')).toBe(true)

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

  const masterOf = (light: DmxLight): number => light.channels.masterDimmer

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
    const moved = rgbLight({ channels: { masterDimmer: 100, red: 2, green: 3, blue: 103 } })
    expect(masterOf(place([moved], rgbTemplate))).toBe(111)
  })

  it('reports the address as capped when the universe has no room left', () => {
    const full = rgbLight({ channels: { masterDimmer: 1, red: 2, green: 3, blue: 512 } })
    const { light, addressCapped } = createDmxLightInstance('front', [full], [rgbTemplate])
    expect(addressCapped).toBe(true)
    expect(masterOf(light)).toBe(509)
  })

  it('leaves room for added channels when capping', () => {
    const full = rgbLight({ channels: { masterDimmer: 1, red: 2, green: 3, blue: 512 } })
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

describe('buildRigConfigForSave', () => {
  function light(id: string, group: string, isStrobeEnabled = false): DmxLight {
    return {
      id,
      position: 1,
      fixtureId: `t-${id}`,
      fixture: FixtureTypes.RGB,
      name: id,
      label: id,
      isStrobeEnabled,
      group,
      channels: { red: 1, green: 2, blue: 3, masterDimmer: 4 },
      universe: 0,
    }
  }

  const mixed = [
    light('front-plain', 'front'),
    light('front-strobe', 'front', true),
    light('back-strobe', 'back', true),
    light('dedicated', 'strobe', true),
  ]

  it('takes no strobe lights when strobe is off', () => {
    const config = buildRigConfigForSave(mixed, ConfigStrobeType.None, 3, 'front')

    expect(config.strobeLights).toEqual([])
  })

  it('takes every strobe capable primary when strobe follows the lights', () => {
    const config = buildRigConfigForSave(mixed, ConfigStrobeType.AllCapable, 3, 'front')

    expect(config.strobeLights.map((l) => l.fixtureId).sort()).toEqual([
      't-back-strobe',
      't-front-strobe',
    ])
  })

  it('leaves the dedicated group out when strobe follows the lights', () => {
    const config = buildRigConfigForSave(mixed, ConfigStrobeType.AllCapable, 3, 'front')

    expect(config.strobeLights.map((l) => l.fixtureId)).not.toContain('t-dedicated')
  })

  it('takes only the dedicated group when strobe is dedicated', () => {
    const config = buildRigConfigForSave(mixed, ConfigStrobeType.Dedicated, 3, 'front')

    expect(config.strobeLights.map((l) => l.fixtureId)).toEqual(['t-dedicated'])
  })

  it('splits the primaries by their group', () => {
    const config = buildRigConfigForSave(mixed, ConfigStrobeType.None, 3, 'front')

    expect(config.frontLights.map((l) => l.fixtureId)).toEqual(['t-front-plain', 't-front-strobe'])
    expect(config.backLights.map((l) => l.fixtureId)).toEqual(['t-back-strobe'])
  })

  it('gives a light listed in two groups one id across them', () => {
    const shared = light('shared', 'front', true)
    const config = buildRigConfigForSave([shared], ConfigStrobeType.AllCapable, 1, 'front')

    expect(config.frontLights[0]!.id).toBe(config.strobeLights[0]!.id)
    expect(config.frontLights[0]!.id).not.toBe('shared')
  })

  it('resolves the layout by id', () => {
    expect(buildRigConfigForSave([], ConfigStrobeType.None, 0, 'two-rows').lightLayout.id).toBe(
      'two-rows',
    )
  })

  it('falls back to the first layout when the id is unknown', () => {
    expect(buildRigConfigForSave([], ConfigStrobeType.None, 0, 'nope').lightLayout).toEqual(
      LIGHT_LAYOUTS[0],
    )
  })

  it('reads an unset light count as none', () => {
    expect(buildRigConfigForSave([], ConfigStrobeType.None, null, 'front').numLights).toBe(0)
  })
})
