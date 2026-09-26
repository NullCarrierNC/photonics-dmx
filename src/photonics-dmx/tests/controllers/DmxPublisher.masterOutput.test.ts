/**
 * The global output controls in the publish path: master dimmer, blackout latch, strobe gate.
 *
 * The invariant these exist for is which channels the controls are allowed to touch. Colour and
 * intensity are light output and scale. Pan, tilt, the hardware strobe-speed channel and pinned
 * `fixed` channels are aim, rate and fixture mode: dimming them would steer or reprogram a fixture
 * rather than darken it, and a blackout that reset a mode channel would leave the rig misconfigured
 * once it came back.
 */
import { describe, expect, it } from '@jest/globals'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { fakeSenderManager, type FakeSenderManager } from '../helpers/fakeSenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import { MasterOutputState } from '../../controllers/MasterOutputState'
import type { DmxValuesPayload } from '../../../shared/ipcTypes'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxLight,
  type DmxRig,
  type ExtraChannel,
  type RGBIO,
  type RgbDmxChannels,
  type RgbMovingHeadDmxChannels,
} from '../../types'

function rgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...overrides }
}

type LightSpec = {
  id: string
  extraChannels?: ExtraChannel[]
  strobeValues?: { slow: number; medium: number; fast: number; fastest: number }
  isStrobeEnabled?: boolean
  /** Places the light in the rig's strobe group, which is what `getStrobeLightIds` reads. */
  inStrobeGroup?: boolean
} & (
  | { fixture?: FixtureTypes.RGB; channels: RgbDmxChannels }
  | { fixture: FixtureTypes.RGBMH; channels: RgbMovingHeadDmxChannels }
)

function makeLight({ inStrobeGroup, ...spec }: LightSpec): DmxLight {
  return {
    fixture: FixtureTypes.RGB,
    fixtureId: `tpl-${spec.id}`,
    position: 1,
    name: spec.id,
    label: spec.id,
    isStrobeEnabled: false,
    group: inStrobeGroup === true ? 'strobe' : 'front',
    universe: 1,
    mount: 'floor',
    ...spec,
  }
}

function makeRig(lights: LightSpec[]): DmxRig {
  const front = lights.filter((l) => l.inStrobeGroup !== true).map(makeLight)
  const strobe = lights.filter((l) => l.inStrobeGroup === true).map(makeLight)
  return {
    id: 'rig-1',
    name: 'Rig',
    active: true,
    config: {
      numLights: front.length,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: front,
      backLights: [],
      strobeLights: strobe,
    },
  }
}

function setup(
  lights: LightSpec[],
  master: MasterOutputState = new MasterOutputState(),
  strobeManager: StrobeStateManager = new StrobeStateManager(),
): {
  publisher: DmxPublisher
  master: MasterOutputState
  strobeManager: StrobeStateManager
  sender: FakeSenderManager
  wire(): Record<number, number>
  ipc(): Record<number, number>
} {
  const sender = fakeSenderManager({ isIpcEnabled: () => true })
  const publisher = new DmxPublisher(sender, new LightStateManager(), strobeManager, {
    masterOutput: master,
  })
  publisher.updateActiveRigs([makeRig(lights)])
  return {
    publisher,
    master,
    strobeManager,
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
const STROBE_VALUES = { slow: 50, medium: 100, fast: 150, fastest: 200 }

describe('DmxPublisher master dimmer', () => {
  it('scales colour and intensity on both the wire and the preview', () => {
    const master = new MasterOutputState()
    master.setDimmerPercent(50)
    const { publisher, wire, ipc } = setup([{ id: 'l1', channels: RGB_CHANNELS }], master)

    publisher.publish(
      new Map<string, RGBIO>([['l1', rgbio({ red: 200, green: 100, blue: 40, intensity: 255 })]]),
    )

    // Unlike the per-fixture brightness trim, the master reaches the preview too: it is the
    // operator's own level, so the preview would be lying if it showed full output.
    expect(wire()).toEqual({ 1: 128, 2: 100, 3: 50, 4: 20 })
    expect(ipc()).toEqual({ 1: 128, 2: 100, 3: 50, 4: 20 })
  })

  it('leaves pan and tilt alone', () => {
    const master = new MasterOutputState()
    const full = setup([
      {
        id: 'mh',
        fixture: FixtureTypes.RGBMH,
        channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
      },
    ])
    full.publisher.publish(
      new Map<string, RGBIO>([
        ['mh', rgbio({ red: 200, green: 200, blue: 200, intensity: 200, pan: 75, tilt: 25 })],
      ]),
    )
    const undimmed = full.wire()

    master.setDimmerPercent(25)
    const dimmed = setup(
      [
        {
          id: 'mh',
          fixture: FixtureTypes.RGBMH,
          channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
        },
      ],
      master,
    )
    dimmed.publisher.publish(
      new Map<string, RGBIO>([
        ['mh', rgbio({ red: 200, green: 200, blue: 200, intensity: 200, pan: 75, tilt: 25 })],
      ]),
    )
    const buffer = dimmed.wire()

    expect(buffer[1]).toBe(50)
    expect(buffer[2]).toBe(50)
    // Aim is position, not output. A fader must not steer the fixture.
    expect(buffer[5]).toBe(undimmed[5])
    expect(buffer[6]).toBe(undimmed[6])
  })

  it('leaves pinned fixed channels at their constant', () => {
    const master = new MasterOutputState()
    master.setDimmerPercent(10)
    const { publisher, wire } = setup(
      [
        {
          id: 'l1',
          channels: RGB_CHANNELS,
          extraChannels: [{ type: 'fixed', channel: 8, value: 200 }],
        },
      ],
      master,
    )

    publisher.publish(new Map<string, RGBIO>([['l1', rgbio({ red: 200, intensity: 200 })]]))

    // Channel 8 selects a fixture mode. Scaling it would reprogram the light, not dim it.
    expect(wire()[8]).toBe(200)
    expect(wire()[2]).toBe(20)
  })

  it('leaves the hardware strobe-speed channel alone', () => {
    const master = new MasterOutputState()
    master.setDimmerPercent(20)
    const strobeManager = new StrobeStateManager()
    const { publisher, wire } = setup(
      [
        {
          id: 'l1',
          channels: { ...RGB_CHANNELS, strobeChannel: 7 },
          isStrobeEnabled: true,
          strobeValues: STROBE_VALUES,
        },
      ],
      master,
      strobeManager,
    )
    strobeManager.setActive('fast', 'net')

    publisher.publish(
      new Map<string, RGBIO>([['l1', rgbio({ red: 255, green: 255, blue: 255, intensity: 255 })]]),
    )

    // Channel 7 is a rate, not a level: scaling it would slow the strobe rather than dim it.
    expect(wire()[7]).toBe(STROBE_VALUES.fast)
    expect(wire()[1]).toBe(51)
  })

  it('latches the true strobe peak rather than the dimmed one', () => {
    const master = new MasterOutputState()
    master.setDimmerPercent(50)
    const strobeManager = new StrobeStateManager()
    const { publisher, wire } = setup(
      [
        {
          id: 'l1',
          channels: { ...RGB_CHANNELS, strobeChannel: 7 },
          isStrobeEnabled: true,
          strobeValues: STROBE_VALUES,
        },
      ],
      master,
      strobeManager,
    )
    strobeManager.setActive('medium', 'net')

    publisher.publish(new Map<string, RGBIO>([['l1', rgbio({ red: 200, intensity: 200 })]]))
    // Off-phase of the flash: the latch replays the peak, which is then dimmed by the same 50%.
    publisher.publish(new Map<string, RGBIO>([['l1', rgbio({ red: 0, intensity: 0 })]]))

    expect(wire()[2]).toBe(100)

    // Raising the fader mid-strobe reveals the full stored peak, which it could not do if the
    // latch had captured the already-dimmed value.
    master.setDimmerPercent(100)
    publisher.publish(new Map<string, RGBIO>([['l1', rgbio({ red: 0, intensity: 0 })]]))
    expect(wire()[2]).toBe(200)
  })
})

describe('DmxPublisher blackout', () => {
  it('zeroes colour and intensity while leaving fixture aim and mode intact', () => {
    const master = new MasterOutputState()
    const { publisher, wire } = setup(
      [
        {
          id: 'mh',
          fixture: FixtureTypes.RGBMH,
          channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
          extraChannels: [{ type: 'fixed', channel: 8, value: 200 }],
        },
      ],
      master,
    )

    publisher.publish(
      new Map<string, RGBIO>([
        ['mh', rgbio({ red: 255, green: 255, blue: 255, intensity: 255, pan: 75, tilt: 25 })],
      ]),
    )
    const lit = wire()
    expect(lit[2]).toBe(255)

    master.setBlackout(true)
    publisher.refreshOutput()
    const dark = wire()

    expect(dark[1]).toBe(0)
    expect(dark[2]).toBe(0)
    expect(dark[3]).toBe(0)
    expect(dark[4]).toBe(0)
    // Aim and mode survive, so releasing the blackout does not also have to re-home the rig.
    expect(dark[5]).toBe(lit[5])
    expect(dark[6]).toBe(lit[6])
    expect(dark[8]).toBe(200)
  })

  it('parks the hardware strobe channel until released', () => {
    const master = new MasterOutputState()
    const strobeManager = new StrobeStateManager()
    const { publisher, wire } = setup(
      [
        {
          id: 'l1',
          channels: { ...RGB_CHANNELS, strobeChannel: 7 },
          isStrobeEnabled: true,
          strobeValues: STROBE_VALUES,
        },
      ],
      master,
      strobeManager,
    )
    strobeManager.setActive('fast', 'net')
    publisher.publish(
      new Map<string, RGBIO>([['l1', rgbio({ red: 255, green: 255, blue: 255, intensity: 255 })]]),
    )
    expect(wire()[7]).toBe(STROBE_VALUES.fast)

    master.setBlackout(true)
    publisher.refreshOutput()
    expect(wire()[7]).toBe(0)

    master.setBlackout(false)
    publisher.refreshOutput()
    expect(wire()[7]).toBe(STROBE_VALUES.fast)
  })

  it('restores the fader position when released', () => {
    const master = new MasterOutputState()
    master.setDimmerPercent(40)
    const { publisher, wire } = setup([{ id: 'l1', channels: RGB_CHANNELS }], master)

    publisher.publish(new Map<string, RGBIO>([['l1', rgbio({ red: 200, intensity: 200 })]]))
    expect(wire()[2]).toBe(80)

    master.setBlackout(true)
    publisher.refreshOutput()
    expect(wire()[2]).toBe(0)

    master.setBlackout(false)
    publisher.refreshOutput()
    expect(wire()[2]).toBe(80)
  })

  it('re-emits on an idle rig rather than waiting for the next cue', () => {
    const master = new MasterOutputState()
    const { publisher, sender, wire } = setup([{ id: 'l1', channels: RGB_CHANNELS }], master)

    publisher.publish(new Map<string, RGBIO>([['l1', rgbio({ red: 200, intensity: 200 })]]))
    const sendsWhileLit = sender.send.mock.calls.length

    // Nothing publishes between songs, so the blackout has to push a frame of its own.
    master.setBlackout(true)
    publisher.refreshOutput()

    expect(sender.send.mock.calls.length).toBeGreaterThan(sendsWhileLit)
    expect(wire()[2]).toBe(0)
  })

  it('blacks out the DMX console, which the master dimmer deliberately does not touch', () => {
    const master = new MasterOutputState()
    master.setDimmerPercent(50)
    const { publisher, wire } = setup([{ id: 'l1', channels: RGB_CHANNELS }], master)

    // The console is a raw per-channel takeover and calibration depends on reading back the number
    // that was typed, so the fader is excluded by design.
    publisher.setManualBuffer({ 1: 200, 2: 100 })
    expect(wire()[1]).toBe(200)
    expect(wire()[2]).toBe(100)

    // Blackout is a safety control, so it applies here too.
    master.setBlackout(true)
    publisher.refreshOutput()
    expect(wire()[1]).toBe(0)
    expect(wire()[2]).toBe(0)

    master.setBlackout(false)
    publisher.refreshOutput()
    expect(wire()[1]).toBe(200)
  })
})

describe('DmxPublisher strobe output gate', () => {
  const STROBE_LIGHT: LightSpec = {
    id: 'strobe1',
    channels: { ...RGB_CHANNELS, strobeChannel: 7 },
    isStrobeEnabled: true,
    strobeValues: STROBE_VALUES,
    inStrobeGroup: true,
  }

  it('publishes strobe-driven lights dark and parks the strobe channel', () => {
    const master = new MasterOutputState()
    master.setStrobeOutputEnabled(false)
    const strobeManager = new StrobeStateManager()
    const { publisher, wire } = setup([STROBE_LIGHT], master, strobeManager)
    strobeManager.setActive('fast', 'net')

    publisher.publish(
      new Map<string, RGBIO>([
        ['strobe1', rgbio({ red: 255, green: 255, blue: 255, intensity: 255 })],
      ]),
    )

    // The flash is already baked into rgb/intensity by the blender, so holding the strobe back
    // means publishing the light dark rather than passing the flashing values through.
    expect(wire()[1]).toBe(0)
    expect(wire()[2]).toBe(0)
    expect(wire()[3]).toBe(0)
    expect(wire()[4]).toBe(0)
    // And the hardware chop is disarmed at the same time.
    expect(wire()[7]).toBe(0)
  })

  it('passes the strobe through untouched while the gate is open', () => {
    const strobeManager = new StrobeStateManager()
    const { publisher, wire } = setup([STROBE_LIGHT], new MasterOutputState(), strobeManager)
    strobeManager.setActive('fast', 'net')

    publisher.publish(
      new Map<string, RGBIO>([
        ['strobe1', rgbio({ red: 255, green: 255, blue: 255, intensity: 255 })],
      ]),
    )

    expect(wire()[1]).toBe(255)
    expect(wire()[7]).toBe(STROBE_VALUES.fast)
  })

  it('leaves lights the strobe does not drive alone', () => {
    const master = new MasterOutputState()
    master.setStrobeOutputEnabled(false)
    const strobeManager = new StrobeStateManager()
    const { publisher, wire } = setup(
      [
        STROBE_LIGHT,
        { id: 'front1', channels: { masterDimmer: 11, red: 12, green: 13, blue: 14 } },
      ],
      master,
      strobeManager,
    )
    strobeManager.setActive('fast', 'net')

    publisher.publish(
      new Map<string, RGBIO>([
        ['strobe1', rgbio({ red: 255, intensity: 255 })],
        ['front1', rgbio({ red: 180, intensity: 200 })],
      ]),
    )

    expect(wire()[2]).toBe(0)
    // The rest of the rig keeps running its cue, and only the strobe is held back.
    expect(wire()[11]).toBe(200)
    expect(wire()[12]).toBe(180)
  })

  it('does nothing when no strobe is running', () => {
    const master = new MasterOutputState()
    master.setStrobeOutputEnabled(false)
    const { publisher, wire } = setup([STROBE_LIGHT], master)

    publisher.publish(new Map<string, RGBIO>([['strobe1', rgbio({ red: 200, intensity: 200 })]]))

    // The gate suppresses an active strobe cue, not the fixture: with no strobe running these
    // lights are showing an ordinary cue and must keep showing it.
    expect(wire()[1]).toBe(200)
    expect(wire()[2]).toBe(200)
  })

  it('composes with the master dimmer on the rest of the rig', () => {
    const master = new MasterOutputState()
    master.setStrobeOutputEnabled(false)
    master.setDimmerPercent(50)
    const strobeManager = new StrobeStateManager()
    const { publisher, wire } = setup(
      [
        STROBE_LIGHT,
        { id: 'front1', channels: { masterDimmer: 11, red: 12, green: 13, blue: 14 } },
      ],
      master,
      strobeManager,
    )
    strobeManager.setActive('medium', 'net')

    publisher.publish(
      new Map<string, RGBIO>([
        ['strobe1', rgbio({ red: 255, intensity: 255 })],
        ['front1', rgbio({ red: 200, intensity: 200 })],
      ]),
    )

    expect(wire()[2]).toBe(0)
    expect(wire()[12]).toBe(100)
  })
})
