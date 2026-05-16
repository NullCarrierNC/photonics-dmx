import { describe, expect, it } from '@jest/globals'
import {
  ConfigStrobeType,
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
} from '../types'
import type { DmxFixture, DmxLight, DmxRig, DmxRigsConfig } from '../types'
import {
  syncDmxLightWithTemplate,
  syncLightingConfigurationWithUserLights,
  syncRigsConfigWithUserLights,
} from './rigTemplateSync'

const baseRgbLight: DmxLight = {
  id: 'l-1',
  fixtureId: 'tpl-rgb',
  position: 1,
  fixture: FixtureTypes.RGB,
  label: 'PAR 1',
  name: 'PAR 1',
  isStrobeEnabled: false,
  group: 'front',
  universe: 1,
  mount: 'floor',
  channels: { masterDimmer: 11, red: 12, green: 13, blue: 14 },
}

const baseRgbTemplate: DmxFixture = {
  id: 'tpl-rgb',
  position: 0,
  fixture: FixtureTypes.RGB,
  label: 'PAR 1',
  name: 'PAR 1',
  isStrobeEnabled: false,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
}

describe('syncDmxLightWithTemplate', () => {
  it('returns the input unchanged when no template is found (orphaned light)', () => {
    const { light, changed } = syncDmxLightWithTemplate(baseRgbLight, undefined)
    expect(changed).toBe(false)
    expect(light).toBe(baseRgbLight)
  })

  it('returns same reference when rig already matches template', () => {
    const { light, changed } = syncDmxLightWithTemplate(baseRgbLight, baseRgbTemplate)
    expect(changed).toBe(false)
    expect(light).toBe(baseRgbLight)
  })

  it('adds a strobe channel using the template offset when the template now has one', () => {
    const template: DmxFixture = {
      ...baseRgbTemplate,
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
      strobeValues: { slow: 10, medium: 100, fast: 200, fastest: 250 },
    }
    const { light, changed } = syncDmxLightWithTemplate(baseRgbLight, template)
    expect(changed).toBe(true)
    // master dimmer was 11; template strobe offset = 5 − 1 = 4; expected = 11 + 4 = 15
    expect((light.channels as unknown as Record<string, number>).strobeChannel).toBe(15)
    // strobeValues materialized from template defaults
    expect(light.strobeValues).toEqual({ slow: 10, medium: 100, fast: 200, fastest: 250 })
    // per-light values preserved
    expect((light.channels as unknown as Record<string, number>).masterDimmer).toBe(11)
    expect((light.channels as unknown as Record<string, number>).red).toBe(12)
  })

  it('propagates a template channel-offset re-layout to existing rig lights (Fix 4)', () => {
    // Rig light persisted with offsets red=+1,green=+2,blue=+3 from master 11 → 12/13/14.
    const rigLight: DmxLight = {
      ...baseRgbLight,
      channels: { masterDimmer: 11, red: 12, green: 13, blue: 14 },
    }
    // Template re-wired: red is now +3, green +4, blue +5 from its master dimmer.
    const reLaidOutTemplate: DmxFixture = {
      ...baseRgbTemplate,
      channels: { masterDimmer: 1, red: 4, green: 5, blue: 6 },
    }
    const { light, changed } = syncDmxLightWithTemplate(rigLight, reLaidOutTemplate)
    expect(changed).toBe(true)
    const ch = light.channels as unknown as Record<string, number>
    // masterDimmer is rig-owned (DMX start address), unchanged.
    expect(ch.masterDimmer).toBe(11)
    // Every other channel re-derived from the template's new offsets: 11 + (templateCh - 1).
    expect(ch.red).toBe(14) // 11 + (4 - 1)
    expect(ch.green).toBe(15) // 11 + (5 - 1)
    expect(ch.blue).toBe(16) // 11 + (6 - 1)
  })

  it('removes a strobe channel and clears strobeValues when the template drops the channel', () => {
    const lightWithStrobe: DmxLight = {
      ...baseRgbLight,
      channels: {
        masterDimmer: 11,
        red: 12,
        green: 13,
        blue: 14,
        strobeChannel: 15,
      } as DmxLight['channels'],
      strobeValues: { slow: 30, medium: 90, fast: 180, fastest: 240 },
    }
    const { light, changed } = syncDmxLightWithTemplate(lightWithStrobe, baseRgbTemplate)
    expect(changed).toBe(true)
    expect((light.channels as unknown as Record<string, number>).strobeChannel).toBeUndefined()
    expect(light.strobeValues).toBeUndefined()
  })

  it('preserves a per-light strobeValues override; never overwrites with template defaults', () => {
    const template: DmxFixture = {
      ...baseRgbTemplate,
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
      strobeValues: { slow: 10, medium: 100, fast: 200, fastest: 250 },
    }
    const lightWithOverride: DmxLight = {
      ...baseRgbLight,
      channels: {
        masterDimmer: 11,
        red: 12,
        green: 13,
        blue: 14,
        strobeChannel: 15,
      } as DmxLight['channels'],
      strobeValues: { slow: 1, medium: 2, fast: 3, fastest: 4 },
    }
    const { light } = syncDmxLightWithTemplate(lightWithOverride, template)
    // per-light override preserved verbatim
    expect(light.strobeValues).toEqual({ slow: 1, medium: 2, fast: 3, fastest: 4 })
  })

  it('upgrades fixture type RGB → RGBW by adding the white channel from the template offset', () => {
    const rgbwTemplate: DmxFixture = {
      ...baseRgbTemplate,
      fixture: FixtureTypes.RGBW,
      label: 'RGBW PAR',
      name: 'RGBW PAR',
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, white: 5 },
    }
    const { light, changed } = syncDmxLightWithTemplate(baseRgbLight, rgbwTemplate)
    expect(changed).toBe(true)
    expect(light.fixture).toBe(FixtureTypes.RGBW)
    expect(light.label).toBe('RGBW PAR')
    expect(light.name).toBe('RGBW PAR')
    expect((light.channels as unknown as Record<string, number>).white).toBe(15) // 11 + (5 - 1)
  })

  it('preserves rig-owned fields: id, fixtureId, position, group, universe, mount, isStrobeEnabled, masterDimmer', () => {
    const rigLight: DmxLight = {
      ...baseRgbLight,
      isStrobeEnabled: true, // diverged from template (layout-level "Use as strobe")
      mount: 'ceiling',
    }
    const template: DmxFixture = {
      ...baseRgbTemplate,
      isStrobeEnabled: false,
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
    }
    const { light } = syncDmxLightWithTemplate(rigLight, template)
    expect(light.id).toBe(rigLight.id)
    expect(light.fixtureId).toBe(rigLight.fixtureId)
    expect(light.position).toBe(rigLight.position)
    expect(light.group).toBe(rigLight.group)
    expect(light.universe).toBe(rigLight.universe)
    expect(light.mount).toBe(rigLight.mount)
    expect(light.isStrobeEnabled).toBe(true) // rig-owned post-creation
    expect((light.channels as unknown as Record<string, number>).masterDimmer).toBe(11)
  })

  it('preserves rig-side moving-head calibration when both have a config', () => {
    const calibratedLight: DmxLight = {
      ...baseRgbLight,
      fixture: FixtureTypes.RGBMH,
      channels: {
        masterDimmer: 11,
        red: 12,
        green: 13,
        blue: 14,
        pan: 15,
        tilt: 16,
      } as DmxLight['channels'],
      config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG, panHome: 75, tiltHome: 25 },
    }
    const template: DmxFixture = {
      ...baseRgbTemplate,
      fixture: FixtureTypes.RGBMH,
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
      config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG },
    }
    const { light } = syncDmxLightWithTemplate(calibratedLight, template)
    expect(light.config?.panHome).toBe(75)
    expect(light.config?.tiltHome).toBe(25)
  })

  it('adopts template config defaults when rig has no config (e.g. fixture-type changed to MH)', () => {
    const rigLight: DmxLight = { ...baseRgbLight, config: undefined }
    const mhTemplate: DmxFixture = {
      ...baseRgbTemplate,
      fixture: FixtureTypes.RGBMH,
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
      config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG, panHome: 33 },
    }
    const { light, changed } = syncDmxLightWithTemplate(rigLight, mhTemplate)
    expect(changed).toBe(true)
    expect(light.config?.panHome).toBe(33)
  })

  it('drops stale rig config when the template no longer has one (e.g. MH → RGB)', () => {
    const rigLight: DmxLight = {
      ...baseRgbLight,
      config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG, panHome: 70 },
    }
    const { light, changed } = syncDmxLightWithTemplate(rigLight, baseRgbTemplate)
    expect(changed).toBe(true)
    expect(light.config).toBeUndefined()
  })

  it('uses DEFAULT_STROBE_CHANNEL_VALUES via the template when materializing fallback values', () => {
    // Template has strobeChannel but no explicit strobeValues — should not invent defaults on the
    // rig (publisher uses runtime DEFAULT_STROBE_CHANNEL_VALUES fallback). This documents the
    // boundary: sync materialises template strobeValues; it doesn't fabricate them.
    const template: DmxFixture = {
      ...baseRgbTemplate,
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
      // no strobeValues
    }
    const { light, changed } = syncDmxLightWithTemplate(baseRgbLight, template)
    expect(changed).toBe(true)
    expect(light.strobeValues).toBeUndefined()
    // Sanity: ensure the default constant is still the documented one
    expect(DEFAULT_STROBE_CHANNEL_VALUES).toEqual({
      slow: 64,
      medium: 128,
      fast: 192,
      fastest: 255,
    })
  })
})

describe('syncLightingConfigurationWithUserLights', () => {
  const template: DmxFixture = {
    ...baseRgbTemplate,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
    strobeValues: { slow: 10, medium: 100, fast: 200, fastest: 250 },
  }

  it('returns same reference when no light needs syncing', () => {
    const inSync: DmxLight = {
      ...baseRgbLight,
      channels: {
        masterDimmer: 11,
        red: 12,
        green: 13,
        blue: 14,
        strobeChannel: 15,
      } as DmxLight['channels'],
      strobeValues: { slow: 10, medium: 100, fast: 200, fastest: 250 },
    }
    const config = {
      numLights: 1,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.None,
      frontLights: [inSync],
      backLights: [],
      strobeLights: [],
    }
    const { config: next, changed } = syncLightingConfigurationWithUserLights(config, [template])
    expect(changed).toBe(false)
    expect(next).toBe(config)
  })

  it('syncs lights across all three arrays', () => {
    const stale: DmxLight = { ...baseRgbLight }
    const config = {
      numLights: 3,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: [{ ...stale, id: 'f' }],
      backLights: [{ ...stale, id: 'b' }],
      strobeLights: [{ ...stale, id: 's' }],
    }
    const { config: next, changed } = syncLightingConfigurationWithUserLights(config, [template])
    expect(changed).toBe(true)
    for (const arr of [next.frontLights, next.backLights, next.strobeLights]) {
      expect((arr[0]!.channels as unknown as Record<string, number>).strobeChannel).toBe(15)
      expect(arr[0]!.strobeValues).toEqual({ slow: 10, medium: 100, fast: 200, fastest: 250 })
    }
  })
})

describe('syncRigsConfigWithUserLights', () => {
  const template: DmxFixture = {
    ...baseRgbTemplate,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
    strobeValues: { slow: 10, medium: 100, fast: 200, fastest: 250 },
  }

  it('preserves rig identity (same reference) for rigs that did not need syncing', () => {
    const cleanRig: DmxRig = {
      id: 'rig-a',
      name: 'A',
      active: true,
      config: {
        numLights: 0,
        lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: [],
      },
    }
    const dirtyRig: DmxRig = {
      id: 'rig-b',
      name: 'B',
      active: true,
      config: {
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
        strobeType: ConfigStrobeType.AllCapable,
        frontLights: [baseRgbLight],
        backLights: [],
        strobeLights: [],
      },
    }
    const rigsConfig: DmxRigsConfig = { rigs: [cleanRig, dirtyRig], schemaVersion: 3 }
    const { config, changed } = syncRigsConfigWithUserLights(rigsConfig, [template])
    expect(changed).toBe(true)
    expect(config.rigs[0]).toBe(cleanRig)
    expect(config.rigs[1]).not.toBe(dirtyRig)
    expect(
      (config.rigs[1]!.config.frontLights[0]!.channels as unknown as Record<string, number>)
        .strobeChannel,
    ).toBe(15)
  })

  it('returns same reference when no rigs needed syncing', () => {
    const rigsConfig: DmxRigsConfig = { rigs: [], schemaVersion: 3 }
    const { config, changed } = syncRigsConfigWithUserLights(rigsConfig, [template])
    expect(changed).toBe(false)
    expect(config).toBe(rigsConfig)
  })
})
