import { describe, expect, it } from '@jest/globals'
import { ConfigStrobeType, FixtureTypes } from '../types'
import type { DmxLight, LightingConfiguration } from '../types'
import {
  configHasStrobeChannelLights,
  getStrobeChannelLightsInConfig,
  isRgbFamilyWithStrobeChannel,
} from './strobeChannelRigInspection'

function makeRgbLight(overrides: Partial<DmxLight> = {}): DmxLight {
  return {
    id: 'l-1',
    fixtureId: 't-1',
    position: 1,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
    ...overrides,
  } as DmxLight
}

function makeRgbWithStrobeChannel(overrides: Partial<DmxLight> = {}): DmxLight {
  return makeRgbLight({
    channels: {
      masterDimmer: 1,
      red: 2,
      green: 3,
      blue: 4,
      strobeChannel: 5,
    } as DmxLight['channels'],
    ...overrides,
  })
}

function makeDedicatedStrobe(overrides: Partial<DmxLight> = {}): DmxLight {
  return {
    id: 's-1',
    fixtureId: 't-strobe',
    position: 1,
    fixture: FixtureTypes.STROBE,
    label: 'Strobe',
    name: 'Strobe',
    isStrobeEnabled: true,
    channels: { masterDimmer: 10, strobeChannel: 11 } as DmxLight['channels'],
    ...overrides,
  } as DmxLight
}

function makeConfig(overrides: Partial<LightingConfiguration> = {}): LightingConfiguration {
  return {
    numLights: 0,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights: [],
    backLights: [],
    strobeLights: [],
    ...overrides,
  }
}

describe('isRgbFamilyWithStrobeChannel', () => {
  it('is true for an RGB light with a strobeChannel set', () => {
    expect(isRgbFamilyWithStrobeChannel(makeRgbWithStrobeChannel())).toBe(true)
  })

  it('is false for a plain RGB light without a strobeChannel', () => {
    expect(isRgbFamilyWithStrobeChannel(makeRgbLight())).toBe(false)
  })

  it('is false for a dedicated STROBE fixture (separate device class)', () => {
    expect(isRgbFamilyWithStrobeChannel(makeDedicatedStrobe())).toBe(false)
  })
})

describe('getStrobeChannelLightsInConfig', () => {
  it('returns matching lights from frontLights and backLights', () => {
    const config = makeConfig({
      frontLights: [makeRgbWithStrobeChannel({ id: 'f1' })],
      backLights: [makeRgbWithStrobeChannel({ id: 'b1' }), makeRgbLight({ id: 'b2' })],
    })
    const out = getStrobeChannelLightsInConfig(config)
    expect(out.map((l) => l.id)).toEqual(['f1', 'b1'])
  })

  it('excludes dedicated STROBE fixtures even when they sit in the strobe array', () => {
    const config = makeConfig({
      strobeType: ConfigStrobeType.Dedicated,
      strobeLights: [makeDedicatedStrobe({ id: 'pure' })],
    })
    expect(getStrobeChannelLightsInConfig(config)).toEqual([])
  })

  it('includes Dedicated-mode strobeLights when they happen to be RGB+S (rare but valid)', () => {
    const config = makeConfig({
      strobeType: ConfigStrobeType.Dedicated,
      strobeLights: [makeRgbWithStrobeChannel({ id: 's1' })],
    })
    expect(getStrobeChannelLightsInConfig(config).map((l) => l.id)).toEqual(['s1'])
  })

  it('does not include strobeLights when strobeType is AllCapable (those rows are snapshots)', () => {
    const config = makeConfig({
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: [makeRgbWithStrobeChannel({ id: 'f1' })],
      strobeLights: [makeRgbWithStrobeChannel({ id: 'f1-snapshot' })],
    })
    // Only the canonical front-row entry is counted; the strobeLights snapshot is ignored.
    expect(getStrobeChannelLightsInConfig(config).map((l) => l.id)).toEqual(['f1'])
  })
})

describe('configHasStrobeChannelLights', () => {
  it('is false for an empty rig', () => {
    expect(configHasStrobeChannelLights(makeConfig())).toBe(false)
  })

  it('is true when at least one RGB+S light is present', () => {
    expect(
      configHasStrobeChannelLights(makeConfig({ frontLights: [makeRgbWithStrobeChannel()] })),
    ).toBe(true)
  })

  it('is false when only dedicated STROBE fixtures exist', () => {
    expect(
      configHasStrobeChannelLights(
        makeConfig({
          strobeType: ConfigStrobeType.Dedicated,
          strobeLights: [makeDedicatedStrobe()],
        }),
      ),
    ).toBe(false)
  })
})
