/**
 * Fixture channel addressing: where a light's values land, how they are checked and scaled on the
 * way, and how each fault reports. The publisher suites cover it inside whole frames.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { FixtureChannelWriter, type LightOutput } from '../../controllers/fixtureChannelWriter'
import {
  resetLogConfiguration,
  setLogSink,
  setMinLogLevel,
  type LogEntry,
} from '../../../shared/logger'
import { FixtureTypes, type DmxFixture, type ExtraChannel } from '../../types'

function fixture(overrides: Partial<DmxFixture> = {}): DmxFixture {
  return {
    id: 'fixture-1',
    position: 1,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as unknown as DmxFixture['channels'],
    ...overrides,
  }
}

function fixed(channel: number, value: number): ExtraChannel {
  return { type: 'fixed', channel, value }
}

function output(overrides: Partial<LightOutput> = {}): LightOutput {
  return { red: 0, green: 0, blue: 0, intensity: 255, pan: 0, tilt: 0, ...overrides }
}

/** A writer already pointed at one wire buffer and, optionally, an IPC buffer. */
function writerFor(
  wire: Record<number, number>,
  ipc: Record<number, number> | null = null,
): FixtureChannelWriter {
  const writer = new FixtureChannelWriter()
  writer.beginRig([wire], ipc)
  return writer
}

let entries: LogEntry[] = []

beforeEach(() => {
  entries = []
  setMinLogLevel('debug')
  setLogSink((entry) => {
    entries.push(entry)
  })
})

afterEach(() => resetLogConfiguration())

function reported(level: LogEntry['level']): string[] {
  return entries.filter((entry) => entry.level === level).map((entry) => entry.message)
}

describe('FixtureChannelWriter', () => {
  it('writes each channel to every wire buffer and the IPC buffer', () => {
    const writer = new FixtureChannelWriter()
    const wireA: Record<number, number> = {}
    const wireB: Record<number, number> = {}
    const ipc: Record<number, number> = {}
    writer.beginRig([wireA, wireB], ipc)

    writer.writeLight('l1', fixture(), output({ red: 10, green: 20, blue: 30 }), null, false)

    const expected = { 1: 255, 2: 10, 3: 20, 4: 30 }
    expect(wireA).toEqual(expected)
    expect(wireB).toEqual(expected)
    expect(ipc).toEqual(expected)
  })

  it('writes only to the rig begun last', () => {
    const first: Record<number, number> = {}
    const second: Record<number, number> = {}
    const writer = writerFor(first)
    writer.beginRig([second], null)

    writer.writeLight('l1', fixture(), output({ red: 10 }), null, false)

    expect(first).toEqual({})
    expect(second[2]).toBe(10)
  })

  it('clamps values to a byte', () => {
    const wire: Record<number, number> = {}
    writerFor(wire).writeLight('l1', fixture(), output({ red: 300, green: -5 }), null, false)
    expect(wire[2]).toBe(255)
    expect(wire[3]).toBe(0)
  })

  it('scales the wire copy and keeps the IPC copy at cue intent', () => {
    const wire: Record<number, number> = {}
    const ipc: Record<number, number> = {}
    const scaled = fixture({ brightnessScaling: { green: 50 } })

    writerFor(wire, ipc).writeLight('l1', scaled, output({ green: 200 }), null, false)

    expect(wire[3]).toBe(100)
    expect(ipc[3]).toBe(200)
  })

  it('writes fixed channels last and unscaled', () => {
    const wire: Record<number, number> = {}
    const ipc: Record<number, number> = {}
    const pinned = fixture({ brightnessScaling: { green: 50 }, extraChannels: [fixed(3, 7)] })

    writerFor(wire, ipc).writeLight('l1', pinned, output({ green: 200 }), null, false)

    expect(wire[3]).toBe(7)
    expect(ipc[3]).toBe(7)
  })

  it('skips an out-of-range channel and reports it once per light', () => {
    const wire: Record<number, number> = {}
    const writer = writerFor(wire)
    const unassigned = fixture({
      channels: { masterDimmer: 0, red: 2, green: 3, blue: 4 } as unknown as DmxFixture['channels'],
    })

    writer.writeLight('l1', unassigned, output(), null, false)
    writer.writeLight('l1', unassigned, output(), null, false)
    writer.writeLight('l2', unassigned, output(), null, false)

    expect(Object.keys(wire)).toEqual(['2', '3', '4'])
    expect(reported('warn').map((message) => message.split(':')[0])).toEqual([
      'Light l1',
      'Light l2',
    ])
  })

  it('reports a fault again after resetFaultReports', () => {
    const writer = writerFor({})
    const unassigned = fixture({
      channels: { masterDimmer: 0, red: 2, green: 3, blue: 4 } as unknown as DmxFixture['channels'],
    })

    writer.writeLight('l1', unassigned, output(), null, false)
    writer.writeLight('l1', unassigned, output(), null, false)
    expect(reported('warn')).toHaveLength(1)

    writer.resetFaultReports()
    writer.writeLight('l1', unassigned, output(), null, false)
    expect(reported('warn')).toHaveLength(2)
  })

  it('writes nothing for a fixture type the cast does not know and reports it once', () => {
    const wire: Record<number, number> = {}
    const writer = writerFor(wire)
    const unknownType = fixture({ fixture: 'bogus' as unknown as FixtureTypes })

    writer.writeLight('l1', unknownType, output({ red: 10 }), null, false)
    writer.writeLight('l1', unknownType, output({ red: 10 }), null, false)

    expect(wire).toEqual({})
    expect(reported('error')).toHaveLength(1)
  })

  it('writes fixed channels for planned fixtures no light state reached', () => {
    const wire: Record<number, number> = {}
    const fixtures = new Map<string, DmxFixture>([
      ['visited', fixture({ extraChannels: [fixed(10, 5)] })],
      ['unvisited', fixture({ extraChannels: [fixed(11, 6)] })],
      ['unplanned', fixture()],
    ])

    writerFor(wire).writeUnvisited(fixtures, new Set(['visited']), null)

    expect(wire).toEqual({ 11: 6 })
  })
})
