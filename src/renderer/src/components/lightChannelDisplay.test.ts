import { describe, expect, it } from '@jest/globals'
import {
  FixtureTypes,
  LightTypes,
  type DmxFixture,
  type ExtraChannel,
} from '../../../photonics-dmx/types'
import {
  BASE_CHANNEL_ORDER,
  extraChannelDisplayLabel,
  findDuplicateChannelNumbers,
  fixtureHasZeroChannel,
  sortBaseChannelEntries,
} from './lightChannelDisplay'

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

describe('sortBaseChannelEntries', () => {
  it('orders base channels by the canonical order, unknown keys last alphabetically', () => {
    const entries: Array<[string, number]> = [
      ['blue', 4],
      ['masterDimmer', 1],
      ['zeta', 9],
      ['red', 2],
      ['alpha', 8],
    ]
    expect(sortBaseChannelEntries(entries).map(([k]) => k)).toEqual([
      'masterDimmer',
      'red',
      'blue',
      'alpha',
      'zeta',
    ])
  })

  it('reproduces the prior display order for every built-in archetype (refactor lock)', () => {
    // Regression lock for the channelOrder consolidation: every archetype's channels sort into a
    // prefix of BASE_CHANNEL_ORDER.
    for (const tpl of LightTypes) {
      const keys = sortBaseChannelEntries(Object.entries(tpl.channels)).map(([k]) => k)
      const expected = BASE_CHANNEL_ORDER.filter((name) => name in tpl.channels)
      expect(keys).toEqual(expected)
    }
  })
})

describe('extraChannelDisplayLabel', () => {
  const RGB = { masterDimmer: 1, red: 2, green: 3, blue: 4 }

  it('numbers a red added to an RGB fixture as "Red 2" (base channel counts)', () => {
    const f = fixture(FixtureTypes.RGB, RGB, [{ type: 'red', channel: 5 }])
    expect(extraChannelDisplayLabel(f, 0)).toBe('Red 2')
  })

  it('omits the suffix for the only channel of a type', () => {
    const f = fixture(FixtureTypes.RGB, RGB, [{ type: 'amber', channel: 5 }])
    expect(extraChannelDisplayLabel(f, 0)).toBe('Amber')
  })

  it('numbers a second amber as "Amber 2"', () => {
    const f = fixture(FixtureTypes.RGB, RGB, [
      { type: 'amber', channel: 5 },
      { type: 'amber', channel: 6 },
    ])
    expect(extraChannelDisplayLabel(f, 0)).toBe('Amber')
    expect(extraChannelDisplayLabel(f, 1)).toBe('Amber 2')
  })

  it('labels fixed rows "Fixed value" and numbers them among themselves', () => {
    const f = fixture(FixtureTypes.RGB, RGB, [
      { type: 'fixed', channel: 5, value: 1 },
      { type: 'fixed', channel: 6, value: 2 },
    ])
    expect(extraChannelDisplayLabel(f, 0)).toBe('Fixed value')
    expect(extraChannelDisplayLabel(f, 1)).toBe('Fixed value 2')
  })
})

describe('fixtureHasZeroChannel', () => {
  const RGB = { masterDimmer: 1, red: 2, green: 3, blue: 4 }

  it('is true when a base channel is 0', () => {
    expect(fixtureHasZeroChannel(fixture(FixtureTypes.RGB, { ...RGB, blue: 0 }))).toBe(true)
  })

  it('is true when an extra channel is 0', () => {
    expect(
      fixtureHasZeroChannel(fixture(FixtureTypes.RGB, RGB, [{ type: 'amber', channel: 0 }])),
    ).toBe(true)
  })

  it('is false for a fixed value of 0 with a valid channel number', () => {
    expect(
      fixtureHasZeroChannel(
        fixture(FixtureTypes.RGB, RGB, [{ type: 'fixed', channel: 5, value: 0 }]),
      ),
    ).toBe(false)
  })
})

describe('findDuplicateChannelNumbers', () => {
  it('finds numbers used more than once across base and extras, ignoring zeros', () => {
    const f = fixture(FixtureTypes.RGB, { masterDimmer: 1, red: 2, green: 3, blue: 5 }, [
      { type: 'amber', channel: 5 }, // collides with blue
      { type: 'white', channel: 0 }, // ignored
      { type: 'uv', channel: 2 }, // collides with red
    ])
    expect(findDuplicateChannelNumbers(f)).toEqual([2, 5])
  })

  it('is empty when all channel numbers are distinct', () => {
    const f = fixture(FixtureTypes.RGB, { masterDimmer: 1, red: 2, green: 3, blue: 4 })
    expect(findDuplicateChannelNumbers(f)).toEqual([])
  })
})
