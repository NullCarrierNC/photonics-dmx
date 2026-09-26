import { describe, expect, it } from '@jest/globals'
import {
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
} from '../types'
import { loadDmxFixture, loadDmxLight, parseDmxFixture, parseDmxLight } from './fixtureParsing'

const rgb = (fields: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'tpl-1',
  position: 0,
  fixture: 'rgb',
  label: 'RGB',
  name: 'RGB',
  isStrobeEnabled: false,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
  ...fields,
})

function parse(raw: unknown) {
  const faults: string[] = []
  const fixture = parseDmxFixture(raw, 'lights[0]', (message) => faults.push(message))
  return { fixture, faults }
}

describe('parseDmxFixture', () => {
  it('reads a sound moving head as it is', () => {
    const raw = rgb({
      fixture: 'rgb/mh',
      group: 'front',
      universe: 2,
      mount: 'ceiling',
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6, strobeChannel: 7 },
      config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG },
      strobeValues: { ...DEFAULT_STROBE_CHANNEL_VALUES },
      extraChannels: [{ type: 'fixed', channel: 8, value: 20 }],
      brightnessScaling: { red: 80 },
    })

    expect(parse(raw)).toEqual({ fixture: raw, faults: [] })
  })

  it('refuses a retired fixture type', () => {
    expect(parse(rgb({ fixture: 'rgbw' })).fixture).toBeNull()
  })

  it('reports and drops a field no fixture has', () => {
    const { fixture, faults } = parse(rgb({ hasStrobeChannel: true }))

    expect(fixture).toEqual(rgb())
    expect(faults).toEqual(['lights[0].hasStrobeChannel is not a fixture field'])
  })

  it('reports an unusable channel number and leaves it unassigned', () => {
    const { fixture, faults } = parse(
      rgb({ channels: { masterDimmer: 1, red: 2, green: 700, blue: 4 } }),
    )

    expect(fixture?.channels).toEqual({ masterDimmer: 1, red: 2, green: 0, blue: 4 })
    expect(faults).toEqual([
      'lights[0].channels.green must be an integer DMX channel between 0 and 512',
    ])
  })

  it('keeps the usable strobe values and puts only the bad one back to its default', () => {
    const { fixture, faults } = parse(rgb({ strobeValues: { slow: 1, medium: 2, fast: 3 } }))

    expect(fixture?.strobeValues).toEqual({
      slow: 1,
      medium: 2,
      fast: 3,
      fastest: DEFAULT_STROBE_CHANNEL_VALUES.fastest,
    })
    expect(faults).toEqual(['lights[0].strobeValues.fastest must be an integer between 0 and 255'])
  })

  it('reports a config key no fixture config has', () => {
    const { fixture, faults } = parse(
      rgb({
        fixture: 'rgb/mh',
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
        config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG, spin: true },
      }),
    )

    expect(fixture?.config).toEqual(DEFAULT_MOVING_HEAD_FIXTURE_CONFIG)
    expect(faults).toEqual(['lights[0].config.spin is not a fixture config field'])
  })

  it('tells a dropped key apart from a value put back to its default', () => {
    const reports: Array<[string, string]> = []
    parseDmxFixture(
      rgb({ hasStrobeChannel: true, channels: { masterDimmer: 1, red: 2, green: 700, blue: 4 } }),
      'lights[0]',
      (message, kind) => reports.push([message, kind]),
    )

    expect(reports).toEqual([
      ['lights[0].channels.green must be an integer DMX channel between 0 and 512', 'reset'],
      ['lights[0].hasStrobeChannel is not a fixture field', 'dropped'],
    ])
  })

  it('drops an unusable extra channel and keeps the rest', () => {
    const { fixture, faults } = parse(
      rgb({
        extraChannels: [
          { type: 'infrared', channel: 5 },
          { type: 'amber', channel: 6 },
        ],
      }),
    )

    expect(fixture?.extraChannels).toEqual([{ type: 'amber', channel: 6 }])
    expect(faults).toEqual(['lights[0].extraChannels[0].type must be a valid extra-channel type'])
  })

  it('completes a partial moving-head config and reports a value of the wrong kind', () => {
    const { fixture, faults } = parse(
      rgb({
        fixture: 'rgb/mh',
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
        config: { panRangeDeg: 360, invertPan: 'yes' },
      }),
    )

    expect(fixture?.config).toEqual({
      ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
      panRangeDeg: 360,
      panStageDeg: 180,
    })
    expect(faults).toEqual(['lights[0].config.invertPan must be true or false'])
  })

  it('reports a config that is an object of another kind, such as a date', () => {
    const { fixture, faults } = parse(
      rgb({
        fixture: 'rgb/mh',
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
        config: new Date(0),
      }),
    )

    expect(fixture?.config).toBeUndefined()
    expect(faults).toEqual(['lights[0].config must be a plain object'])
  })

  it('reads a null or empty id as a template with no id, and any other kind as a fault', () => {
    expect(parse(rgb({ id: null }))).toEqual({ fixture: rgb({ id: null }), faults: [] })
    expect(parse(rgb({ id: '' }))).toEqual({ fixture: rgb({ id: null }), faults: [] })
    expect(parse(rgb({ id: 7 })).faults).toEqual(['lights[0].id must be a string or null'])
  })
})

describe('parseDmxLight', () => {
  it('reads the template id a rig light came from', () => {
    const faults: string[] = []
    const light = parseDmxLight(rgb({ fixtureId: 'tpl-1' }), 'frontLights[0]', (m) =>
      faults.push(m),
    )

    expect(light).toEqual(rgb({ fixtureId: 'tpl-1' }))
    expect(faults).toEqual([])
  })
})

describe('loading a stored fixture', () => {
  it('drops the strobeMode key older layout editors wrote, without a fault', () => {
    const faults: string[] = []
    const light = loadDmxLight(
      rgb({ fixtureId: 'tpl-1', strobeMode: 'disabled' }),
      'frontLights[0]',
      (m) => faults.push(m),
    )

    expect(light).toEqual(rgb({ fixtureId: 'tpl-1' }))
    expect(faults).toEqual([])
  })

  it('brings a legacy rgb/s rig light onto rgb with a strobe channel and default speeds', () => {
    const faults: string[] = []
    const light = loadDmxLight(
      rgb({
        fixture: 'rgb/s',
        fixtureId: 'tpl-rgbs',
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeSpeed: 6 },
      }),
      'frontLights[0]',
      (m) => faults.push(m),
    )

    expect(light).toMatchObject({
      fixture: FixtureTypes.RGB,
      channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 6 },
      strobeValues: DEFAULT_STROBE_CHANNEL_VALUES,
    })
    expect(faults).toEqual([])
  })

  it('returns null for a fixture type no build wrote', () => {
    const faults: string[] = []
    expect(loadDmxFixture(rgb({ fixture: 'laser' }), 'lights[0]', (m) => faults.push(m))).toBeNull()
    expect(faults).toEqual(["lights[0].fixture 'laser' is not a fixture type"])
  })
})
