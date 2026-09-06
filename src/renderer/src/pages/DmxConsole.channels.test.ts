/** @jest-environment jsdom */
/**
 * The console's channel resolution: which channels a rig light shows, what numbers they carry, and
 * which of them the manual buffer seeds before the user touches anything.
 *
 * The shape comes from the live fixture template, so a channel added to a template in MyLights
 * appears here without the light being re-picked. The numbers come from the offset-from-master
 * model the rig editor uses, with a persisted per-channel value winning where one exists.
 */
import { describe, expect, it, jest } from '@jest/globals'

// The console page mounts the 3D preview, which pulls in THREE and a WebGL canvas that jsdom does
// not provide. The channel helpers under test never reach it.
jest.mock('../components/LightsDmxPreview3D', () => ({
  __esModule: true,
  default: () => null,
}))

import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxFixture,
  type DmxLight,
  type ExtraChannel,
  type LightingConfiguration,
} from '../../../photonics-dmx/types'
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
} from './DmxConsole'

/** An RGB template whose colour channels sit one, two and three above its master dimmer. */
function template(overrides: Partial<DmxFixture> = {}): DmxFixture {
  return {
    id: 't1',
    position: 0,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    group: '',
    universe: 1,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as DmxFixture['channels'],
    ...overrides,
  }
}

function light(overrides: Partial<DmxLight> = {}): DmxLight {
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
    channels: { masterDimmer: 10, red: 11, green: 12, blue: 13 } as DmxLight['channels'],
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
      } as DmxFixture['channels'],
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
      } as DmxFixture['channels'],
    })

    const channels = getTemplateAlignedChannels(light(), [withStrobe])

    // The light's master sits at 10 and the template puts strobe four above its own master.
    expect(channels.strobeChannel).toBe(14)
  })

  it('keeps a number the light already carries', () => {
    const channels = getTemplateAlignedChannels(
      light({
        channels: { masterDimmer: 10, red: 99, green: 12, blue: 13 } as DmxLight['channels'],
      }),
      [template()],
    )

    expect(channels.red).toBe(99)
  })

  it('reads the master dimmer from the light', () => {
    const channels = getTemplateAlignedChannels(
      light({ channels: { masterDimmer: 200 } as DmxLight['channels'] }),
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
})

describe('buildConsoleFixedSeed', () => {
  const fixedAt = (channel: number, value?: number): ExtraChannel[] => [
    { type: 'fixed', channel, value },
  ]

  it('seeds a pinned channel from every group of the rig', () => {
    const templates = [
      template({ id: 'front', extraChannels: fixedAt(5, 200) }),
      template({ id: 'back', extraChannels: fixedAt(6, 100) }),
      template({ id: 'strobe', extraChannels: fixedAt(7, 50) }),
    ]
    const config = layout({
      frontLights: [
        light({ fixtureId: 'front', channels: { masterDimmer: 1 } as DmxLight['channels'] }),
      ],
      backLights: [
        light({ fixtureId: 'back', channels: { masterDimmer: 1 } as DmxLight['channels'] }),
      ],
      strobeLights: [
        light({ fixtureId: 'strobe', channels: { masterDimmer: 1 } as DmxLight['channels'] }),
      ],
    })

    expect(buildConsoleFixedSeed(config, templates)).toEqual({ 5: 200, 6: 100, 7: 50 })
  })

  it('leaves colour extras out, since only a pinned channel holds a constant', () => {
    const templates = [template({ extraChannels: [{ type: 'white', channel: 5 }] })]
    const config = layout({
      frontLights: [light({ channels: { masterDimmer: 1 } as DmxLight['channels'] })],
    })

    expect(buildConsoleFixedSeed(config, templates)).toEqual({})
  })

  it('treats a pinned channel with no value as zero', () => {
    const templates = [template({ extraChannels: fixedAt(5) })]
    const config = layout({
      frontLights: [light({ channels: { masterDimmer: 1 } as DmxLight['channels'] })],
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
        light({ id: 'a', fixtureId: 'hi', channels: { masterDimmer: 1 } as DmxLight['channels'] }),
        light({ id: 'b', fixtureId: 'lo', channels: { masterDimmer: 1 } as DmxLight['channels'] }),
      ],
    })

    expect(buildConsoleFixedSeed(config, templates)).toEqual({ 5: 255, 6: 0 })
  })

  it('skips a channel that lands outside the universe', () => {
    const templates = [template({ extraChannels: fixedAt(5, 200) })]
    const config = layout({
      frontLights: [light({ channels: { masterDimmer: 600 } as DmxLight['channels'] })],
    })

    expect(buildConsoleFixedSeed(config, templates)).toEqual({})
  })
})

describe('getEffectiveChannelEntries', () => {
  it('orders the channels the way the console lists them', () => {
    const mh = template({
      fixture: FixtureTypes.RGBMH,
      channels: {
        masterDimmer: 1,
        pan: 5,
        tilt: 6,
        red: 2,
        green: 3,
        blue: 4,
      } as DmxFixture['channels'],
    })

    const names = getEffectiveChannelEntries(light(), [mh]).map(([name]) => name)

    expect(names).toEqual(['masterDimmer', 'red', 'green', 'blue', 'pan', 'tilt'])
  })

  it('lets an override stand in for the resolved number', () => {
    const entries = getEffectiveChannelEntries(light(), [template()], { red: 240 })

    expect(Object.fromEntries(entries).red).toBe(240)
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
