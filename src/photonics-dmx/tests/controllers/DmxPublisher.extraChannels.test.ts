/**
 * Extra-channel DmxPublisher tests.
 *
 * Covers the substitution colour mixer wired into the publish path:
 *  - A plain RGB fixture (no extras) produces the same buffer as before the feature existed.
 *  - The built-in RGBW white channel is now driven (white = min(r,g,b), reduced RGB).
 *  - Added colour channels (amber/uv) and duplicate red banks receive the mixed values on both the
 *    wire and IPC buffers.
 *  - `fixed` channels publish on every frame, including all-black frames and for fixtures no cue
 *    has addressed, and go to 0 on shutdown blackout.
 *  - Out-of-range extra channels are skipped and logged once.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxRig,
  type ExtraChannel,
  type RGBIO,
} from '../../types'

function rgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...overrides }
}

function makeMockSender(ipc = false): {
  send: jest.Mock<(slotId: string, buffer: Record<number, number>) => Promise<void>>
  getEnabledWireSenders: () => string[]
  isIpcEnabled: () => boolean
} {
  return {
    send: jest.fn<(slotId: string, buffer: Record<number, number>) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    getEnabledWireSenders: () => ['sacn'],
    isIpcEnabled: () => ipc,
  }
}

interface LightSpec {
  id: string
  fixture: FixtureTypes
  channels: Record<string, number>
  extraChannels?: ExtraChannel[]
  isStrobeEnabled?: boolean
  group?: 'front' | 'strobe'
}

function makeRig(lights: LightSpec[]): DmxRig {
  const front = lights
    .filter((l) => (l.group ?? 'front') === 'front')
    .map((l) => ({
      id: l.id,
      fixtureId: `tpl-${l.id}`,
      position: 1,
      name: l.id,
      label: l.id,
      fixture: l.fixture,
      isStrobeEnabled: l.isStrobeEnabled ?? false,
      group: 'front',
      universe: 1,
      mount: 'floor' as const,
      channels: l.channels as unknown as DmxRig['config']['frontLights'][number]['channels'],
      ...(l.extraChannels ? { extraChannels: l.extraChannels } : {}),
    }))
  const strobe = lights
    .filter((l) => l.group === 'strobe')
    .map((l) => ({
      id: l.id,
      fixtureId: `tpl-${l.id}`,
      position: 1,
      name: l.id,
      label: l.id,
      fixture: l.fixture,
      isStrobeEnabled: l.isStrobeEnabled ?? false,
      group: 'strobe',
      universe: 1,
      mount: 'floor' as const,
      channels: l.channels as unknown as DmxRig['config']['frontLights'][number]['channels'],
      ...(l.extraChannels ? { extraChannels: l.extraChannels } : {}),
    }))
  return {
    id: 'rig-1',
    name: 'Rig',
    active: true,
    config: {
      numLights: front.length,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: front as unknown as DmxRig['config']['frontLights'],
      backLights: [],
      strobeLights: strobe as unknown as DmxRig['config']['strobeLights'],
    },
  }
}

function setup(lights: LightSpec[]): {
  publisher: DmxPublisher
  sender: ReturnType<typeof makeMockSender>
  lastWire(): Record<number, number>
} {
  const sender = makeMockSender()
  const lsm = new LightStateManager()
  const strobe = new StrobeStateManager()
  const publisher = new DmxPublisher(sender as unknown as SenderManager, lsm, strobe)
  publisher.updateActiveRigs([makeRig(lights)])
  return {
    publisher,
    sender,
    lastWire(): Record<number, number> {
      const calls = sender.send.mock.calls
      return calls[calls.length - 1]![1] as Record<number, number>
    },
  }
}

const RGB = { masterDimmer: 1, red: 2, green: 3, blue: 4 }
const RGBW = { masterDimmer: 1, red: 2, green: 3, blue: 4, white: 5 }

describe('DmxPublisher extra channels', () => {
  it('leaves a plain RGB fixture bit-for-bit unchanged', () => {
    const ctx = setup([{ id: 'l1', fixture: FixtureTypes.RGB, channels: RGB }])
    ctx.publisher.publish(
      new Map([['l1', rgbio({ red: 200, green: 100, blue: 50, intensity: 180 })]]),
    )
    const buf = ctx.lastWire()
    expect(buf[1]).toBe(180) // masterDimmer = intensity
    expect(buf[2]).toBe(200)
    expect(buf[3]).toBe(100)
    expect(buf[4]).toBe(50)
    expect(Object.keys(buf).sort()).toEqual(['1', '2', '3', '4'])
  })

  it('drives the built-in RGBW white channel with substitution (sanctioned change)', () => {
    const ctx = setup([{ id: 'l1', fixture: FixtureTypes.RGBW, channels: RGBW }])
    ctx.publisher.publish(
      new Map([['l1', rgbio({ red: 255, green: 191, blue: 64, intensity: 255 })]]),
    )
    const buf = ctx.lastWire()
    // Vector #1: white=64, red=191, green=127, blue=0. (Previously white was never written.)
    expect(buf[5]).toBe(64)
    expect(buf[2]).toBe(191)
    expect(buf[3]).toBe(127)
    expect(buf[4]).toBe(0)
    expect(buf[1]).toBe(255)
  })

  it('writes an added amber channel and reduces RGB accordingly', () => {
    const ctx = setup([
      {
        id: 'l1',
        fixture: FixtureTypes.RGB,
        channels: RGB,
        extraChannels: [{ type: 'amber', channel: 5 }],
      },
    ])
    ctx.publisher.publish(
      new Map([['l1', rgbio({ red: 255, green: 191, blue: 0, intensity: 255 })]]),
    )
    const buf = ctx.lastWire()
    expect(buf[5]).toBe(255) // amber
    expect(buf[2]).toBe(0)
    expect(buf[3]).toBe(0)
    expect(buf[4]).toBe(0)
  })

  it('gives duplicate red banks identical values', () => {
    const ctx = setup([
      {
        id: 'l1',
        fixture: FixtureTypes.RGB,
        channels: RGB,
        extraChannels: [
          { type: 'amber', channel: 5 },
          { type: 'red', channel: 6 },
          { type: 'red', channel: 7 },
        ],
      },
    ])
    ctx.publisher.publish(
      new Map([['l1', rgbio({ red: 255, green: 127, blue: 0, intensity: 255 })]]),
    )
    const buf = ctx.lastWire()
    expect(buf[5]).toBe(169) // amber
    expect(buf[2]).toBe(86) // named red
    expect(buf[6]).toBe(86)
    expect(buf[7]).toBe(86)
  })

  it('writes a fixed channel on an all-black frame', () => {
    const ctx = setup([
      {
        id: 'l1',
        fixture: FixtureTypes.RGB,
        channels: RGB,
        extraChannels: [{ type: 'fixed', channel: 5, value: 42 }],
      },
    ])
    ctx.publisher.publish(new Map([['l1', rgbio()]]))
    expect(ctx.lastWire()[5]).toBe(42)
  })

  it('emits a fixed channel for a strobe-group light no cue addressed', () => {
    // Strobe-group light with isStrobeEnabled false is excluded from cue targeting, so it is never
    // in the states map — its fixed channel must still publish via the unvisited-fixture pass.
    const ctx = setup([
      { id: 'l1', fixture: FixtureTypes.RGB, channels: RGB },
      {
        id: 'sg',
        fixture: FixtureTypes.RGB,
        channels: { masterDimmer: 10, red: 11, green: 12, blue: 13 },
        extraChannels: [{ type: 'fixed', channel: 14, value: 77 }],
        group: 'strobe',
      },
    ])
    ctx.publisher.publish(new Map([['l1', rgbio({ red: 100, intensity: 100 })]]))
    expect(ctx.lastWire()[14]).toBe(77)
  })

  it('skips an out-of-range extra channel and logs once', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = setup([
      {
        id: 'l1',
        fixture: FixtureTypes.RGB,
        channels: RGB,
        extraChannels: [{ type: 'amber', channel: 600 }],
      },
    ])
    ctx.publisher.publish(new Map([['l1', rgbio({ red: 255, green: 191, intensity: 255 })]]))
    ctx.publisher.publish(new Map([['l1', rgbio({ red: 255, green: 191, intensity: 255 })]]))
    const buf = ctx.lastWire()
    // No buffer key outside 1–512.
    expect(Object.keys(buf).every((k) => Number(k) >= 1 && Number(k) <= 512)).toBe(true)
    expect(buf[600]).toBeUndefined()
    // Colour still reaches the named channels — an unusable extra costs nothing else.
    expect(buf[2]).toBe(255)
    expect(buf[3]).toBe(191)
    const messages = warn.mock.calls.map((c) => c.join(' ')).filter((m) => m.includes('l1'))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('invalid extra channels')
    warn.mockRestore()
  })

  it('reports invalid extras on a fixture no cue addressed', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = setup([
      { id: 'l1', fixture: FixtureTypes.RGB, channels: RGB },
      {
        id: 'sg',
        fixture: FixtureTypes.RGB,
        channels: { masterDimmer: 10, red: 11, green: 12, blue: 13 },
        extraChannels: [{ type: 'fixed', channel: 600, value: 77 }],
        group: 'strobe',
      },
    ])
    ctx.publisher.publish(new Map([['l1', rgbio({ red: 100, intensity: 100 })]]))
    ctx.publisher.publish(new Map([['l1', rgbio({ red: 100, intensity: 100 })]]))
    const buf = ctx.lastWire()
    expect(buf[600]).toBeUndefined()
    const messages = warn.mock.calls.map((c) => c.join(' ')).filter((m) => m.includes('sg'))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('invalid extra channels')
    warn.mockRestore()
  })

  it('lets a fixed channel win a collision with its own base channel', () => {
    // The editor warns about duplicate numbers but does not block them, so this reaches the wire.
    // Fixed writes land after the base channels, matching the unvisited pass and console seeds.
    const ctx = setup([
      {
        id: 'l1',
        fixture: FixtureTypes.RGB,
        channels: RGB,
        extraChannels: [{ type: 'fixed', channel: 1, value: 42 }],
      },
    ])
    ctx.publisher.publish(new Map([['l1', rgbio({ red: 200, intensity: 180 })]]))
    expect(ctx.lastWire()[1]).toBe(42)
  })

  it('zeroes a fixed channel on shutdown blackout', () => {
    const ctx = setup([
      {
        id: 'l1',
        fixture: FixtureTypes.RGB,
        channels: RGB,
        extraChannels: [{ type: 'fixed', channel: 5, value: 42 }],
      },
    ])
    ctx.publisher.publish(new Map([['l1', rgbio()]]))
    expect(ctx.lastWire()[5]).toBe(42)
    ctx.publisher.shutdown()
    const buf = ctx.lastWire()
    expect(buf[5]).toBe(0)
  })

  it('rebuilds the plan when a rig swap replaces the fixture object', () => {
    const ctx = setup([
      {
        id: 'l1',
        fixture: FixtureTypes.RGB,
        channels: RGB,
        extraChannels: [{ type: 'amber', channel: 5 }],
      },
    ])
    ctx.publisher.publish(new Map([['l1', rgbio({ red: 255, green: 191, intensity: 255 })]]))
    expect(ctx.lastWire()[5]).toBe(255)
    // Swap to a config whose fixture object has no extras — identity change → plan rebuild → null.
    ctx.publisher.updateActiveRigs([
      makeRig([{ id: 'l1', fixture: FixtureTypes.RGB, channels: RGB }]),
    ])
    ctx.publisher.publish(new Map([['l1', rgbio({ red: 255, green: 191, intensity: 255 })]]))
    const buf = ctx.lastWire()
    expect(buf[5]).toBeUndefined()
    expect(buf[2]).toBe(255) // full red again (legacy path)
  })
})
