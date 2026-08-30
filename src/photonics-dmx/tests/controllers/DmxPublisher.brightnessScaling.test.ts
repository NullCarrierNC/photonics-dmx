/**
 * Brightness scaling in the publish path. The invariant these exist for: scaling reaches the wire
 * and only the wire, since the preview re-applies it from the IPC buffer and would otherwise double
 * it. Also which channels scale, the mixer path, rounding, and the unscaled case.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import type { DmxValuesPayload } from '../../../shared/ipcTypes'
import {
  ConfigStrobeType,
  FixtureTypes,
  type BrightnessScaling,
  type DmxRig,
  type ExtraChannel,
  type RGBIO,
} from '../../types'

function rgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...overrides }
}

interface MockSender {
  send: jest.Mock<(slotId: string, buffer: Record<number, number>) => Promise<void>>
  sendIpc: jest.Mock<(payload: DmxValuesPayload) => void>
  getEnabledWireSenders: () => string[]
  isIpcEnabled: () => boolean
}

function makeMockSender(ipc = true): MockSender {
  return {
    send: jest.fn<(slotId: string, buffer: Record<number, number>) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    sendIpc: jest.fn<(payload: DmxValuesPayload) => void>(),
    getEnabledWireSenders: () => ['sacn'],
    isIpcEnabled: () => ipc,
  }
}

interface LightSpec {
  id: string
  fixture?: FixtureTypes
  channels: Record<string, number>
  extraChannels?: ExtraChannel[]
  brightnessScaling?: BrightnessScaling
  strobeValues?: { slow: number; medium: number; fast: number; fastest: number }
  isStrobeEnabled?: boolean
}

function makeRig(lights: LightSpec[]): DmxRig {
  const front = lights.map((l) => ({
    id: l.id,
    fixtureId: `tpl-${l.id}`,
    position: 1,
    name: l.id,
    label: l.id,
    fixture: l.fixture ?? FixtureTypes.RGB,
    isStrobeEnabled: l.isStrobeEnabled ?? false,
    group: 'front',
    universe: 1,
    mount: 'floor' as const,
    channels: l.channels as unknown as DmxRig['config']['frontLights'][number]['channels'],
    ...(l.extraChannels ? { extraChannels: l.extraChannels } : {}),
    ...(l.brightnessScaling ? { brightnessScaling: l.brightnessScaling } : {}),
    ...(l.strobeValues ? { strobeValues: l.strobeValues } : {}),
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
      strobeLights: [],
    },
  }
}

function setup(
  lights: LightSpec[],
  strobeManager?: StrobeStateManager,
): {
  publisher: DmxPublisher
  sender: MockSender
  wire(): Record<number, number>
  ipc(): Record<number, number>
} {
  const sender = makeMockSender()
  const publisher = new DmxPublisher(
    sender as unknown as SenderManager,
    new LightStateManager(),
    strobeManager ?? new StrobeStateManager(),
  )
  publisher.updateActiveRigs([makeRig(lights)])
  return {
    publisher,
    sender,
    wire(): Record<number, number> {
      const calls = sender.send.mock.calls
      return calls[calls.length - 1]![1] as Record<number, number>
    },
    ipc(): Record<number, number> {
      const calls = sender.sendIpc.mock.calls
      for (let i = calls.length - 1; i >= 0; i--) {
        const payload = calls[i]![0] as DmxValuesPayload
        if (payload.kind === 'rigs') return payload.rigBuffers['rig-1']!
      }
      throw new Error('no rigs IPC payload was dispatched')
    },
  }
}

const RGB_CHANNELS = { masterDimmer: 1, red: 2, green: 3, blue: 4 }

describe('DmxPublisher brightness scaling', () => {
  it('scales colour channels on the wire while IPC keeps unscaled intent', () => {
    const { publisher, wire, ipc } = setup([
      { id: 'l1', channels: RGB_CHANNELS, brightnessScaling: { green: 80, blue: 50 } },
    ])

    publisher.publish(
      new Map<string, RGBIO>([['l1', rgbio({ red: 200, green: 200, blue: 200, intensity: 255 })]]),
    )

    expect(wire()).toEqual({ 1: 255, 2: 200, 3: 160, 4: 100 })
    expect(ipc()).toEqual({ 1: 255, 2: 200, 3: 200, 4: 200 })
  })

  it('leaves master dimmer, pan and tilt unscaled', () => {
    const { publisher, wire } = setup([
      {
        id: 'mh',
        fixture: FixtureTypes.RGBMH,
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
        brightnessScaling: { red: 50, green: 50, blue: 50 },
      },
    ])

    publisher.publish(
      new Map<string, RGBIO>([
        ['mh', rgbio({ red: 100, green: 100, blue: 100, intensity: 200, pan: 100, tilt: 100 })],
      ]),
    )

    const buffer = wire()
    expect(buffer[1]).toBe(200)
    expect(buffer[2]).toBe(50)
    expect(buffer[5]).toBeGreaterThan(0)
    expect(buffer[6]).toBeGreaterThan(0)
    // Pan/tilt carry position, so a colour trim must not steer the fixture.
    const unscaled = setup([
      {
        id: 'mh',
        fixture: FixtureTypes.RGBMH,
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
      },
    ])
    unscaled.publisher.publish(
      new Map<string, RGBIO>([
        ['mh', rgbio({ red: 100, green: 100, blue: 100, intensity: 200, pan: 100, tilt: 100 })],
      ]),
    )
    expect(buffer[5]).toBe(unscaled.wire()[5])
    expect(buffer[6]).toBe(unscaled.wire()[6])
  })

  it('leaves the hardware strobe-speed channel unscaled', () => {
    const strobeManager = new StrobeStateManager()
    strobeManager.setActive('fast')
    const { publisher, wire } = setup(
      [
        {
          id: 'l1',
          channels: { ...RGB_CHANNELS, strobeChannel: 5 },
          isStrobeEnabled: true,
          strobeValues: { slow: 64, medium: 128, fast: 192, fastest: 255 },
          brightnessScaling: { red: 50, green: 50, blue: 50 },
        },
      ],
      strobeManager,
    )

    publisher.publish(new Map<string, RGBIO>([['l1', rgbio({ red: 200, intensity: 255 })]]))

    expect(wire()[5]).toBe(192)
    expect(wire()[2]).toBe(100)
  })

  it('scales each emitter channel by its own factor through the colour mixer', () => {
    const { publisher, wire, ipc } = setup([
      {
        id: 'l1',
        channels: RGB_CHANNELS,
        // White takes min(r,g,b) under substitution; the residual returns to red/green/blue.
        extraChannels: [{ type: 'white', channel: 5, scale: 50 }],
        brightnessScaling: { red: 80 },
      },
    ])

    publisher.publish(
      new Map<string, RGBIO>([['l1', rgbio({ red: 255, green: 200, blue: 200, intensity: 255 })]]),
    )

    const intent = ipc()
    const scaled = wire()
    expect(scaled[5]).toBe(Math.round(intent[5]! * 0.5))
    expect(scaled[2]).toBe(Math.round(intent[2]! * 0.8))
    // Unscaled emitters in the same plan are untouched.
    expect(scaled[3]).toBe(intent[3])
    expect(scaled[4]).toBe(intent[4])
  })

  it('writes a fixed channel verbatim even when it collides with a scaled colour address', () => {
    const { publisher, wire } = setup([
      {
        id: 'l1',
        channels: RGB_CHANNELS,
        // The fixed write lands last, on the scaled green's address.
        extraChannels: [{ type: 'fixed', channel: 3, value: 200 }],
        brightnessScaling: { green: 25 },
      },
    ])

    publisher.publish(new Map<string, RGBIO>([['l1', rgbio({ green: 255, intensity: 255 })]]))

    expect(wire()[3]).toBe(200)
  })

  it('scaling an unaddressed fixture never scales the fixed channels it publishes', () => {
    const { publisher, wire } = setup([
      { id: 'addressed', channels: RGB_CHANNELS },
      {
        id: 'quiet',
        channels: { masterDimmer: 10, red: 11, green: 12, blue: 13 },
        extraChannels: [{ type: 'fixed', channel: 14, value: 180 }],
        brightnessScaling: { red: 10, green: 10, blue: 10 },
      },
    ])

    publisher.publish(new Map<string, RGBIO>([['addressed', rgbio({ red: 100, intensity: 255 })]]))

    expect(wire()[14]).toBe(180)
  })

  it('rounds to the nearest byte and honours a zero scale', () => {
    const { publisher, wire } = setup([
      {
        id: 'l1',
        channels: RGB_CHANNELS,
        brightnessScaling: { red: 80, green: 33, blue: 0 },
      },
    ])

    publisher.publish(
      new Map<string, RGBIO>([['l1', rgbio({ red: 255, green: 255, blue: 255, intensity: 255 })]]),
    )

    expect(wire()[2]).toBe(204)
    expect(wire()[3]).toBe(84)
    expect(wire()[4]).toBe(0)
  })

  it('publishes identical wire and IPC buffers for an unscaled fixture', () => {
    const { publisher, wire, ipc } = setup([
      { id: 'l1', channels: RGB_CHANNELS, extraChannels: [{ type: 'amber', channel: 5 }] },
    ])

    publisher.publish(
      new Map<string, RGBIO>([['l1', rgbio({ red: 255, green: 180, blue: 40, intensity: 255 })]]),
    )

    expect(wire()).toEqual(ipc())
  })

  it('sends a manual console buffer unscaled', () => {
    const { publisher, sender } = setup([
      { id: 'l1', channels: RGB_CHANNELS, brightnessScaling: { red: 50, green: 50, blue: 50 } },
    ])

    publisher.setManualBuffer({ 1: 255, 2: 255, 3: 255, 4: 255 })

    const buffer = sender.send.mock.calls[sender.send.mock.calls.length - 1]![1]
    expect(buffer).toEqual({ 1: 255, 2: 255, 3: 255, 4: 255 })
  })

  it('picks up a template edit that adds scaling to an already-published fixture', () => {
    const { publisher, wire } = setup([{ id: 'l1', channels: RGB_CHANNELS }])
    const lights = new Map<string, RGBIO>([['l1', rgbio({ red: 200, intensity: 255 })]])

    publisher.publish(lights)
    expect(wire()[2]).toBe(200)

    // Sync replaces the light object, so the memoised map must follow.
    publisher.updateActiveRigs([
      makeRig([{ id: 'l1', channels: RGB_CHANNELS, brightnessScaling: { red: 50 } }]),
    ])
    publisher.publish(lights)
    expect(wire()[2]).toBe(100)
  })
})
