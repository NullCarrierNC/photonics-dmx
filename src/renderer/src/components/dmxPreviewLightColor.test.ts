import { describe, expect, it } from '@jest/globals'
import { FixtureTypes, type DmxFixture, type ExtraChannel } from '../../../photonics-dmx/types'
import { getDmxPreviewLightColor } from './dmxPreviewLightColor'

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

  it('sums warm and cool white as distinct emitters', () => {
    // Different types → both contribute; warm (1,0.75,0.5) + cool (0.8,0.9,1) at 100 each.
    const f = fixture(FixtureTypes.RGB, RGB, [
      { type: 'warmWhite', channel: 5 },
      { type: 'coolWhite', channel: 6 },
    ])
    const dmx = { 1: 255, 2: 0, 3: 0, 4: 0, 5: 100, 6: 100 }
    // r = 100*1 + 100*0.8 = 180, g = 100*0.75 + 100*0.9 = 165, b = 100*0.5 + 100*1 = 150.
    expect(getDmxPreviewLightColor(f, dmx)).toEqual({ r: 180, g: 165, b: 150 })
  })
})
