/**
 * Which lights mix with additive white during a strobe, and — the half that matters more — which
 * stay on substitution while a strobe runs elsewhere in the rig. The mixing itself is covered by
 * the vectors in colorChannelMixer.test.ts.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import {
  ConfigStrobeType,
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
  type DmxRig,
  type ExtraChannel,
  type RGBIO,
  type StrobeChannelValues,
} from '../../types'

function rgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...overrides }
}

function makeMockSender(): {
  send: jest.Mock<(slotId: string, buffer: Record<number, number>) => Promise<void>>
  getEnabledWireSenders: () => string[]
  isIpcEnabled: () => boolean
} {
  return {
    send: jest.fn<(slotId: string, buffer: Record<number, number>) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    getEnabledWireSenders: () => ['sacn'],
    isIpcEnabled: () => false,
  }
}

interface LightSpec {
  id: string
  channels: Record<string, number>
  extraChannels?: ExtraChannel[]
  isStrobeEnabled?: boolean
  group?: 'front' | 'strobe'
  fixture?: FixtureTypes
  strobeValues?: StrobeChannelValues
}

function makeLight(spec: LightSpec, group: 'front' | 'strobe'): unknown {
  return {
    id: spec.id,
    fixtureId: `tpl-${spec.id}`,
    position: 1,
    name: spec.id,
    label: spec.id,
    fixture: spec.fixture ?? FixtureTypes.RGB,
    isStrobeEnabled: spec.isStrobeEnabled ?? false,
    group,
    universe: 1,
    mount: 'floor' as const,
    channels: spec.channels,
    ...(spec.extraChannels ? { extraChannels: spec.extraChannels } : {}),
    ...(spec.strobeValues ? { strobeValues: spec.strobeValues } : {}),
  }
}

/** Builds a rig as LightsLayout saves one: a `None` rig has an empty `strobeLights` regardless
 *  of the per-fixture toggles. */
function makeRig(lights: LightSpec[], strobeType = ConfigStrobeType.AllCapable): DmxRig {
  const front = lights
    .filter((l) => (l.group ?? 'front') === 'front')
    .map((l) => makeLight(l, 'front'))
  const strobe =
    strobeType === ConfigStrobeType.None
      ? []
      : lights.filter((l) => l.group === 'strobe').map((l) => makeLight(l, 'strobe'))
  return {
    id: 'rig-1',
    name: 'Rig',
    active: true,
    config: {
      numLights: front.length,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType,
      frontLights: front as unknown as DmxRig['config']['frontLights'],
      backLights: [],
      strobeLights: strobe as unknown as DmxRig['config']['strobeLights'],
    },
  }
}

function setup(
  lights: LightSpec[],
  strobeType = ConfigStrobeType.AllCapable,
): {
  publisher: DmxPublisher
  strobe: StrobeStateManager
  publish(states: Record<string, RGBIO>): Record<number, number>
} {
  const sender = makeMockSender()
  const strobe = new StrobeStateManager()
  const publisher = new DmxPublisher(
    sender as unknown as SenderManager,
    new LightStateManager(),
    strobe,
  )
  publisher.updateActiveRigs([makeRig(lights, strobeType)])
  return {
    publisher,
    strobe,
    publish(states): Record<number, number> {
      publisher.publish(new Map(Object.entries(states)))
      const calls = sender.send.mock.calls
      return calls[calls.length - 1]![1] as Record<number, number>
    },
  }
}

const RGB = { masterDimmer: 1, red: 2, green: 3, blue: 4 }
const WHITE_EXTRA: ExtraChannel[] = [{ type: 'white', channel: 5 }]

/** An RGBW in the strobe group, strobe-enabled. */
const STROBE_RGBW: LightSpec = {
  id: 's1',
  channels: RGB,
  extraChannels: WHITE_EXTRA,
  group: 'strobe',
  isStrobeEnabled: true,
}

const WHITE_FLASH = rgbio({ red: 255, green: 255, blue: 255, intensity: 255 })

describe('DmxPublisher — RGBW strobes drive white and rgb together', () => {
  it('fires every emitter on a strobe-group RGBW while a strobe holds the slot', () => {
    const ctx = setup([STROBE_RGBW])
    ctx.strobe.setActive('fast')
    const buf = ctx.publish({ s1: WHITE_FLASH })
    expect(buf[5]).toBe(255)
    expect([buf[2], buf[3], buf[4]]).toEqual([255, 255, 255])
    expect(buf[1]).toBe(255)
  })

  it('keeps the flash hue — a red strobe does not gain white', () => {
    const ctx = setup([STROBE_RGBW])
    ctx.strobe.setActive('fastest')
    const buf = ctx.publish({ s1: rgbio({ red: 255, intensity: 255 }) })
    expect(buf[5]).toBe(0)
    expect([buf[2], buf[3], buf[4]]).toEqual([255, 0, 0])
  })

  it('substitutes on the same fixture once the strobe releases the slot', () => {
    const ctx = setup([STROBE_RGBW])
    ctx.strobe.setActive('fast')
    expect(ctx.publish({ s1: WHITE_FLASH })[2]).toBe(255)

    ctx.strobe.setActive(null)
    const buf = ctx.publish({ s1: WHITE_FLASH })
    expect(buf[5]).toBe(255)
    expect([buf[2], buf[3], buf[4]]).toEqual([0, 0, 0])
  })

  it('leaves a front-group RGBW substituting in the very frame a strobe runs', () => {
    // One rig, one frame, one colour: only the strobe light goes additive.
    const front: LightSpec = {
      id: 'f1',
      channels: { ...RGB, masterDimmer: 11, red: 12, green: 13, blue: 14 },
      extraChannels: [{ type: 'white', channel: 15 }],
    }
    const ctx = setup([STROBE_RGBW, front])
    ctx.strobe.setActive('medium')
    const buf = ctx.publish({ s1: WHITE_FLASH, f1: WHITE_FLASH })
    expect([buf[5], buf[2], buf[3], buf[4]]).toEqual([255, 255, 255, 255])
    expect([buf[15], buf[12], buf[13], buf[14]]).toEqual([255, 0, 0, 0])
  })

  it('leaves everything substituting on a rig whose strobe mode is None', () => {
    const ctx = setup([{ ...STROBE_RGBW, group: 'front' }], ConfigStrobeType.None)
    ctx.strobe.setActive('fast')
    const buf = ctx.publish({ s1: WHITE_FLASH })
    expect([buf[5], buf[2], buf[3], buf[4]]).toEqual([255, 0, 0, 0])
  })

  it('honours the isStrobeEnabled gate on a strobe-group fixture', () => {
    const ctx = setup([{ ...STROBE_RGBW, isStrobeEnabled: false }])
    ctx.strobe.setActive('fast')
    const buf = ctx.publish({ s1: WHITE_FLASH })
    expect([buf[5], buf[2], buf[3], buf[4]]).toEqual([255, 0, 0, 0])
  })

  it('leaves a plain RGB strobe fixture on the per-channel path', () => {
    const ctx = setup([{ id: 's1', channels: RGB, group: 'strobe', isStrobeEnabled: true }])
    ctx.strobe.setActive('fast')
    const buf = ctx.publish({ s1: WHITE_FLASH })
    expect([buf[2], buf[3], buf[4]]).toEqual([255, 255, 255])
    expect(Object.keys(buf).sort()).toEqual(['1', '2', '3', '4'])
  })

  it('fires every emitter on a Dedicated rig too', () => {
    const ctx = setup([STROBE_RGBW], ConfigStrobeType.Dedicated)
    ctx.strobe.setActive('slow')
    const buf = ctx.publish({ s1: WHITE_FLASH })
    expect([buf[5], buf[2], buf[3], buf[4]]).toEqual([255, 255, 255, 255])
  })

  it('mixes additively for a strobe-channel light outside the strobe set', () => {
    // Dedicated rig, front-group fixture: the hardware chop is the only thing marking it as
    // strobing, so the strobe-set membership test alone would leave it substituting and dimmer
    // than the flash-driven strobes beside it.
    const ctx = setup(
      [
        {
          id: 's1',
          channels: { ...RGB, strobeChannel: 6 },
          extraChannels: WHITE_EXTRA,
          isStrobeEnabled: true,
        },
      ],
      ConfigStrobeType.Dedicated,
    )
    ctx.strobe.setActive('medium')
    const buf = ctx.publish({ s1: WHITE_FLASH })
    expect(buf[6]).toBe(DEFAULT_STROBE_CHANNEL_VALUES.medium)
    expect([buf[5], buf[2], buf[3], buf[4]]).toEqual([255, 255, 255, 255])
  })

  it('drives the latched peak additively on an RGBW with a hardware strobe channel', () => {
    const ctx = setup([
      {
        ...STROBE_RGBW,
        channels: { ...RGB, strobeChannel: 6 },
        strobeValues: { slow: 10, medium: 20, fast: 30, fastest: 40 },
      },
    ])
    ctx.strobe.setActive('fast')
    // Peak frame sets the latch; the dark frame that follows holds it.
    ctx.publish({ s1: WHITE_FLASH })
    const buf = ctx.publish({ s1: rgbio() })
    expect(buf[6]).toBe(30)
    expect([buf[5], buf[2], buf[3], buf[4]]).toEqual([255, 255, 255, 255])
  })
})
