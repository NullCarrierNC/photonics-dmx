import { describe, expect, it } from '@jest/globals'
import { ConfigStrobeType, FixtureTypes } from '../types'
import type { DmxLight, LightingConfiguration, RgbLight, StrobeLight } from '../types'
import {
  getStrobeChannelLightsInConfig,
  hasHardwareStrobeChannel,
  isRgbFamilyWithStrobeChannel,
} from './strobeChannelRigInspection'

function makeRgbLight(overrides: Partial<RgbLight> = {}): RgbLight {
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
  }
}

function makeRgbWithStrobeChannel(overrides: Partial<RgbLight> = {}): DmxLight {
  return makeRgbLight({
    channels: {
      masterDimmer: 1,
      red: 2,
      green: 3,
      blue: 4,
      strobeChannel: 5,
    },
    ...overrides,
  })
}

function makeDedicatedStrobe(overrides: Partial<StrobeLight> = {}): StrobeLight {
  return {
    id: 's-1',
    fixtureId: 't-strobe',
    position: 1,
    fixture: FixtureTypes.STROBE,
    label: 'Strobe',
    name: 'Strobe',
    isStrobeEnabled: true,
    channels: { masterDimmer: 10, strobeChannel: 11 },
    ...overrides,
  }
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

describe('hasHardwareStrobeChannel', () => {
  it('is true for an RGB light whose strobe channel has an address', () => {
    expect(hasHardwareStrobeChannel(makeRgbWithStrobeChannel())).toBe(true)
  })

  it.each([
    ['unassigned', 0],
    ['past the universe', 513],
    ['fractional', 5.5],
  ])('is false for an RGB light whose strobe channel is %s', (_label, strobeChannel) => {
    const light = makeRgbLight({
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel },
    })

    expect(isRgbFamilyWithStrobeChannel(light)).toBe(true)
    expect(hasHardwareStrobeChannel(light)).toBe(false)
  })

  it('is false for a plain RGB light and for a dedicated STROBE fixture', () => {
    expect(hasHardwareStrobeChannel(makeRgbLight())).toBe(false)
    expect(hasHardwareStrobeChannel(makeDedicatedStrobe())).toBe(false)
  })
})

describe('getStrobeChannelLightsInConfig', () => {
  it('leaves out a light whose strobe channel has no address', () => {
    const config = makeConfig({
      frontLights: [
        makeRgbWithStrobeChannel({ id: 'f1' }),
        makeRgbLight({
          id: 'f2',
          channels: { masterDimmer: 6, red: 7, green: 8, blue: 9, strobeChannel: 0 },
        }),
      ],
    })

    expect(getStrobeChannelLightsInConfig(config).map((l) => l.id)).toEqual(['f1'])
  })

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
