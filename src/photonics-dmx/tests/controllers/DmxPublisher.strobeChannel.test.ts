/**
 * Strobe-channel-specific DmxPublisher tests.
 *
 * Covers the runtime contract added with hardware-strobe-channel support:
 *  - When a strobe cue is active and a light has both `hasStrobeChannel` (channels.strobeChannel
 *    set) and `isStrobeEnabled` (layout-level), the strobe DMX channel receives the per-cue speed
 *    value from `strobeValues`.
 *  - When the cue's RGB enters an off-phase (intensity 0), the publisher latches and replays the
 *    most recent non-zero RGB it saw during the cue, so hardware-strobe lights see a steady colour
 *    while the strobe channel does the chopping.
 *  - When the strobe cue ends, the latch clears, the strobe channel parks at 0, and RGB output
 *    reverts to whatever the cue is producing.
 *  - Lights without a strobe channel (or with isStrobeEnabled off) are unaffected by either
 *    behaviour.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import { ConfigStrobeType, FixtureTypes, type DmxRig, type RGBIO } from '../../types'

function makeBlackRgbio(): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace' }
}

function makeBrightRgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return {
    red: 255,
    green: 64,
    blue: 0,
    intensity: 255,
    opacity: 1,
    blendMode: 'replace',
    ...overrides,
  }
}

interface ScenarioContext {
  publisher: DmxPublisher
  sender: {
    send: jest.Mock<(slotId: string, buffer: Record<number, number>) => Promise<void>>
    getEnabledWireSenders: () => string[]
    isIpcEnabled: () => boolean
  }
  strobe: StrobeStateManager
  rig: DmxRig
  lastBuffer(): Record<number, number>
}

/**
 * Mock SenderManager surface used across this file. Advertises a single 'sacn' wire sender so
 * the publisher routes every test rig through that one slot; the assertions read the buffer
 * arg of the (slotId, buffer) call signature.
 */
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

/**
 * Builds a publisher under test with a single front light. `withStrobeChannel` controls whether
 * the light has a hardware strobe channel; `isStrobeEnabled` toggles the layout-level flag.
 */
function setupScenario(options: {
  withStrobeChannel: boolean
  isStrobeEnabled: boolean
}): ScenarioContext {
  const sender = makeMockSender()
  const lightStateManager = new LightStateManager()
  const strobe = new StrobeStateManager()
  const publisher = new DmxPublisher(sender as unknown as SenderManager, lightStateManager, strobe)

  const channels: Record<string, number> = {
    masterDimmer: 1,
    red: 2,
    green: 3,
    blue: 4,
  }
  if (options.withStrobeChannel) {
    channels.strobeChannel = 5
  }

  const rig: DmxRig = {
    id: 'rig-strobe',
    name: 'Strobe Test',
    active: true,
    config: {
      numLights: 1,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: [
        {
          id: 'light-1',
          fixtureId: 'tpl-1',
          position: 1,
          name: 'L1',
          label: 'L1',
          fixture: FixtureTypes.RGB,
          isStrobeEnabled: options.isStrobeEnabled,
          group: 'front',
          universe: 1,
          mount: 'floor',
          channels: channels as unknown as DmxRig['config']['frontLights'][number]['channels'],
          strobeValues: { slow: 30, medium: 90, fast: 180, fastest: 240 },
        },
      ],
      backLights: [],
      strobeLights: [],
    },
  }
  publisher.updateActiveRigs([rig])

  return {
    publisher,
    sender,
    strobe,
    rig,
    lastBuffer(): Record<number, number> {
      const calls = sender.send.mock.calls
      // Calls are (slotId, buffer); the buffer is the second arg.
      return calls[calls.length - 1]![1] as Record<number, number>
    },
  }
}

describe('DmxPublisher strobe-channel runtime', () => {
  let ctx: ScenarioContext

  beforeEach(() => {
    ctx = setupScenario({ withStrobeChannel: true, isStrobeEnabled: true })
  })

  it('parks strobe channel at 0 when no strobe cue is active', () => {
    const lights = new Map<string, RGBIO>([['light-1', makeBrightRgbio()]])
    ctx.publisher.publish(lights)

    const buf = ctx.lastBuffer()
    expect(buf[5]).toBe(0)
    expect(buf[2]).toBe(255)
    expect(buf[3]).toBe(64)
  })

  it('writes the per-cue speed value to the strobe channel for the active slot', () => {
    ctx.strobe.setActive('fast')
    const lights = new Map<string, RGBIO>([['light-1', makeBrightRgbio()]])
    ctx.publisher.publish(lights)

    expect(ctx.lastBuffer()[5]).toBe(180)

    ctx.strobe.setActive('slow')
    ctx.publisher.publish(lights)
    expect(ctx.lastBuffer()[5]).toBe(30)
  })

  it('holds the peak blended color through the cue envelope (fade + primary showing through)', () => {
    // Models the real post-blend stream the publisher sees: stock strobe cues flash opacity,
    // which the blender folds into rgb/intensity. So a strobe-channel light sees: peak white
    // burst -> dimming as opacity fades -> the underlying primary cue when opacity hits 0.
    ctx.strobe.setActive('medium')
    const peak = makeBrightRgbio() // {255,64,0,i255} — opacity 1 moment
    const fading: RGBIO = {
      red: 128,
      green: 32,
      blue: 0,
      intensity: 128,
      opacity: 1,
      blendMode: 'replace',
    } // opacity ~0.5 baked in
    const primaryShowing: RGBIO = {
      red: 200,
      green: 0,
      blue: 0,
      intensity: 200,
      opacity: 1,
      blendMode: 'replace',
    } // off-phase: underlying primary red

    ctx.publisher.publish(new Map([['light-1', peak]]))
    const f1 = ctx.lastBuffer()
    expect([f1[2], f1[3], f1[1]]).toEqual([255, 64, 255])
    expect(f1[5]).toBe(90)

    ctx.publisher.publish(new Map([['light-1', fading]]))
    const f2 = ctx.lastBuffer()
    // Holds the peak, not the dimmer fading frame.
    expect([f2[2], f2[3], f2[1]]).toEqual([255, 64, 255])

    ctx.publisher.publish(new Map([['light-1', primaryShowing]]))
    const f3 = ctx.lastBuffer()
    // Holds the peak, not the underlying primary.
    expect([f3[2], f3[3], f3[1]]).toEqual([255, 64, 255])
    expect(f3[5]).toBe(90)
  })

  it('promotes to a brighter peak if a later frame exceeds the stored peak', () => {
    ctx.strobe.setActive('slow')
    const dim: RGBIO = {
      red: 80,
      green: 0,
      blue: 0,
      intensity: 80,
      opacity: 1,
      blendMode: 'replace',
    }
    const brighter = makeBrightRgbio() // max(255,64,0,255)=255 > 80

    ctx.publisher.publish(new Map([['light-1', dim]]))
    expect(ctx.lastBuffer()[1]).toBe(80) // first sample becomes the peak

    ctx.publisher.publish(new Map([['light-1', brighter]]))
    const f2 = ctx.lastBuffer()
    expect([f2[2], f2[3], f2[1]]).toEqual([255, 64, 255]) // promoted

    ctx.publisher.publish(new Map([['light-1', dim]]))
    const f3 = ctx.lastBuffer()
    expect([f3[2], f3[3], f3[1]]).toEqual([255, 64, 255]) // holds the higher peak
  })

  it('clears the peak when the strobe cue ends and lets RGB flow unchanged', () => {
    ctx.strobe.setActive('medium')
    ctx.publisher.publish(new Map([['light-1', makeBrightRgbio()]])) // peak = {255,64,0,255}
    ctx.publisher.publish(new Map([['light-1', makeBlackRgbio()]])) // holds peak

    ctx.strobe.setActive(null)
    ctx.publisher.publish(new Map([['light-1', makeBlackRgbio()]]))
    const buf = ctx.lastBuffer()
    expect(buf[2]).toBe(0)
    expect(buf[3]).toBe(0)
    expect(buf[5]).toBe(0)
  })

  it('writes the cue frame as-is when the very first strobe frame is dark (pre-peak)', () => {
    ctx.strobe.setActive('fast')
    ctx.publisher.publish(new Map<string, RGBIO>([['light-1', makeBlackRgbio()]]))
    const buf = ctx.lastBuffer()
    expect(buf[1]).toBe(0)
    expect(buf[2]).toBe(0)
    expect(buf[5]).toBe(180) // strobe channel still driven even pre-peak
  })

  it('falls back to default strobe values when the light has none configured', () => {
    const sender = makeMockSender()
    const strobe = new StrobeStateManager()
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      strobe,
    )
    publisher.updateActiveRigs([
      {
        ...ctx.rig,
        config: {
          ...ctx.rig.config,
          frontLights: [{ ...ctx.rig.config.frontLights[0]!, strobeValues: undefined }],
        },
      },
    ])

    strobe.setActive('fastest')
    publisher.publish(new Map<string, RGBIO>([['light-1', makeBrightRgbio()]]))
    const [, buf] = sender.send.mock.calls[0]!
    expect((buf as Record<number, number>)[5]).toBe(255) // DEFAULT_STROBE_CHANNEL_VALUES.fastest
  })
})

describe('DmxPublisher dedicated STROBE fixtures', () => {
  it('does not engage the RGB+S latch path for dedicated STROBE fixtures', () => {
    // A dedicated STROBE fixture is a separate device class — it has its own strobe channel by
    // design and is not part of the new "RGB light with optional strobe channel" feature. The
    // publisher should leave it alone: no per-cue speed-value write, no RGB latch.
    const sender = makeMockSender()
    const strobe = new StrobeStateManager()
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      strobe,
    )

    const strobeRig: DmxRig = {
      id: 'rig-pure-strobe',
      name: 'Pure',
      active: true,
      config: {
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
        strobeType: ConfigStrobeType.Dedicated,
        frontLights: [],
        backLights: [],
        strobeLights: [
          {
            id: 'pure-strobe-1',
            fixtureId: 'tpl-strobe',
            position: 1,
            name: 'S1',
            label: 'S1',
            fixture: FixtureTypes.STROBE,
            isStrobeEnabled: true,
            group: 'strobe',
            universe: 1,
            mount: 'floor',
            channels: {
              masterDimmer: 10,
              strobeChannel: 11,
            } as unknown as DmxRig['config']['strobeLights'][number]['channels'],
            // Crucially: NO strobeValues on a dedicated STROBE fixture. Asserts the publisher
            // gates on fixture type rather than just on `hasStrobeChannel`.
          },
        ],
      },
    }
    publisher.updateActiveRigs([strobeRig])
    strobe.setActive('fast')

    publisher.publish(new Map<string, RGBIO>([['pure-strobe-1', makeBrightRgbio()]]))
    // Calls are (slotId, buffer); buffer is at index [1].
    const buf = sender.send.mock.calls[sender.send.mock.calls.length - 1]![1] as Record<
      number,
      number
    >
    // strobe channel parks at 0 — the new feature is not driving it; dedicated STROBE behaviour
    // is a separate concern handled elsewhere.
    expect(buf[11]).toBe(0)
    // masterDimmer follows the cue normally (no latch override).
    expect(buf[10]).toBe(255)
  })
})

describe('DmxPublisher strobe-channel guards', () => {
  it('lights without a strobe channel keep flashing RGB (no latch override applied)', () => {
    const ctx = setupScenario({ withStrobeChannel: false, isStrobeEnabled: true })
    ctx.strobe.setActive('medium')

    ctx.publisher.publish(new Map<string, RGBIO>([['light-1', makeBrightRgbio()]]))
    ctx.publisher.publish(new Map<string, RGBIO>([['light-1', makeBlackRgbio()]]))

    // No strobe channel address allocated and RGB follows the cue's off-phase, not the latch.
    const buf = ctx.lastBuffer()
    expect(buf[5]).toBeUndefined()
    expect(buf[2]).toBe(0)
    expect(buf[1]).toBe(0)
  })

  it('lights with strobeChannel but isStrobeEnabled false do not engage the strobe-channel path', () => {
    const ctx = setupScenario({ withStrobeChannel: true, isStrobeEnabled: false })
    ctx.strobe.setActive('fast')

    ctx.publisher.publish(new Map<string, RGBIO>([['light-1', makeBrightRgbio()]]))
    ctx.publisher.publish(new Map<string, RGBIO>([['light-1', makeBlackRgbio()]]))

    const buf = ctx.lastBuffer()
    // Strobe channel parks at 0 — light isn't participating in the strobe cue.
    expect(buf[5]).toBe(0)
    // No latch override: off-phase goes dark.
    expect(buf[2]).toBe(0)
    expect(buf[1]).toBe(0)
  })
})
