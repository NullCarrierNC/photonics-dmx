/**
 * Where a light's channels land when its master dimmer moves, and when the move is held back.
 */
import { describe, expect, it } from '@jest/globals'
import {
  DMX_CHANNEL_MAX,
  FixtureTypes,
  type ExtraChannel,
  type RgbFixture,
} from '../../../photonics-dmx/types'
import { resolveMasterDimmer } from './lightChannelMaster'

/** An RGB template whose colour channels sit at master + 1, 2, 3. */
function template(overrides: Partial<RgbFixture> = {}): RgbFixture {
  return {
    id: 't1',
    position: 0,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    group: '',
    universe: 1,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
    ...overrides,
  }
}

describe('resolveMasterDimmer', () => {
  it('moves every channel by the same offset', () => {
    const { master, layout } = resolveMasterDimmer(template(), 100)

    expect(master).toBe(100)
    expect(layout).toEqual({
      fixture: FixtureTypes.RGB,
      channels: { masterDimmer: 100, red: 101, green: 102, blue: 103 },
    })
  })

  it('places nothing but the master for a template with no master, anywhere in the universe', () => {
    const noMaster = template({
      channels: { masterDimmer: 0, red: 2, green: 3, blue: 4 },
      extraChannels: [{ type: 'white', channel: 5 }],
    })
    const { master, cappedMessage, layout, extraChannels } = resolveMasterDimmer(noMaster, 512)

    expect(master).toBe(512)
    expect(cappedMessage).toBeNull()
    expect(layout.channels).toEqual({ masterDimmer: 512, red: 0, green: 0, blue: 0 })
    expect(extraChannels).toEqual([{ type: 'white', channel: 0 }])
  })

  it('reports no cap for a master that fits', () => {
    expect(resolveMasterDimmer(template(), 100).cappedMessage).toBeNull()
  })

  it('holds the fixture inside the universe', () => {
    // The template spans four channels, so the highest master that still fits is 512 - 3.
    const { master } = resolveMasterDimmer(template(), DMX_CHANNEL_MAX)

    expect(master).toBe(DMX_CHANNEL_MAX - 3)
  })

  it('explains a cap rather than applying it quietly', () => {
    const { cappedMessage } = resolveMasterDimmer(template(), 9999)

    expect(cappedMessage).toMatch(/Capped at 509/)
    expect(cappedMessage).toMatch(/4 channels/)
    expect(cappedMessage).toMatch(new RegExp(`${DMX_CHANNEL_MAX}-channel universe`))
  })

  it.each([
    ['zero', 0],
    ['negative', -12],
    ['not a number', Number.NaN],
  ])('raises a %s master to the first channel', (_label, asked) => {
    expect(resolveMasterDimmer(template(), asked).master).toBe(1)
  })

  it('keeps a master of exactly one', () => {
    expect(resolveMasterDimmer(template(), 1).master).toBe(1)
  })
})

describe('resolveMasterDimmer extra channels', () => {
  const white: ExtraChannel[] = [{ type: 'white', channel: 5 }]

  it('moves an extra channel by the same offset', () => {
    const { extraChannels } = resolveMasterDimmer(template({ extraChannels: white }), 100)

    expect(extraChannels).toEqual([{ type: 'white', channel: 104 }])
  })

  it('reports none when the template carries none', () => {
    expect(resolveMasterDimmer(template(), 100).extraChannels).toBeNull()
  })

  it('counts extra channels when working out the cap', () => {
    const wide = template({ extraChannels: white })

    // The extra at master + 4 makes the fixture five channels wide.
    expect(resolveMasterDimmer(wide, DMX_CHANNEL_MAX).master).toBe(DMX_CHANNEL_MAX - 4)
  })
})
