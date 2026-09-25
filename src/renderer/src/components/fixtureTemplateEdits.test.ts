import { describe, expect, it } from '@jest/globals'
import {
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
} from '../../../photonics-dmx/types'
import {
  rgbFixture,
  rgbMovingHeadFixture,
  strobeFixture,
} from '../../../photonics-dmx/tests/helpers/testFixtures'
import { withChannelNumber, withFixtureType, withStrobeChannelOption } from './fixtureTemplateEdits'

describe('withChannelNumber', () => {
  it('sets a channel the fixture type has', () => {
    expect(withChannelNumber(rgbFixture(), 'green', 9).channels).toEqual({
      masterDimmer: 4,
      red: 1,
      green: 9,
      blue: 3,
    })
  })

  it('leaves the fixture as it is for a channel its type does not have', () => {
    expect(withChannelNumber(strobeFixture(), 'red', 9)).toEqual(strobeFixture())
  })
})

describe('withStrobeChannelOption', () => {
  it('adds an unassigned strobe channel and default speeds to an RGB fixture', () => {
    const next = withStrobeChannelOption(rgbFixture(), true)

    expect(next.channels).toEqual({ masterDimmer: 4, red: 1, green: 2, blue: 3, strobeChannel: 0 })
    expect(next.strobeValues).toEqual(DEFAULT_STROBE_CHANNEL_VALUES)
  })

  it('removes the strobe channel and its speeds from a moving head', () => {
    const fixture = rgbMovingHeadFixture({
      channels: { masterDimmer: 4, red: 1, green: 2, blue: 3, pan: 5, tilt: 6, strobeChannel: 7 },
      strobeValues: { slow: 1, medium: 2, fast: 3, fastest: 4 },
    })
    const next = withStrobeChannelOption(fixture, false)

    expect(next.channels).toEqual({ masterDimmer: 4, red: 1, green: 2, blue: 3, pan: 5, tilt: 6 })
    expect(next.strobeValues).toBeUndefined()
  })

  it('leaves a dedicated strobe as it is', () => {
    const fixture = strobeFixture()
    expect(withStrobeChannelOption(fixture, false)).toBe(fixture)
  })
})

describe('withFixtureType', () => {
  it('carries a strobe channel and its speeds from RGB to a moving head', () => {
    const strobeValues = { slow: 1, medium: 2, fast: 3, fastest: 4 }
    const next = withFixtureType(
      rgbFixture({
        channels: { masterDimmer: 4, red: 1, green: 2, blue: 3, strobeChannel: 7 },
        strobeValues,
      }),
      FixtureTypes.RGBMH,
    )

    expect(next).toMatchObject({
      fixture: FixtureTypes.RGBMH,
      channels: { masterDimmer: 0, red: 0, green: 0, blue: 0, pan: 0, tilt: 0, strobeChannel: 7 },
      config: DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
      strobeValues,
    })
  })

  it('keeps only fixed channels and drops the colour trim on a dedicated strobe', () => {
    const next = withFixtureType(
      rgbFixture({
        extraChannels: [
          { type: 'amber', channel: 8 },
          { type: 'fixed', channel: 9, value: 20 },
        ],
        brightnessScaling: { red: 80 },
      }),
      FixtureTypes.STROBE,
    )

    expect(next.fixture).toBe(FixtureTypes.STROBE)
    expect(next.channels).toEqual({ masterDimmer: 0, strobeChannel: 0 })
    expect(next.extraChannels).toEqual([{ type: 'fixed', channel: 9, value: 20 }])
    expect(next).not.toHaveProperty('brightnessScaling')
    expect(next.strobeValues).toBeUndefined()
  })

  it('starts an RGB fixture from a dedicated strobe with no strobe channel', () => {
    const next = withFixtureType(strobeFixture(), FixtureTypes.RGB)

    expect(next.channels).toEqual({ masterDimmer: 0, red: 0, green: 0, blue: 0 })
    expect(next.config).toBeUndefined()
  })
})
