import { describe, expect, it } from '@jest/globals'
import { FixtureTypes, type DmxFixture, type ExtraChannel } from '../../../photonics-dmx/types'
import {
  applyChannelMixPlan,
  buildChannelMixPlan,
} from '../../../photonics-dmx/helpers/colorChannelMixer'
import { getDmxPreviewLightColor, getLightColorChannelBreakdown } from './dmxPreviewLightColor'

function fixture(
  fx: FixtureTypes,
  channels: Record<string, number>,
  extraChannels?: ExtraChannel[],
): DmxFixture {
  return {
    id: 't',
    position: 0,
    fixture: fx,
    label: 'L',
    name: 'L',
    isStrobeEnabled: false,
    channels: channels as unknown as DmxFixture['channels'],
    ...(extraChannels ? { extraChannels } : {}),
  }
}

const RGB = { masterDimmer: 1, red: 2, green: 3, blue: 4 }

describe('getDmxPreviewLightColor with extra channels', () => {
  it('shows amber (not black) when the mixer diverted energy to an amber channel', () => {
    // Vector #4: an RGB+amber fixture on cue colour (255,191,0) publishes rgb=0, amber=255.
    const f = fixture(FixtureTypes.RGB, RGB, [{ type: 'amber', channel: 5 }])
    const dmx = { 1: 255, 2: 0, 3: 0, 4: 0, 5: 255 }
    const { r, g, b } = getDmxPreviewLightColor(f, dmx)
    // amber emitter (1, 0.75, 0) × 255 → roughly (255, 191, 0), not black.
    expect(r).toBe(255)
    expect(g).toBe(191)
    expect(b).toBe(0)
  })

  it('leaves a plain RGB fixture preview unchanged', () => {
    const f = fixture(FixtureTypes.RGB, RGB)
    const dmx = { 1: 255, 2: 200, 3: 100, 4: 50 }
    expect(getDmxPreviewLightColor(f, dmx)).toEqual({ r: 200, g: 100, b: 50 })
  })

  it('ignores fixed channels in the preview colour', () => {
    const f = fixture(FixtureTypes.RGB, RGB, [{ type: 'fixed', channel: 5, value: 200 }])
    const dmx = { 1: 255, 2: 10, 3: 20, 4: 30, 5: 200 }
    expect(getDmxPreviewLightColor(f, dmx)).toEqual({ r: 10, g: 20, b: 30 })
  })

  it('counts duplicate amber channels once (amber, not over-saturated yellow)', () => {
    // Two amber banks model one emitter (the publisher subtracts amber's triple once). Both at 255
    // must preview as amber (255,191,0), not (510,382,0) → clamped yellow (255,255,0).
    const f = fixture(FixtureTypes.RGB, RGB, [
      { type: 'amber', channel: 5 },
      { type: 'amber', channel: 6 },
    ])
    const dmx = { 1: 255, 2: 0, 3: 0, 4: 0, 5: 255, 6: 255 }
    expect(getDmxPreviewLightColor(f, dmx)).toEqual({ r: 255, g: 191, b: 0 })
  })

  it('sums distinct emitter types rather than taking the brightest', () => {
    // Different types → both contribute; white (1,1,1) + amber (1,0.75,0) at 100 each.
    const f = fixture(FixtureTypes.RGB, RGB, [
      { type: 'white', channel: 5 },
      { type: 'amber', channel: 6 },
    ])
    const dmx = { 1: 255, 2: 0, 3: 0, 4: 0, 5: 100, 6: 100 }
    // r = 100*1 + 100*1 = 200, g = 100*1 + 100*0.75 = 175, b = 100*1 + 100*0 = 100.
    expect(getDmxPreviewLightColor(f, dmx)).toEqual({ r: 200, g: 175, b: 100 })
  })

  it('follows a duplicate red bank driven on its own (DMX Console manual mode)', () => {
    // Console sliders move each channel independently, so an added bank must move the swatch.
    const f = fixture(FixtureTypes.RGB, RGB, [{ type: 'red', channel: 5 }])
    const dmx = { 1: 255, 2: 0, 3: 0, 4: 0, 5: 200 }
    expect(getDmxPreviewLightColor(f, dmx)).toEqual({ r: 200, g: 0, b: 0 })
  })

  it('counts a duplicate red bank once when it matches the base channel (publisher output)', () => {
    // The mixer writes every bank of a primary the same value; max() keeps that a no-op.
    const f = fixture(FixtureTypes.RGB, RGB, [{ type: 'red', channel: 5 }])
    const dmx = { 1: 255, 2: 200, 3: 0, 4: 0, 5: 200 }
    expect(getDmxPreviewLightColor(f, dmx)).toEqual({ r: 200, g: 0, b: 0 })
  })

  it('counts two white banks once', () => {
    // Both sit in the publisher's single white stage, so preview must not add them twice.
    const f = fixture(FixtureTypes.RGB, RGB, [
      { type: 'white', channel: 5 },
      { type: 'white', channel: 6 },
    ])
    const dmx = { 1: 255, 2: 0, 3: 0, 4: 0, 5: 120, 6: 120 }
    expect(getDmxPreviewLightColor(f, dmx)).toEqual({ r: 120, g: 120, b: 120 })
  })
})

describe('getLightColorChannelBreakdown', () => {
  it('breaks a plain RGB fixture into its three primaries', () => {
    const breakdown = getLightColorChannelBreakdown(fixture(FixtureTypes.RGB, RGB), {
      2: 200,
      3: 80,
      4: 0,
    })!
    expect(breakdown).toEqual([
      { label: 'Red', value: 200, css: 'rgb(200, 0, 0)', borderCss: 'rgb(255, 0, 0)' },
      { label: 'Green', value: 80, css: 'rgb(0, 80, 0)', borderCss: 'rgb(0, 255, 0)' },
      { label: 'Blue', value: 0, css: 'rgb(0, 0, 0)', borderCss: 'rgb(0, 0, 255)' },
    ])
  })

  it('breaks down a moving head, whose pan/tilt are not colour channels', () => {
    const f = fixture(FixtureTypes.RGBMH, { ...RGB, pan: 5, tilt: 6 })
    const breakdown = getLightColorChannelBreakdown(f, { 2: 10, 5: 255, 6: 255 })!
    expect(breakdown.map((e) => e.label)).toEqual(['Red', 'Green', 'Blue'])
  })

  it('lists only the base primaries when the extras are all fixed channels', () => {
    const f = fixture(FixtureTypes.RGB, RGB, [{ type: 'fixed', channel: 5, value: 200 }])
    const breakdown = getLightColorChannelBreakdown(f, { 5: 200 })!
    expect(breakdown.map((e) => e.label)).toEqual(['Red', 'Green', 'Blue'])
  })

  it('returns null for a colour-less strobe', () => {
    const f = fixture(FixtureTypes.STROBE, { masterDimmer: 1, strobeChannel: 2 }, [
      { type: 'fixed', channel: 3, value: 10 },
    ])
    expect(getLightColorChannelBreakdown(f, {})).toBeNull()
  })

  it('returns null when every colour channel is unassigned, so no empty row renders', () => {
    const f = fixture(FixtureTypes.RGB, { masterDimmer: 1, red: 0, green: 0, blue: 0 })
    expect(getLightColorChannelBreakdown(f, {})).toBeNull()
  })

  it('lists the base primaries then each colour extra, numbered like the channel list', () => {
    const f = fixture(FixtureTypes.RGB, RGB, [
      { type: 'amber', channel: 5 },
      { type: 'red', channel: 6 },
      { type: 'fixed', channel: 7, value: 255 },
    ])
    const dmx = { 1: 255, 2: 100, 3: 0, 4: 0, 5: 200, 6: 40, 7: 255 }
    const breakdown = getLightColorChannelBreakdown(f, dmx)!
    // The duplicate bank sits beside the primary it doubles, and the fixed channel is excluded.
    expect(breakdown.map((e) => e.label)).toEqual(['Red', 'Green', 'Blue', 'Amber', 'Red 2'])
    expect(breakdown.map((e) => e.value)).toEqual([100, 0, 0, 200, 40])
    expect(breakdown[0].css).toBe('rgb(100, 0, 0)')
    expect(breakdown[0].borderCss).toBe('rgb(255, 0, 0)')
    expect(breakdown[4].css).toBe('rgb(40, 0, 0)')
    expect(breakdown[4].borderCss).toBe('rgb(255, 0, 0)')
    // Amber's swatch uses the mixer's emitter primary (1, 0.75, 0).
    expect(breakdown[3].css).toBe('rgb(200, 150, 0)')
    expect(breakdown[3].borderCss).toBe('rgb(255, 191, 0)')
  })

  it('reads an unassigned extra channel as 0 rather than following channel 0', () => {
    const f = fixture(FixtureTypes.RGB, RGB, [{ type: 'amber', channel: 0 }])
    const breakdown = getLightColorChannelBreakdown(f, { 0: 255, 2: 10 })!
    expect(breakdown.at(-1)).toEqual({
      label: 'Amber',
      value: 0,
      css: 'rgb(0, 0, 0)',
      borderCss: 'rgb(255, 191, 0)',
    })
  })

  it('is not scaled by the master dimmer, so channels stay readable while it rides', () => {
    const f = fixture(FixtureTypes.RGB, RGB, [{ type: 'amber', channel: 5 }])
    const dark = getLightColorChannelBreakdown(f, { 1: 0, 2: 255, 5: 255 })!
    const lit = getLightColorChannelBreakdown(f, { 1: 255, 2: 255, 5: 255 })!
    expect(dark).toEqual(lit)
  })
})

describe('preview matches the published wire values', () => {
  const SHAPES: Array<{ label: string; light: DmxFixture }> = [
    { label: 'plain RGB', light: fixture(FixtureTypes.RGB, RGB) },
    {
      label: 'RGB + white (the migrated RGBW shape)',
      light: fixture(FixtureTypes.RGB, RGB, [{ type: 'white', channel: 5 }]),
    },
    {
      label: 'RGB + amber',
      light: fixture(FixtureTypes.RGB, RGB, [{ type: 'amber', channel: 5 }]),
    },
    {
      label: 'RGB + two white banks',
      light: fixture(FixtureTypes.RGB, RGB, [
        { type: 'white', channel: 5 },
        { type: 'white', channel: 6 },
      ]),
    },
    {
      label: 'RGB + white + amber + uv',
      light: fixture(FixtureTypes.RGB, RGB, [
        { type: 'white', channel: 5 },
        { type: 'amber', channel: 6 },
        { type: 'uv', channel: 7 },
      ]),
    },
    {
      label: 'RGB + amber + duplicate red banks',
      light: fixture(FixtureTypes.RGB, RGB, [
        { type: 'amber', channel: 5 },
        { type: 'red', channel: 6 },
        { type: 'red', channel: 7 },
        { type: 'fixed', channel: 8, value: 200 },
      ]),
    },
  ]

  const COLORS: Array<[number, number, number]> = [
    [255, 255, 255],
    [255, 191, 64],
    [200, 100, 50],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [128, 0, 128],
    [255, 127, 0],
    [127, 255, 0],
    [64, 64, 64],
    [0, 0, 0],
  ]

  /** The DMX a fixture publishes for one colour at full master dimmer, via the publisher's rules. */
  function publishToDmx(
    light: DmxFixture,
    [red, green, blue]: [number, number, number],
  ): Record<number, number> {
    const dmx: Record<number, number> = { 1: 255 }
    const plan = buildChannelMixPlan(light)
    const channels = light.channels as unknown as Record<string, number>
    if (plan) {
      applyChannelMixPlan(plan, red, green, blue, (channel, value) => {
        dmx[channel] = value
      })
      for (const fw of plan.fixedWrites) dmx[fw.channel] = fw.value
    } else {
      // Legacy path: the named colour channels take the cue colour directly.
      dmx[channels.red] = red
      dmx[channels.green] = green
      dmx[channels.blue] = blue
    }
    return dmx
  }

  for (const shape of SHAPES) {
    it(`${shape.label}: preview reconstructs the cue colour`, () => {
      for (const color of COLORS) {
        const dmx = publishToDmx(shape.light, color)
        const preview = getDmxPreviewLightColor(shape.light, dmx)
        const [r, g, b] = color
        // Rounding slack only — both sides share EMITTER_PRIMARIES, so the mix is exact in floats.
        expect(Math.abs(preview.r - r)).toBeLessThanOrEqual(2)
        expect(Math.abs(preview.g - g)).toBeLessThanOrEqual(2)
        expect(Math.abs(preview.b - b)).toBeLessThanOrEqual(2)
      }
    })
  }
})
