/**
 * The console's channel resolution: which channels a rig light shows, what numbers they carry, and
 * which of them the manual buffer seeds before the user touches anything.
 */
import { describe, expect, it } from '@jest/globals'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxFixture,
  type ExtraChannel,
  type LightingConfiguration,
  type RgbDmxChannels,
  type RgbFixture,
  type RgbLight,
} from '../../../photonics-dmx/types'
import { strobeLight } from '../../../photonics-dmx/tests/helpers/testFixtures'
import {
  buildConsoleFixedSeed,
  channelLabel,
  channelSortKey,
  getEffectiveChannelEntries,
  getTemplateAlignedChannels,
  getTemplateAlignedExtraChannels,
  isLightModified,
  isMovingHeadFixture,
  isPanTiltChannelName,
  lightOnChannel,
} from './dmxConsoleChannels'

/** An RGB template whose colour channels sit one, two and three above its master dimmer. */
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

function light(overrides: Partial<RgbLight> = {}): RgbLight {
  return {
    id: 'l1',
    fixtureId: 't1',
    position: 1,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    group: 'front',
    universe: 1,
    mount: 'floor',
    channels: { masterDimmer: 10, red: 11, green: 12, blue: 13 },
    ...overrides,
  }
}

function layout(lights: Partial<LightingConfiguration>): LightingConfiguration {
  return {
    numLights: 0,
    lightLayout: { id: 'two-rows', label: 'Two Rows' },
    strobeType: ConfigStrobeType.None,
    frontLights: [],
    backLights: [],
    strobeLights: [],
    ...lights,
  }
}

describe('getTemplateAlignedChannels', () => {
  it('takes the channel set from the template', () => {
    const withStrobe = template({
      channels: {
        masterDimmer: 1,
        red: 2,
        green: 3,
        blue: 4,
        strobeChannel: 5,
      },
    })

    const channels = getTemplateAlignedChannels(light(), [withStrobe])

    expect(Object.keys(channels).sort()).toEqual(
      ['blue', 'green', 'masterDimmer', 'red', 'strobeChannel'].sort(),
    )
  })

  it('derives a channel the light has no number for from the template offset', () => {
    const withStrobe = template({
      channels: {
        masterDimmer: 1,
        red: 2,
        green: 3,
        blue: 4,
        strobeChannel: 5,
      },
    })

    const channels = getTemplateAlignedChannels(light(), [withStrobe])

    // The light's master sits at 10 and the template puts strobe four above its own master.
    expect(channels.strobeChannel).toBe(14)
  })

  it('places every channel by the template offset from the light master dimmer', () => {
    const channels = getTemplateAlignedChannels(
      light({
        channels: { masterDimmer: 10, red: 99, green: 12, blue: 13 },
      }),
      [template()],
    )

    expect(channels).toEqual({ masterDimmer: 10, red: 11, green: 12, blue: 13 })
  })

  it('keeps an unassigned template channel at 0', () => {
    const unsetStrobe = template({
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 0 },
    })

    expect(getTemplateAlignedChannels(light(), [unsetStrobe]).strobeChannel).toBe(0)
  })

  it('leaves a channel that lands past the end of the universe at 0', () => {
    const channels = getTemplateAlignedChannels(
      light({ channels: { masterDimmer: 510, red: 511, green: 512, blue: 0 } }),
      [template()],
    )

    expect(channels).toEqual({ masterDimmer: 510, red: 511, green: 512, blue: 0 })
  })

  it('gives a light with no master address every channel at 0', () => {
    const channels = getTemplateAlignedChannels(
      light({ channels: { masterDimmer: 0, red: 1, green: 2, blue: 3 } }),
      [template()],
    )

    expect(channels).toEqual({ masterDimmer: 0, red: 0, green: 0, blue: 0 })
  })

  it('gives a light every channel at 0, its master included, when the template has no master', () => {
    const noMaster = template({ channels: { masterDimmer: 0, red: 2, green: 3, blue: 4 } })
    const at = light({ channels: { masterDimmer: 5, red: 7, green: 8, blue: 9 } })

    expect(getTemplateAlignedChannels(at, [noMaster])).toEqual({
      masterDimmer: 0,
      red: 0,
      green: 0,
      blue: 0,
    })
  })

  it('reads the master dimmer from the light', () => {
    const channels = getTemplateAlignedChannels(
      // A light with no red channel of its own, as when its template changed fixture type.
      strobeLight({ fixtureId: 't1', channels: { masterDimmer: 200, strobeChannel: 240 } }),
      [template()],
    )

    expect(channels.masterDimmer).toBe(200)
    expect(channels.red).toBe(201)
  })

  it('serves the light persisted channels when its template is gone', () => {
    const orphan = light({ fixtureId: 'missing' })

    expect(getTemplateAlignedChannels(orphan, [template()])).toEqual({
      masterDimmer: 10,
      red: 11,
      green: 12,
      blue: 13,
    })
  })

  it('gives an unplaced light every channel at 0 when its template is gone', () => {
    const orphan = light({ fixtureId: 'missing', unplaced: true })

    expect(getTemplateAlignedChannels(orphan, [template()])).toEqual({
      masterDimmer: 0,
      red: 0,
      green: 0,
      blue: 0,
    })
  })

  it('gives a light with no master every channel at 0 when its template is gone', () => {
    const orphan = light({
      fixtureId: 'missing',
      channels: { masterDimmer: 0, red: 1, green: 2, blue: 3 },
    })

    expect(getTemplateAlignedChannels(orphan, [template()])).toEqual({
      masterDimmer: 0,
      red: 0,
      green: 0,
      blue: 0,
    })
  })
})

describe('getTemplateAlignedExtraChannels', () => {
  const white: ExtraChannel[] = [{ type: 'white', channel: 5 }]

  it('moves an extra channel with the light master dimmer', () => {
    const extras = getTemplateAlignedExtraChannels(light(), [template({ extraChannels: white })])

    expect(extras).toEqual([{ type: 'white', channel: 14 }])
  })

  it('is empty when the template has no extras', () => {
    expect(getTemplateAlignedExtraChannels(light(), [template()])).toEqual([])
  })

  it('serves the light persisted extras when its template is gone', () => {
    const orphan = light({ fixtureId: 'missing', extraChannels: white })

    expect(getTemplateAlignedExtraChannels(orphan, [template()])).toEqual(white)
  })

  it('gives a light with no master its extras at 0 when its template is gone', () => {
    const orphan = light({
      fixtureId: 'missing',
      channels: { masterDimmer: 0, red: 1, green: 2, blue: 3 },
      extraChannels: [{ type: 'fixed', channel: 4, value: 200 }],
    })

    expect(getTemplateAlignedExtraChannels(orphan, [template()])).toEqual([
      { type: 'fixed', channel: 0, value: 200 },
    ])
  })
})

describe('buildConsoleFixedSeed', () => {
  const fixedAt = (channel: number, value?: number): ExtraChannel[] => [
    { type: 'fixed', channel, value },
  ]
  const rgbAt = (masterDimmer: number): RgbDmxChannels => ({
    masterDimmer,
    red: masterDimmer + 1,
    green: masterDimmer + 2,
    blue: masterDimmer + 3,
  })

  it('seeds a pinned channel from every group of the rig', () => {
    const templates = [
      template({ id: 'front', extraChannels: fixedAt(5, 200) }),
      template({ id: 'back', extraChannels: fixedAt(6, 100) }),
      template({ id: 'strobe', extraChannels: fixedAt(7, 50) }),
    ]
    const config = layout({
      frontLights: [light({ fixtureId: 'front', channels: rgbAt(1) })],
      backLights: [light({ fixtureId: 'back', channels: rgbAt(1) })],
      strobeLights: [light({ fixtureId: 'strobe', channels: rgbAt(1) })],
    })

    expect(buildConsoleFixedSeed(config, templates)).toEqual({ 5: 200, 6: 100, 7: 50 })
  })

  it('leaves colour extras out, since only a pinned channel holds a constant', () => {
    const templates = [template({ extraChannels: [{ type: 'white', channel: 5 }] })]
    const config = layout({
      frontLights: [light({ channels: rgbAt(1) })],
    })

    expect(buildConsoleFixedSeed(config, templates)).toEqual({})
  })

  it('treats a pinned channel with no value as zero', () => {
    const templates = [template({ extraChannels: fixedAt(5) })]
    const config = layout({
      frontLights: [light({ channels: rgbAt(1) })],
    })

    expect(buildConsoleFixedSeed(config, templates)).toEqual({ 5: 0 })
  })

  it('clamps a value to the DMX range', () => {
    const templates = [
      template({ id: 'hi', extraChannels: fixedAt(5, 999) }),
      template({ id: 'lo', extraChannels: fixedAt(6, -20) }),
    ]
    const config = layout({
      frontLights: [
        light({ id: 'a', fixtureId: 'hi', channels: rgbAt(1) }),
        light({ id: 'b', fixtureId: 'lo', channels: rgbAt(1) }),
      ],
    })

    expect(buildConsoleFixedSeed(config, templates)).toEqual({ 5: 255, 6: 0 })
  })

  it('skips a channel that lands outside the universe', () => {
    const templates = [template({ extraChannels: fixedAt(5, 200) })]
    const config = layout({
      frontLights: [light({ channels: rgbAt(600) })],
    })

    expect(buildConsoleFixedSeed(config, templates)).toEqual({})
  })
})

describe('getEffectiveChannelEntries', () => {
  it('orders the channels the way the console lists them', () => {
    const mh: DmxFixture = {
      ...template(),
      fixture: FixtureTypes.RGBMH,
      channels: {
        masterDimmer: 1,
        pan: 5,
        tilt: 6,
        red: 2,
        green: 3,
        blue: 4,
      },
    }

    const names = getEffectiveChannelEntries(light(), [mh]).map(([name]) => name)

    expect(names).toEqual(['masterDimmer', 'red', 'green', 'blue', 'pan', 'tilt'])
  })

  it('lets an override stand in for the resolved number', () => {
    const entries = getEffectiveChannelEntries(light(), [template()], { red: 240 })

    expect(Object.fromEntries(entries).red).toBe(240)
  })
})

describe('lightOnChannel', () => {
  const second = light({
    id: 'l2',
    name: 'Second',
    channels: { masterDimmer: 20, red: 21, green: 22, blue: 23 },
  })
  const config = layout({ frontLights: [light()], backLights: [second] })
  const movingRed = { lightId: 'l1', channelName: 'red' }

  it('names the light on a channel', () => {
    expect(lightOnChannel(config, [template()], {}, 22, movingRed)?.name).toBe('Second')
  })

  it('finds nothing on a free channel', () => {
    expect(lightOnChannel(config, [template()], {}, 40, movingRed)).toBeNull()
  })

  it('leaves out the channel being moved but counts the rest of its light', () => {
    expect(lightOnChannel(config, [template()], {}, 11, movingRed)).toBeNull()
    expect(lightOnChannel(config, [template()], {}, 12, movingRed)?.name).toBe('PAR')
  })

  it('counts a remapped channel where it is now', () => {
    const overrides = { l2: { green: 40 } }
    expect(lightOnChannel(config, [template()], overrides, 40, movingRed)?.name).toBe('Second')
    expect(lightOnChannel(config, [template()], overrides, 22, movingRed)).toBeNull()
  })

  it('counts an added channel', () => {
    const withExtra = template({ extraChannels: [{ type: 'white', channel: 5 }] })
    expect(lightOnChannel(config, [withExtra], {}, 24, movingRed)?.name).toBe('Second')
  })
})

describe('isLightModified', () => {
  it('is false with no overrides', () => {
    expect(isLightModified(light(), [template()])).toBe(false)
  })

  it('is false when an override matches the resolved number', () => {
    expect(isLightModified(light(), [template()], { red: 11 })).toBe(false)
  })

  it('is true when an override differs', () => {
    expect(isLightModified(light(), [template()], { red: 240 })).toBe(true)
  })
})

describe('channel naming and kinds', () => {
  it.each([
    ['md', 'MasterDimmer'],
    ['masterDimmer', 'MasterDimmer'],
    ['strobeChannel', 'Strobe Speed'],
    ['red', 'red'],
  ])('labels %s as %s', (name, label) => {
    expect(channelLabel(name)).toBe(label)
  })

  it('sorts the master dimmer first and an unknown channel last', () => {
    expect(channelSortKey('md')).toBe(0)
    expect(channelSortKey('masterDimmer')).toBe(0)
    expect(channelSortKey('mystery')).toBeGreaterThan(channelSortKey('tilt'))
  })

  it.each([
    ['pan', true],
    ['tilt', true],
    ['red', false],
  ])('reports %s as a pan/tilt channel: %s', (name, expected) => {
    expect(isPanTiltChannelName(name)).toBe(expected)
  })

  it.each([
    [FixtureTypes.RGBMH, true],
    [FixtureTypes.RGB, false],
    [FixtureTypes.STROBE, false],
  ])('reports %s as a moving head: %s', (fixture, expected) => {
    expect(isMovingHeadFixture(fixture)).toBe(expected)
  })
})
