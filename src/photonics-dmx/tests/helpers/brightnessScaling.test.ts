/**
 * Brightness scaling helpers: the storable-value rules, the per-fixture channel map the publisher
 * writes through, and the preview's whole-snapshot view.
 */
import { describe, expect, it } from '@jest/globals'
import {
  applyBrightnessScalingToDmxValues,
  buildBrightnessScaleMap,
  configHasBrightnessScaling,
  fixtureHasBrightnessScaling,
  isStorableBrightnessScale,
  isValidBrightnessScalePercent,
  scaleDmxValueByPercent,
} from '../../helpers/brightnessScaling'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxFixture,
  type DmxLight,
  type LightingConfiguration,
} from '../../types'

function fixture(overrides: Partial<DmxFixture> = {}): DmxFixture {
  return {
    id: 'f1',
    position: 1,
    fixture: FixtureTypes.RGB,
    label: 'RGB',
    name: 'RGB',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
    ...overrides,
  }
}

function config(lights: DmxFixture[]): LightingConfiguration {
  return {
    numLights: lights.length,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.AllCapable,
    frontLights: lights as DmxLight[],
    backLights: [],
    strobeLights: [],
  }
}

describe('scaleDmxValueByPercent', () => {
  it('rounds to the nearest byte', () => {
    expect(scaleDmxValueByPercent(255, 80)).toBe(204)
    expect(scaleDmxValueByPercent(255, 33)).toBe(84)
    expect(scaleDmxValueByPercent(1, 50)).toBe(1)
  })

  it('passes a full scale through and zeroes a zero scale', () => {
    expect(scaleDmxValueByPercent(173, 100)).toBe(173)
    expect(scaleDmxValueByPercent(255, 0)).toBe(0)
  })
})

describe('percent validity', () => {
  it.each([0, 1, 50, 100])('accepts %s as a valid percent', (percent) => {
    expect(isValidBrightnessScalePercent(percent)).toBe(true)
  })

  it.each([-1, 101, 1.5, NaN, '50', null, undefined])('rejects %s', (percent) => {
    expect(isValidBrightnessScalePercent(percent)).toBe(false)
  })

  it('treats the 100% default as not worth storing', () => {
    expect(isStorableBrightnessScale(100)).toBe(false)
    expect(isStorableBrightnessScale(99)).toBe(true)
    expect(isStorableBrightnessScale(0)).toBe(true)
  })
})

describe('buildBrightnessScaleMap', () => {
  it('returns null for an unscaled fixture', () => {
    expect(buildBrightnessScaleMap(fixture())).toBeNull()
    expect(fixtureHasBrightnessScaling(fixture())).toBe(false)
  })

  it('maps base colour channels by DMX address', () => {
    const map = buildBrightnessScaleMap(fixture({ brightnessScaling: { green: 80, blue: 50 } }))!
    expect([...map]).toEqual([
      [3, 80],
      [4, 50],
    ])
  })

  it('ignores defaults and out-of-domain percents', () => {
    const map = buildBrightnessScaleMap(
      fixture({ brightnessScaling: { red: 100, green: 101, blue: 60 } }),
    )!
    expect([...map]).toEqual([[4, 60]])
  })

  it('skips unassigned channel numbers', () => {
    const scaled = fixture({
      channels: { masterDimmer: 1, red: 0, green: 3, blue: 4 },
      brightnessScaling: { red: 50 },
    })
    expect(buildBrightnessScaleMap(scaled)).toBeNull()
  })

  it('includes colour extras and excludes fixed ones', () => {
    const map = buildBrightnessScaleMap(
      fixture({
        extraChannels: [
          { type: 'white', channel: 5, scale: 40 },
          { type: 'fixed', channel: 6, value: 200, scale: 10 },
        ],
      }),
    )!
    expect([...map]).toEqual([[5, 40]])
  })

  it('lets the later row win when two channels share an address', () => {
    const map = buildBrightnessScaleMap(
      fixture({
        brightnessScaling: { red: 80 },
        extraChannels: [{ type: 'amber', channel: 2, scale: 30 }],
      }),
    )!
    expect(map.get(2)).toBe(30)
  })
})

describe('configHasBrightnessScaling', () => {
  it('is false for a rig where nothing is scaled', () => {
    expect(configHasBrightnessScaling(config([fixture(), fixture({ id: 'f2' })]))).toBe(false)
  })

  it('is true when any light is scaled', () => {
    expect(
      configHasBrightnessScaling(
        config([fixture(), fixture({ id: 'f2', brightnessScaling: { blue: 90 } })]),
      ),
    ).toBe(true)
  })
})

describe('applyBrightnessScalingToDmxValues', () => {
  it('scales the scaled channels and passes everything else through', () => {
    const rig = config([
      fixture({ brightnessScaling: { green: 50 } }),
      fixture({ id: 'f2', channels: { masterDimmer: 10, red: 11, green: 12, blue: 13 } }),
    ])
    const values = { 1: 255, 2: 200, 3: 200, 4: 200, 11: 120 }

    expect(applyBrightnessScalingToDmxValues(rig, values)).toEqual({
      1: 255,
      2: 200,
      3: 100,
      4: 200,
      11: 120,
    })
  })

  it('does not mutate the input snapshot', () => {
    const rig = config([fixture({ brightnessScaling: { red: 50 } })])
    const values = { 2: 200 }
    applyBrightnessScalingToDmxValues(rig, values)
    expect(values).toEqual({ 2: 200 })
  })

  it('leaves a scaled channel absent when the frame never wrote it', () => {
    const rig = config([fixture({ brightnessScaling: { red: 50 } })])
    expect(applyBrightnessScalingToDmxValues(rig, { 3: 10 })).toEqual({ 3: 10 })
  })

  it('uses the last sorted fixture owner when two scaled lights share an address', () => {
    const rig = config([
      fixture({
        id: 'light-a',
        brightnessScaling: { green: 80 },
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
      }),
      fixture({
        id: 'light-b',
        channels: { masterDimmer: 10, red: 11, green: 3, blue: 13 },
        extraChannels: [{ type: 'amber', channel: 3, scale: 50 }],
      }),
    ])

    expect(applyBrightnessScalingToDmxValues(rig, { 3: 200 })).toEqual({ 3: 100 })
  })

  it('leaves a shared address unscaled when the last sorted owner is not scaled', () => {
    const rig = config([
      fixture({
        id: 'light-a',
        brightnessScaling: { green: 80 },
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
      }),
      fixture({
        id: 'light-b',
        channels: { masterDimmer: 10, red: 11, green: 3, blue: 13 },
      }),
    ])

    expect(applyBrightnessScalingToDmxValues(rig, { 3: 200 })).toEqual({ 3: 200 })
  })
})
