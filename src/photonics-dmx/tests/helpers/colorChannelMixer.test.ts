/**
 * Colour channel mixer tests.
 *
 * The mixer decomposes the engine's internal RGB into a fixture's declared extra colour channels
 * (white / warm+cool white / amber / orange / lime / uv), duplicate red/green/blue banks, and
 * pinned "fixed" channels, using substitution (energy moves out of RGB into the emitters). These
 * tests pin the worked vectors used to design it, the reconstruction/bounds invariants, and the
 * "no extras → no plan → legacy path" contract that keeps plain fixtures bit-for-bit unchanged.
 */
import { describe, expect, it } from '@jest/globals'
import {
  applyChannelMixPlan,
  buildChannelMixPlan,
  EMITTER_PRIMARIES,
} from '../../helpers/colorChannelMixer'
import {
  FixtureTypes,
  type DmxFixture,
  type ExtraChannel,
  type ExtraChannelType,
  type MixableChannelType,
} from '../../types'

function makeFixture(
  fixture: FixtureTypes,
  channels: Record<string, number>,
  extraChannels?: ExtraChannel[],
): DmxFixture {
  return {
    id: 'tpl',
    position: 0,
    fixture,
    label: 'L',
    name: 'L',
    isStrobeEnabled: false,
    channels: channels as unknown as DmxFixture['channels'],
    ...(extraChannels ? { extraChannels } : {}),
  }
}

function extra(type: ExtraChannelType, channel: number, value?: number): ExtraChannel {
  return value === undefined ? { type, channel } : { type, channel, value }
}

/** Runs the mixer over a fixture and returns the channel→value map produced by applyChannelMixPlan. */
function mix(fixture: DmxFixture, r: number, g: number, b: number): Record<number, number> {
  const plan = buildChannelMixPlan(fixture)
  const out: Record<number, number> = {}
  if (plan) applyChannelMixPlan(plan, r, g, b, (ch, v) => (out[ch] = v))
  return out
}

const RGB_CHANNELS = { masterDimmer: 1, red: 2, green: 3, blue: 4 }
const RGBW_CHANNELS = { masterDimmer: 1, red: 2, green: 3, blue: 4, white: 5 }

describe('buildChannelMixPlan — when a plan is needed', () => {
  it('returns null for a plain RGB fixture (legacy path, bit-for-bit)', () => {
    expect(buildChannelMixPlan(makeFixture(FixtureTypes.RGB, RGB_CHANNELS))).toBeNull()
  })

  it('returns null for an RGB fixture that only has a hardware strobe channel', () => {
    const f = makeFixture(FixtureTypes.RGB, { ...RGB_CHANNELS, strobeChannel: 5 })
    expect(buildChannelMixPlan(f)).toBeNull()
  })

  it('returns null for an RGB moving head (pan/tilt are not colour channels)', () => {
    const f = makeFixture(FixtureTypes.RGBMH, { ...RGB_CHANNELS, pan: 5, tilt: 6 })
    expect(buildChannelMixPlan(f)).toBeNull()
  })

  it('returns null for a dedicated strobe fixture with no extras', () => {
    const f = makeFixture(FixtureTypes.STROBE, { masterDimmer: 1, strobeChannel: 2 })
    expect(buildChannelMixPlan(f)).toBeNull()
  })

  it('returns a plan for a bare RGBW fixture (drives the built-in white channel)', () => {
    const plan = buildChannelMixPlan(makeFixture(FixtureTypes.RGBW, RGBW_CHANNELS))
    expect(plan).not.toBeNull()
    expect(plan!.stages.some((s) => s.channels.includes(5))).toBe(true)
  })

  it('returns null when a template only has unassigned (channel 0) extras', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('white', 0), extra('amber', 0)])
    expect(buildChannelMixPlan(f)).toBeNull()
  })
})

describe('applyChannelMixPlan — worked vectors', () => {
  it('1: RGBW (255,191,64) → white=64, red=191, green=127, blue=0', () => {
    const out = mix(makeFixture(FixtureTypes.RGBW, RGBW_CHANNELS), 255, 191, 64)
    expect(out).toEqual({ 5: 64, 2: 191, 3: 127, 4: 0 })
  })

  it('2: RGBW (255,255,255) → white=255, rgb=0', () => {
    const out = mix(makeFixture(FixtureTypes.RGBW, RGBW_CHANNELS), 255, 255, 255)
    expect(out).toEqual({ 5: 255, 2: 0, 3: 0, 4: 0 })
  })

  it('3: RGBW (200,100,50) → white=50, red=150, green=50, blue=0', () => {
    const out = mix(makeFixture(FixtureTypes.RGBW, RGBW_CHANNELS), 200, 100, 50)
    expect(out).toEqual({ 5: 50, 2: 150, 3: 50, 4: 0 })
  })

  it('4: RGB+amber (255,191,0) → amber=255, rgb=0', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('amber', 5)])
    expect(mix(f, 255, 191, 0)).toEqual({ 5: 255, 2: 0, 3: 0, 4: 0 })
  })

  it('5: RGB+warmWhite (255,255,255) → warmWhite=255, red=0, green=64, blue=128', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('warmWhite', 5)])
    expect(mix(f, 255, 255, 255)).toEqual({ 5: 255, 2: 0, 3: 64, 4: 128 })
  })

  it('6: RGB+warmWhite+coolWhite (255,255,255) → WW=142, CW=142, red=0, green=21, blue=43', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [
      extra('warmWhite', 5),
      extra('coolWhite', 6),
    ])
    expect(mix(f, 255, 255, 255)).toEqual({ 5: 142, 6: 142, 2: 0, 3: 21, 4: 43 })
  })

  it('7: RGBW+amber (255,223,128) → white=128, amber=127, rgb=0', () => {
    const f = makeFixture(FixtureTypes.RGBW, RGBW_CHANNELS, [extra('amber', 6)])
    expect(mix(f, 255, 223, 128)).toEqual({ 5: 128, 6: 127, 2: 0, 3: 0, 4: 0 })
  })

  it('8: RGB+uv (128,0,128) → uv=128, red=64, green=0, blue=0', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('uv', 5)])
    expect(mix(f, 128, 0, 128)).toEqual({ 5: 128, 2: 64, 3: 0, 4: 0 })
  })

  it('8a: RGB+uv (255,0,0) → uv stays dark, red=255', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('uv', 5)])
    expect(mix(f, 255, 0, 0)).toEqual({ 5: 0, 2: 255, 3: 0, 4: 0 })
  })

  it('8b: RGB+uv (0,0,255) → uv stays dark, blue=255', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('uv', 5)])
    expect(mix(f, 0, 0, 255)).toEqual({ 5: 0, 2: 0, 3: 0, 4: 255 })
  })

  it('9: RGB+orange (255,127,0) → orange=254, red=1', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('orange', 5)])
    expect(mix(f, 255, 127, 0)).toEqual({ 5: 254, 2: 1, 3: 0, 4: 0 })
  })

  it('10: RGB+lime (127,255,0) → lime=254, green=1', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('lime', 5)])
    expect(mix(f, 127, 255, 0)).toEqual({ 5: 254, 2: 0, 3: 1, 4: 0 })
  })

  it('11: RGB+amber+2×extra red (255,127,0) → amber=169, every red bank=86', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [
      extra('amber', 5),
      extra('red', 6),
      extra('red', 7),
    ])
    // amber on ch5, named red ch2, extra reds ch6/ch7 all identical.
    expect(mix(f, 255, 127, 0)).toEqual({ 5: 169, 2: 86, 6: 86, 7: 86, 3: 0, 4: 0 })
  })
})

describe('applyChannelMixPlan — white precedence and duplicates', () => {
  it('white + warm + cool: neutral white wins, warm/cool stay dark on neutral input', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [
      extra('white', 5),
      extra('warmWhite', 6),
      extra('coolWhite', 7),
    ])
    expect(mix(f, 255, 255, 255)).toEqual({ 5: 255, 6: 0, 7: 0, 2: 0, 3: 0, 4: 0 })
  })

  it('two amber banks receive the same value and the triple is subtracted once', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('amber', 5), extra('amber', 6)])
    const out = mix(f, 255, 191, 0)
    expect(out[5]).toBe(255)
    expect(out[6]).toBe(255)
    // Subtracted once — residual matches the single-amber vector (#4), not double.
    expect([out[2], out[3], out[4]]).toEqual([0, 0, 0])
  })
})

describe('fixed channels', () => {
  it('collects fixed channels into fixedWrites with a clamped value, not into stages', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('fixed', 5, 42)])
    const plan = buildChannelMixPlan(f)!
    expect(plan.stages).toHaveLength(0)
    expect(plan.fixedWrites).toEqual([{ channel: 5, value: 42 }])
  })

  it('clamps an out-of-range fixed value into 0–255', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('fixed', 5, 999)])
    expect(buildChannelMixPlan(f)!.fixedWrites).toEqual([{ channel: 5, value: 255 }])
  })

  it('a fixed value of 0 is valid and still emitted', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [extra('fixed', 5, 0)])
    expect(buildChannelMixPlan(f)!.fixedWrites).toEqual([{ channel: 5, value: 0 }])
  })
})

describe('invalid channels and strobe device class', () => {
  it('excludes out-of-range extra channel numbers and records them', () => {
    const f = makeFixture(FixtureTypes.RGB, RGB_CHANNELS, [
      extra('amber', 600),
      extra('white', 5),
      extra('uv', 0),
    ])
    const plan = buildChannelMixPlan(f)!
    expect(plan.invalidChannels).toHaveLength(2) // amber@600 and uv@0
    // Only the valid white extra produced a stage.
    expect(plan.stages.every((s) => s.channels.every((c) => c === 5))).toBe(true)
  })

  it('a dedicated strobe fixture honours fixed extras but never colour extras', () => {
    const f = makeFixture(FixtureTypes.STROBE, { masterDimmer: 1, strobeChannel: 2 }, [
      extra('fixed', 3, 200),
      extra('red', 4),
    ])
    const plan = buildChannelMixPlan(f)!
    expect(plan.fixedWrites).toEqual([{ channel: 3, value: 200 }])
    expect(plan.redChannels).toHaveLength(0)
    expect(plan.stages).toHaveLength(0)
    expect(plan.invalidChannels).toHaveLength(1) // the red extra
  })
})

describe('input sanitisation', () => {
  it('treats NaN colour components as 0 (never poisons the buffer)', () => {
    const f = makeFixture(FixtureTypes.RGBW, RGBW_CHANNELS)
    const out = mix(f, Number.NaN, 100, 50)
    for (const v of Object.values(out)) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
  })

  it('clamps negative colour components to 0 rather than inflating siblings', () => {
    const f = makeFixture(FixtureTypes.RGBW, RGBW_CHANNELS)
    // Legacy would clamp red to 0; white = min(0,100,200)=0, residual green/blue untouched.
    expect(mix(f, -5, 100, 200)).toEqual({ 5: 0, 2: 0, 3: 100, 4: 200 })
  })
})

describe('RGBW white=0 matches legacy', () => {
  it('an RGBW fixture with an unassigned white channel produces no plan (legacy RGB path)', () => {
    const f = makeFixture(FixtureTypes.RGBW, {
      masterDimmer: 1,
      red: 2,
      green: 3,
      blue: 4,
      white: 0,
    })
    // No valid white channel → no stage, no extras → null plan → the publisher's legacy path
    // writes full RGB and never touches white, exactly as before this feature.
    expect(buildChannelMixPlan(f)).toBeNull()
  })
})

describe('reconstruction and bounds invariants', () => {
  const LEVELS = [0, 1, 64, 127, 128, 191, 254, 255]
  const EMITTER_SETS: Array<{ label: string; extras: ExtraChannel[]; fixture: FixtureTypes }> = [
    { label: 'RGBW', fixture: FixtureTypes.RGBW, extras: [] },
    { label: 'RGB+amber', fixture: FixtureTypes.RGB, extras: [extra('amber', 5)] },
    {
      label: 'RGB+WW+CW',
      fixture: FixtureTypes.RGB,
      extras: [extra('warmWhite', 5), extra('coolWhite', 6)],
    },
    {
      label: 'RGB+white+amber+uv',
      fixture: FixtureTypes.RGB,
      extras: [extra('white', 5), extra('amber', 6), extra('uv', 7)],
    },
  ]

  for (const set of EMITTER_SETS) {
    it(`${set.label}: outputs are ints in 0–255 and reconstruct the input within rounding slack`, () => {
      const channels = set.fixture === FixtureTypes.RGBW ? RGBW_CHANNELS : RGB_CHANNELS
      const fixture = makeFixture(set.fixture, channels, set.extras.length ? set.extras : undefined)
      const plan = buildChannelMixPlan(fixture)
      expect(plan).not.toBeNull()

      for (const r of LEVELS)
        for (const g of LEVELS)
          for (const b of LEVELS) {
            const out = mix(fixture, r, g, b)
            for (const value of Object.values(out)) {
              expect(Number.isInteger(value)).toBe(true)
              expect(value).toBeGreaterThanOrEqual(0)
              expect(value).toBeLessThanOrEqual(255)
            }

            // Reconstruct perceived RGB. Count each stage once (its channels all share the drive
            // value, and the stage triple already sums warm+cool white), then add the residual
            // once from a representative red/green/blue channel.
            let rr = 0
            let gg = 0
            let bb = 0
            for (const s of plan!.stages) {
              const v = out[s.channels[0]] ?? 0
              rr += v * s.er
              gg += v * s.eg
              bb += v * s.eb
            }
            if (plan!.redChannels.length) rr += out[plan!.redChannels[0]] ?? 0
            if (plan!.greenChannels.length) gg += out[plan!.greenChannels[0]] ?? 0
            if (plan!.blueChannels.length) bb += out[plan!.blueChannels[0]] ?? 0

            expect(Math.abs(rr - r)).toBeLessThanOrEqual(3)
            expect(Math.abs(gg - g)).toBeLessThanOrEqual(3)
            expect(Math.abs(bb - b)).toBeLessThanOrEqual(3)
          }
    })
  }

  it('every single-type emitter primary has a component of exactly 1.0 (drive never exceeds 255)', () => {
    for (const type of Object.keys(EMITTER_PRIMARIES) as MixableChannelType[]) {
      expect(Math.max(...EMITTER_PRIMARIES[type])).toBe(1)
    }
  })
})
