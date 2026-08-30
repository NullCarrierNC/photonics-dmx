/**
 * Venue post-processing as it reaches the wire and the preview: which values it colours, which it
 * leaves alone, and where it sits relative to the strobe latch and the colour mixer. The transform
 * maths itself is covered by venuePostProcessing.test.ts.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher, type PublisherTiming } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import { VenueFrameProcessor } from '../../controllers/VenueFrameProcessor'
import {
  PASSTHROUGH_FRAME_RIG_VIEW,
  type PublisherFrameProcessor,
} from '../../controllers/PublisherFrameProcessor'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxRig,
  type ExtraChannel,
  type RGBIO,
} from '../../types'
import type { DmxValuesPayload } from '../../../shared/ipcTypes'

function rgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...overrides }
}

interface LightSpec {
  id: string
  channels: Record<string, number>
  extraChannels?: ExtraChannel[]
  isStrobeEnabled?: boolean
  group?: 'front' | 'back' | 'strobe'
}

/** Positions run across both rows rather than restarting per row, as the layout editor assigns. */
function makeLight(spec: LightSpec, group: 'front' | 'back' | 'strobe', position: number): unknown {
  return {
    id: spec.id,
    fixtureId: `tpl-${spec.id}`,
    position,
    name: spec.id,
    label: spec.id,
    fixture: FixtureTypes.RGB,
    isStrobeEnabled: spec.isStrobeEnabled ?? false,
    group,
    universe: 1,
    mount: 'floor' as const,
    channels: spec.channels,
    ...(spec.extraChannels ? { extraChannels: spec.extraChannels } : {}),
  }
}

function makeRig(lights: LightSpec[]): DmxRig {
  let nextPosition = 1
  const inGroup = (group: 'front' | 'back' | 'strobe'): unknown[] =>
    lights
      .filter((l) => (l.group ?? 'front') === group)
      .map((l) => makeLight(l, group, nextPosition++))

  const front = inGroup('front')
  const back = inGroup('back')
  const strobe = inGroup('strobe')
  return {
    id: 'rig-1',
    name: 'Rig',
    active: true,
    config: {
      numLights: front.length + back.length,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: front as unknown as DmxRig['config']['frontLights'],
      backLights: back as unknown as DmxRig['config']['backLights'],
      strobeLights: strobe as unknown as DmxRig['config']['strobeLights'],
    },
  }
}

interface Ctx {
  publisher: DmxPublisher
  /** The stage the publisher reads from. ControllerManager owns this one in the app. */
  venue: VenueFrameProcessor
  strobe: StrobeStateManager
  ipcPayloads: DmxValuesPayload[]
  setNow(ms: number): void
  publish(states: Record<string, RGBIO>): Record<number, number>
}

function setup(
  lights: LightSpec[],
  options: { ipc?: boolean; venuePostProcessingEnabled?: boolean } = {},
): Ctx {
  const ipcPayloads: DmxValuesPayload[] = []
  let nowMs = 0
  const sender = {
    send: jest.fn<(slotId: string, buffer: Record<number, number>) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    getEnabledWireSenders: () => ['sacn'],
    isIpcEnabled: () => options.ipc === true,
    sendIpc: (payload: DmxValuesPayload) => {
      ipcPayloads.push(payload)
    },
  }
  const timing: PublisherTiming = {
    now: () => nowMs,
    setTimer: (cb, ms) => setTimeout(cb, ms),
    clearTimer: (handle) => clearTimeout(handle),
  }
  const strobe = new StrobeStateManager()
  const venue = new VenueFrameProcessor(
    options.venuePostProcessingEnabled === undefined
      ? {}
      : { enabled: options.venuePostProcessingEnabled },
  )
  const publisher = new DmxPublisher(
    sender as unknown as SenderManager,
    new LightStateManager(),
    strobe,
    { timing, frameProcessor: venue },
  )
  publisher.updateActiveRigs([makeRig(lights)])
  return {
    publisher,
    venue,
    strobe,
    ipcPayloads,
    setNow(ms) {
      nowMs = ms
    },
    publish(states) {
      publisher.publish(new Map(Object.entries(states)))
      const calls = sender.send.mock.calls
      return calls[calls.length - 1]![1] as Record<number, number>
    },
  }
}

const RGB = { masterDimmer: 1, red: 2, green: 3, blue: 4 }
const PLAIN: LightSpec = { id: 'f1', channels: RGB }
const RED = rgbio({ red: 255, intensity: 255 })

describe('DmxPublisher venue post-processing', () => {
  it('passes colour through while the state is Default', () => {
    const ctx = setup([PLAIN])
    const buf = ctx.publish({ f1: RED })
    expect([buf[2], buf[3], buf[4]]).toEqual([255, 0, 0])
  })

  it('greys a red light out under BlackAndWhite', () => {
    const ctx = setup([PLAIN])
    ctx.venue.setVenuePostProcessing('BlackAndWhite')
    const buf = ctx.publish({ f1: RED })
    expect([buf[2], buf[3], buf[4]]).toEqual([76, 76, 76])
  })

  it('leaves master dimmer, pan and tilt alone', () => {
    const ctx = setup([{ id: 'f1', channels: { ...RGB, pan: 5, tilt: 6 } }])
    ctx.venue.setVenuePostProcessing('BlackAndWhite')
    const buf = ctx.publish({ f1: rgbio({ red: 255, intensity: 200, pan: 50, tilt: 25 }) })
    expect(buf[1]).toBe(200)
    const plain = setup([{ id: 'f1', channels: { ...RGB, pan: 5, tilt: 6 } }]).publish({
      f1: rgbio({ red: 255, intensity: 200, pan: 50, tilt: 25 }),
    })
    expect(buf[5]).toBe(plain[5])
    expect(buf[6]).toBe(plain[6])
  })

  it('derives a white emitter from the transformed colour', () => {
    const rgbw: LightSpec = {
      id: 'f1',
      channels: RGB,
      extraChannels: [{ type: 'white', channel: 5 }],
    }
    // A pure red carries no white, so the greyed colour is the only way white can light here.
    expect(setup([rgbw]).publish({ f1: RED })[5]).toBe(0)

    const ctx = setup([rgbw])
    ctx.venue.setVenuePostProcessing('BlackAndWhite')
    expect(ctx.publish({ f1: RED })[5]).toBe(76)
  })

  it('latches the transformed colour for a hardware strobe', () => {
    const ctx = setup([
      { id: 's1', channels: { ...RGB, strobeChannel: 5 }, group: 'strobe', isStrobeEnabled: true },
    ])
    ctx.venue.setVenuePostProcessing('BlackAndWhite')
    ctx.strobe.setActive('fast')
    const buf = ctx.publish({ s1: RED })
    expect([buf[2], buf[3], buf[4]]).toEqual([76, 76, 76])

    // The latch holds the peak, so the dark half of the chop keeps the greyed colour.
    const held = ctx.publish({ s1: rgbio() })
    expect([held[2], held[3], held[4]]).toEqual([76, 76, 76])
  })

  it('honours the preference at construction and when hot-swapped', () => {
    const off = setup([PLAIN], { venuePostProcessingEnabled: false })
    off.venue.setVenuePostProcessing('BlackAndWhite')
    expect(off.publish({ f1: RED })[2]).toBe(255)

    const ctx = setup([PLAIN])
    ctx.venue.setVenuePostProcessing('BlackAndWhite')
    expect(ctx.publish({ f1: RED })[2]).toBe(76)

    ctx.venue.setVenuePostProcessingEnabled(false)
    expect(ctx.publish({ f1: RED })[2]).toBe(255)
  })

  it('starts from a clean state when the preference is turned back on', () => {
    const ctx = setup([PLAIN])
    ctx.venue.setVenuePostProcessing('Trails')
    ctx.publish({ f1: RED })
    ctx.venue.setVenuePostProcessingEnabled(false)
    ctx.venue.setVenuePostProcessingEnabled(true)

    ctx.setNow(1000)
    expect(ctx.publish({ f1: rgbio() })[2]).toBe(0)
  })

  it('restores the unchanged live effect when the preference is turned back on', () => {
    const ctx = setup([PLAIN])
    ctx.venue.setVenuePostProcessing('BlackAndWhite')
    expect(ctx.publish({ f1: RED })[2]).toBe(76)

    ctx.venue.setVenuePostProcessingEnabled(false)
    expect(ctx.publish({ f1: RED })[2]).toBe(255)

    ctx.venue.setVenuePostProcessingEnabled(true)
    expect(ctx.publish({ f1: RED })[2]).toBe(76)
  })

  it('sends the transformed colour to the preview', () => {
    const ctx = setup([PLAIN], { ipc: true })
    ctx.venue.setVenuePostProcessing('BlackAndWhite')
    ctx.publish({ f1: RED })

    const payload = ctx.ipcPayloads[ctx.ipcPayloads.length - 1]!
    expect(payload.kind).toBe('rigs')
    if (payload.kind !== 'rigs') throw new Error('expected a rigs payload')
    expect(payload.rigBuffers['rig-1']![2]).toBe(76)
  })

  it('leaves the DMX console buffer untransformed', () => {
    const ctx = setup([PLAIN], { ipc: true })
    ctx.venue.setVenuePostProcessing('BlackAndWhite')
    ctx.publisher.setManualBuffer({ 2: 255, 3: 0, 4: 0 })

    const payload = ctx.ipcPayloads[ctx.ipcPayloads.length - 1]!
    expect(payload.kind).toBe('manual')
    if (payload.kind !== 'manual') throw new Error('expected a manual payload')
    expect(payload.buffer[2]).toBe(255)
  })

  it('decays a trail across frames using the publisher clock', () => {
    const ctx = setup([PLAIN])
    ctx.venue.setVenuePostProcessing('Trails')
    expect(ctx.publish({ f1: RED })[2]).toBe(255)

    ctx.setNow(100)
    const decayed = ctx.publish({ f1: rgbio() })[2]
    expect(decayed).toBeGreaterThan(0)
    expect(decayed).toBeLessThan(255)
  })

  it('holds the master dimmer open so a trail is actually visible', () => {
    // A cue switches a fixture off through the dimmer, so a trail on colour alone would decay
    // behind a closed shutter.
    const ctx = setup([PLAIN])
    ctx.venue.setVenuePostProcessing('Trails')
    ctx.publish({ f1: RED })

    ctx.setNow(100)
    const buf = ctx.publish({ f1: rgbio() })
    expect(buf[1]).toBeGreaterThan(0)
    expect(buf[2]).toBeGreaterThan(0)
  })

  it.each(['Bright', 'Contrast', 'Posterize'] as const)(
    'changes a saturated cue colour under %s, which colour curves alone cannot',
    (state) => {
      const lit = rgbio({ red: 255, intensity: 180 })
      const plain = setup([PLAIN]).publish({ f1: lit })

      const ctx = setup([PLAIN])
      ctx.venue.setVenuePostProcessing(state)
      const buf = ctx.publish({ f1: lit })

      expect(buf[1]).not.toBe(plain[1])
    },
  )
})

describe('DmxPublisher strobe punch-through', () => {
  const SOFT_STROBE: LightSpec = {
    id: 's1',
    channels: RGB,
    group: 'strobe',
    isStrobeEnabled: true,
  }
  const WHITE = rgbio({ red: 255, green: 255, blue: 255, intensity: 255 })

  it('lets a flash go dark again inside a choppy hold', () => {
    const ctx = setup([SOFT_STROBE])
    ctx.venue.setVenuePostProcessing('Choppy_BlackAndWhite')
    ctx.strobe.setActive('fast')

    expect(ctx.publish({ s1: WHITE })[1]).toBe(255)

    // Well inside the 8 Hz hold that captured the flash.
    ctx.setNow(50)
    expect(ctx.publish({ s1: rgbio() })[1]).toBe(0)
  })

  it('lets a flash go dark again under a trail', () => {
    const ctx = setup([SOFT_STROBE])
    ctx.venue.setVenuePostProcessing('Trails')
    ctx.strobe.setActive('fast')

    expect(ctx.publish({ s1: WHITE })[1]).toBe(255)

    ctx.setNow(60)
    expect(ctx.publish({ s1: rgbio() })[1]).toBe(0)
  })

  it('greys a strobe light with the rest of the rig', () => {
    const ctx = setup([SOFT_STROBE])
    ctx.venue.setVenuePostProcessing('BlackAndWhite')
    ctx.strobe.setActive('fast')

    const buf = ctx.publish({ s1: RED })
    expect([buf[2], buf[3], buf[4]]).toEqual([76, 76, 76])
  })

  it('keeps a white flash white through a greyscale venue effect', () => {
    const ctx = setup([SOFT_STROBE])
    ctx.venue.setVenuePostProcessing('BlackAndWhite')
    ctx.strobe.setActive('fast')

    const buf = ctx.publish({ s1: WHITE })
    expect([buf[2], buf[3], buf[4]]).toEqual([255, 255, 255])
  })

  it('keeps a flash white under a photo negative venue effect', () => {
    const ctx = setup([SOFT_STROBE])
    ctx.venue.setVenuePostProcessing('PhotoNegative')
    ctx.strobe.setActive('fast')

    const buf = ctx.publish({ s1: WHITE })
    expect([buf[2], buf[3], buf[4]]).toEqual([255, 255, 255])
  })

  it('still inverts a light the strobe does not drive', () => {
    const ctx = setup([
      SOFT_STROBE,
      { id: 'f1', channels: { masterDimmer: 5, red: 6, green: 7, blue: 8 } },
    ])
    ctx.venue.setVenuePostProcessing('PhotoNegative')
    ctx.strobe.setActive('fast')

    const buf = ctx.publish({ s1: WHITE, f1: WHITE })
    expect([buf[2], buf[3], buf[4]]).toEqual([255, 255, 255])
    expect([buf[6], buf[7], buf[8]]).toEqual([0, 0, 0])
  })

  it('resumes the trail once the strobe ends', () => {
    const ctx = setup([SOFT_STROBE])
    ctx.venue.setVenuePostProcessing('Trails')
    ctx.strobe.setActive('fast')
    ctx.publish({ s1: WHITE })

    ctx.setNow(60)
    expect(ctx.publish({ s1: rgbio() })[1]).toBe(0)

    ctx.strobe.setActive(null)
    ctx.setNow(120)
    ctx.publish({ s1: WHITE })
    ctx.setNow(180)
    expect(ctx.publish({ s1: rgbio() })[1]).toBeGreaterThan(0)
  })

  it('keeps the temporal stage for a light the strobe does not drive', () => {
    // Outside the strobe group, so no flash reaches it and its trail still decays.
    const ctx = setup([
      SOFT_STROBE,
      { id: 'f1', channels: { masterDimmer: 5, red: 6, green: 7, blue: 8 } },
    ])
    ctx.venue.setVenuePostProcessing('Trails')
    ctx.strobe.setActive('fast')
    ctx.publish({ s1: WHITE, f1: WHITE })

    ctx.setNow(60)
    const buf = ctx.publish({ s1: rgbio(), f1: rgbio() })
    expect(buf[1]).toBe(0)
    expect(buf[5]).toBeGreaterThan(0)
  })
})

/** Three fixtures across the front row, each on its own channel block. */
const ROW: LightSpec[] = [
  { id: 'f1', channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } },
  { id: 'f2', channels: { masterDimmer: 5, red: 6, green: 7, blue: 8 } },
  { id: 'f3', channels: { masterDimmer: 9, red: 10, green: 11, blue: 12 } },
]

const OFF = rgbio()

describe('DmxPublisher bloom bleed', () => {
  it('spills colour from a lit fixture onto its dark neighbours', () => {
    const ctx = setup(ROW)
    ctx.venue.setVenuePostProcessing('Bloom')
    const buf = ctx.publish({ f1: OFF, f2: RED, f3: OFF })

    expect(buf[2]).toBeGreaterThan(0)
    expect(buf[10]).toBeGreaterThan(0)
    expect(buf[2]).toBe(buf[10])
    // Spill is a wash, not a match for the source. The level lives in the master dimmer, since
    // colour carries the hue at full.
    expect(buf[1]).toBeLessThan(buf[5]!)
  })

  it('emits spill bright enough to see', () => {
    // Colour and dimmer both carrying the attenuation would square it, leaving a wash of about 9
    // percent that reads as black in the preview.
    const ctx = setup(ROW)
    ctx.venue.setVenuePostProcessing('Bloom')
    const buf = ctx.publish({ f1: OFF, f2: RED, f3: OFF })

    const emitted = (buf[2]! * buf[1]!) / 255
    expect(emitted).toBeGreaterThan(60)
  })

  it('raises a dark neighbour master dimmer so the spill reaches the wire', () => {
    const ctx = setup(ROW)
    ctx.venue.setVenuePostProcessing('Bloom')
    const buf = ctx.publish({ f1: OFF, f2: RED, f3: OFF })

    expect(buf[1]).toBeGreaterThan(0)
  })

  it('leaves neighbours dark under Default', () => {
    const ctx = setup(ROW)
    const buf = ctx.publish({ f1: OFF, f2: RED, f3: OFF })

    expect(buf[2]).toBe(0)
    expect(buf[10]).toBe(0)
    expect(buf[1]).toBe(0)
  })

  it('mixes two lit neighbours into each other', () => {
    const ctx = setup(ROW)
    ctx.venue.setVenuePostProcessing('Bloom')
    const green = rgbio({ green: 255, intensity: 255 })
    const buf = ctx.publish({ f1: RED, f2: green, f3: OFF })

    // Light 1 keeps red but picks up green, light 2 keeps green but picks up red.
    expect(buf[3]).toBeGreaterThan(0)
    expect(buf[2]).toBeGreaterThan(buf[3]!)
    expect(buf[6]).toBeGreaterThan(0)
    expect(buf[7]).toBeGreaterThan(buf[6]!)
  })

  it('does not spill between the front and back rows', () => {
    const ctx = setup([
      { id: 'f1', channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } },
      { id: 'b1', channels: { masterDimmer: 5, red: 6, green: 7, blue: 8 }, group: 'back' },
    ])
    ctx.venue.setVenuePostProcessing('Bloom')
    const buf = ctx.publish({ f1: RED, b1: OFF })

    expect(buf[6]).toBe(0)
    expect(buf[5]).toBe(0)
  })

  it('respects the preference', () => {
    const ctx = setup(ROW, { venuePostProcessingEnabled: false })
    ctx.venue.setVenuePostProcessing('Bloom')
    expect(ctx.publish({ f1: OFF, f2: RED, f3: OFF })[2]).toBe(0)

    const hot = setup(ROW)
    hot.venue.setVenuePostProcessing('Bloom')
    expect(hot.publish({ f1: OFF, f2: RED, f3: OFF })[2]).toBeGreaterThan(0)
    hot.venue.setVenuePostProcessingEnabled(false)
    expect(hot.publish({ f1: OFF, f2: RED, f3: OFF })[2]).toBe(0)
  })

  it('sends the bled colour to the preview', () => {
    const ctx = setup(ROW, { ipc: true })
    ctx.venue.setVenuePostProcessing('Bloom')
    ctx.publish({ f1: OFF, f2: RED, f3: OFF })

    const payload = ctx.ipcPayloads[ctx.ipcPayloads.length - 1]!
    if (payload.kind !== 'rigs') throw new Error('expected a rigs payload')
    expect(payload.rigBuffers['rig-1']![2]).toBeGreaterThan(0)
  })

  it('leaves the DMX console buffer untouched', () => {
    const ctx = setup(ROW, { ipc: true })
    ctx.venue.setVenuePostProcessing('Bloom')
    ctx.publisher.setManualBuffer({ 2: 255, 6: 0 })

    const payload = ctx.ipcPayloads[ctx.ipcPayloads.length - 1]!
    if (payload.kind !== 'manual') throw new Error('expected a manual payload')
    expect(payload.buffer[6]).toBe(0)
  })

  it('spills across an eight fixture two row rig', () => {
    // The shipped default layout: four across the front, four across the back, one fixture lit.
    const lights: LightSpec[] = []
    for (let i = 1; i <= 8; i++) {
      lights.push({
        id: `l${i}`,
        channels: {
          masterDimmer: i * 10,
          red: i * 10 + 1,
          green: i * 10 + 2,
          blue: i * 10 + 3,
        },
        group: i <= 4 ? 'front' : 'back',
      })
    }
    const ctx = setup(lights)
    ctx.venue.setVenuePostProcessing('Bloom')

    const states: Record<string, RGBIO> = {}
    for (let i = 1; i <= 8; i++) {
      states[`l${i}`] = i === 2 ? rgbio({ blue: 255, intensity: 255 }) : OFF
    }
    const buf = ctx.publish(states)

    const emitted = (index: number): number => (buf[index * 10 + 3]! * buf[index * 10]!) / 255
    expect(emitted(1)).toBeGreaterThan(60)
    expect(emitted(3)).toBeGreaterThan(60)
    // Two positions away and the whole back row stay dark.
    expect(emitted(4)).toBe(0)
    for (let i = 5; i <= 8; i++) {
      expect(emitted(i)).toBe(0)
    }
  })

  it('transforms in the bloom pre-pass before bleeding onto neighbours', () => {
    const ctx = setup(ROW)
    ctx.venue.setVenuePostProcessing('Bloom')
    const buf = ctx.publish({ f1: OFF, f2: RED, f3: OFF })

    expect([buf[6], buf[7], buf[8]]).toEqual([255, 0, 0])
    expect(buf[2]).toBeGreaterThan(0)
    expect(buf[10]).toBeGreaterThan(0)
  })

  it('prepares each rig through the injected frame processor', () => {
    const ipcPayloads: DmxValuesPayload[] = []
    const sender = {
      send: jest.fn<(slotId: string, buffer: Record<number, number>) => Promise<void>>(() =>
        Promise.resolve(),
      ),
      getEnabledWireSenders: () => ['sacn'],
      isIpcEnabled: () => false,
      sendIpc: (payload: DmxValuesPayload) => {
        ipcPayloads.push(payload)
      },
    }
    const prepareRigFrame = jest.fn<PublisherFrameProcessor['prepareRigFrame']>(() => ({
      isActive: () => true,
      colorFor: (_lightId, _input, out) => {
        out.r = 1
        out.g = 2
        out.b = 3
        out.intensity = 4
      },
    }))
    const frameProcessor: PublisherFrameProcessor = {
      isFrameProcessingActive: () => true,
      prepareRigFrame,
    }
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
      { frameProcessor },
    )
    publisher.updateActiveRigs([makeRig(ROW)])
    publisher.publish(new Map([['f2', RED]]))

    expect(prepareRigFrame).toHaveBeenCalledTimes(1)
    const [, , lightsArg, ctxArg] = prepareRigFrame.mock.calls[0]!
    expect(lightsArg.get('f2')).toEqual(RED)
    expect(ctxArg).toMatchObject({ rigId: 'rig-1' })

    // The colour the stage wrote is what reaches the wire.
    const buf = sender.send.mock.calls[sender.send.mock.calls.length - 1]![1]
    expect([buf[6], buf[7], buf[8]]).toEqual([1, 2, 3])
  })

  it('skips the frame processor entirely while it reports inactive', () => {
    const sender = {
      send: jest.fn(() => Promise.resolve()),
      getEnabledWireSenders: () => ['sacn'],
      isIpcEnabled: () => false,
      sendIpc: jest.fn(),
    }
    const prepareRigFrame = jest.fn<PublisherFrameProcessor['prepareRigFrame']>(
      () => PASSTHROUGH_FRAME_RIG_VIEW,
    )
    const publisher = new DmxPublisher(
      sender as unknown as SenderManager,
      new LightStateManager(),
      new StrobeStateManager(),
      { frameProcessor: { isFrameProcessingActive: () => false, prepareRigFrame } },
    )
    publisher.updateActiveRigs([makeRig(ROW)])
    publisher.publish(new Map([['f2', RED]]))

    expect(prepareRigFrame).not.toHaveBeenCalled()
  })
})
