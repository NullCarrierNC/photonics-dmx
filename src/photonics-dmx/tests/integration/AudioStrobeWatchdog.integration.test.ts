import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { performance } from 'perf_hooks'
import { AudioCueProcessor } from '../../processors/AudioCueProcessor'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import { ChainFanout } from '../../controllers/ChainFanout'
import { RigChain } from '../../controllers/RigChain'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import type { SenderManager } from '../../controllers/SenderManager'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { DEFAULT_AUDIO_CONFIG } from '../../listeners/Audio/AudioConfig'
import { noopRuntimeBroadcaster } from '../../runtime/broadcaster'
import {
  ConfigStrobeType,
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
  type DmxRig,
  type RGBIO,
  type WireSenderId,
} from '../../types'
import type { IAudioCue } from '../../cues/interfaces/IAudioCue'
import type { AudioLightingData } from '../../listeners/Audio/AudioTypes'

const STROBE_CHANNEL = 5

const WHITE: RGBIO = {
  red: 255,
  green: 255,
  blue: 255,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

const RIG: DmxRig = {
  id: 'rig-a',
  name: 'rig-a',
  active: true,
  config: {
    numLights: 1,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights: [
      {
        id: 'strobe-light',
        fixtureId: 'tpl-strobe',
        position: 1,
        name: 'S1',
        label: 'S1',
        fixture: FixtureTypes.RGB,
        isStrobeEnabled: true,
        group: 'front',
        universe: 1,
        mount: 'floor',
        channels: {
          red: 1,
          green: 2,
          blue: 3,
          masterDimmer: 4,
          strobeChannel: STROBE_CHANNEL,
        } as unknown as DmxRig['config']['frontLights'][number]['channels'],
      },
    ],
    backLights: [],
    strobeLights: [],
  },
}

/** A primary that paints the rig white, so the strobe has a look to chop. */
const primaryCue: IAudioCue = {
  id: 'id:watchdog-primary',
  cueType: 'watchdog-primary',
  name: 'watchdog-primary',
  description: '',
  style: 'primary',
  execute: (_data, sequencer, lightManager) => {
    const lights = lightManager.getLights(['front'], ['all'])
    sequencer.addEffect('watchdog-primary-paint', {
      id: 'paint',
      description: '',
      transitions: [
        {
          lights,
          layer: 0,
          waitForCondition: 'none',
          waitForTime: 0,
          transform: { color: WHITE, easing: 'linear', duration: 0 },
          waitUntilCondition: 'none',
          waitUntilTime: 0,
        },
      ],
    })
  },
}

/** The hardware strobe channel follows the strobe slot, so this cue draws nothing of its own. */
const strobeCue: IAudioCue = {
  id: 'id:watchdog-strobe',
  cueType: 'watchdog-strobe',
  name: 'watchdog-strobe',
  description: '',
  style: 'strobe',
  execute: () => {},
  onStop: jest.fn(),
}

const loudFrame = (): AudioLightingData => ({
  timestamp: Date.now(),
  overallLevel: 0.95,
  bpm: null,
  beatDetected: false,
  energy: 0.95,
})

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('an audio strobe once audio frames stop', () => {
  let perfNowSpy: ReturnType<typeof jest.spyOn>
  let registry: AudioCueRegistry
  let clock: ManualTestClock
  let chain: RigChain
  let fanout: ChainFanout
  let publisher: DmxPublisher
  let processor: AudioCueProcessor
  const sends: Array<Record<number, number>> = []

  const lastWireFrame = (): Record<number, number> | undefined => sends[sends.length - 1]

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(0)
    perfNowSpy = jest.spyOn(performance, 'now').mockImplementation(() => Date.now())
    sends.length = 0

    registry = AudioCueRegistry.getInstance()
    registry.reset()
    registry.registerGroup({
      id: 'audio-strobe-watchdog',
      name: 'Watchdog',
      description: '',
      cues: new Map([
        [primaryCue.cueType, primaryCue],
        [strobeCue.cueType, strobeCue],
      ]),
    })

    clock = new ManualTestClock()
    chain = new RigChain({ rigId: RIG.id, config: RIG.config, clock, isPrimary: true })
    fanout = new ChainFanout()
    fanout.setChains([chain])

    const sender = {
      send: (_slot: WireSenderId, buffer: Record<number, number>) => {
        sends.push({ ...buffer })
        return Promise.resolve(true)
      },
      getEnabledWireSenders: (): WireSenderId[] => ['sacn'],
      isIpcEnabled: () => false,
    }
    publisher = new DmxPublisher(sender as unknown as SenderManager, null, fanout.strobeState)
    publisher.setRigChains([chain])
    publisher.updateActiveRigs([RIG])

    processor = new AudioCueProcessor(
      fanout,
      noopRuntimeBroadcaster(),
      {
        ...DEFAULT_AUDIO_CONFIG,
        strobeEnabled: true,
        strobeTriggerThreshold: 0.8,
        strobeProbability: 100,
      },
      primaryCue.cueType,
      null,
    )
    processor.start()
  })

  afterEach(() => {
    processor.shutdown()
    publisher.shutdown()
    chain.dispose()
    registry.reset()
    perfNowSpy.mockRestore()
    jest.useRealTimers()
  })

  async function playLoud(frames: number): Promise<void> {
    for (let i = 0; i < frames; i++) {
      processor.processAudioData(loudFrame())
      await flushMicrotasks()
      clock.tick(10)
      jest.advanceTimersByTime(20)
      await flushMicrotasks()
    }
  }

  it('drives the hardware strobe channel while frames arrive', async () => {
    await playLoud(10)

    expect(fanout.strobeState.getActive()).toBe('medium')
    expect(lastWireFrame()?.[STROBE_CHANNEL]).toBe(DEFAULT_STROBE_CHANNEL_VALUES.medium)
  })

  it('releases the strobe slot and parks the strobe channel 2 s after the frames stop', async () => {
    await playLoud(10)

    jest.advanceTimersByTime(2500)
    await flushMicrotasks()

    expect(fanout.strobeState.getActive()).toBeNull()
    expect(processor.getEffectiveStrobeCueType()).toBeNull()
    expect(lastWireFrame()?.[STROBE_CHANNEL]).toBe(0)
  })
})
