import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { performance } from 'perf_hooks'
import { AudioCueProcessor } from '../../processors/AudioCueProcessor'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import { ChainFanout } from '../../controllers/ChainFanout'
import { RigChain } from '../../controllers/RigChain'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { createMockLightingConfig } from '../helpers/testFixtures'
import {
  DEFAULT_AUDIO_CONFIG,
  DEFAULT_AUDIO_IDLE_DETECTION,
} from '../../listeners/Audio/AudioConfig'
import { AUDIO_IDLE_EFFECT_NAME } from '../../processors/audioIdleConstants'
import { noopRuntimeBroadcaster } from '../../runtime/broadcaster'
import type { IAudioCue } from '../../cues/interfaces/IAudioCue'
import type { AudioLightingData } from '../../listeners/Audio/AudioTypes'

const primaryCue: IAudioCue = {
  id: 'id:idle-primary',
  cueType: 'idle-primary',
  name: 'idle-primary',
  description: '',
  style: 'primary',
  execute: () => {},
}

const strobeCue: IAudioCue = {
  id: 'id:idle-strobe',
  cueType: 'idle-strobe',
  name: 'idle-strobe',
  description: '',
  style: 'strobe',
  execute: () => {},
  onStop: jest.fn(),
}

const levelFrame = (level: number): AudioLightingData => ({
  timestamp: Date.now(),
  overallLevel: level,
  bpm: null,
  beatDetected: false,
  energy: level,
})

describe('AudioCueProcessor entering idle with a strobe running', () => {
  let perfNowSpy: ReturnType<typeof jest.spyOn>
  let registry: AudioCueRegistry
  let clock: ManualTestClock
  let chain: RigChain
  let fanout: ChainFanout
  let processor: AudioCueProcessor
  let strobeStates: boolean[]

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(0)
    perfNowSpy = jest.spyOn(performance, 'now').mockImplementation(() => Date.now())
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    registry = AudioCueRegistry.getInstance()
    registry.reset()
    registry.registerGroup({
      id: 'audio-idle-strobe',
      name: 'Idle strobe',
      description: '',
      cues: new Map([
        [primaryCue.cueType, primaryCue],
        [strobeCue.cueType, strobeCue],
      ]),
    })

    clock = new ManualTestClock()
    chain = new RigChain({
      rigId: 'rig-a',
      config: createMockLightingConfig(),
      clock,
      isPrimary: true,
    })
    fanout = new ChainFanout()
    fanout.setChains([chain])

    processor = new AudioCueProcessor(
      fanout,
      noopRuntimeBroadcaster(),
      {
        ...DEFAULT_AUDIO_CONFIG,
        strobeEnabled: true,
        strobeTriggerThreshold: 0.15,
        strobeProbability: 100,
        idleDetection: {
          ...DEFAULT_AUDIO_IDLE_DETECTION,
          thresholdPct: 20,
          minIdleSeconds: 1,
          resumeSeconds: 1,
        },
      },
      primaryCue.cueType,
      null,
    )
    strobeStates = []
    processor.setOnStrobeStateChange((active) => strobeStates.push(active))
    processor.start()
    processor.enableGameMode({ enabled: true, cueDurationMin: 60, cueDurationMax: 90 })
  })

  afterEach(() => {
    processor.shutdown()
    chain.dispose()
    registry.reset()
    perfNowSpy.mockRestore()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  async function feed(level: number, frames: number): Promise<void> {
    for (let i = 0; i < frames; i++) {
      processor.processAudioData(levelFrame(level))
      clock.tick(16)
      await jest.advanceTimersByTimeAsync(16)
    }
  }

  const idleLookRunning = (): boolean => {
    const lightId = chain.dmxLightManager.getLights(['front'], ['all'])[0].id
    const effects = chain.sequencer.getActiveEffectsForLight(lightId)
    return [...effects.values()].some((e) => e.name === AUDIO_IDLE_EFFECT_NAME)
  }

  it('releases the strobe slot when idle begins between the strobe and idle thresholds', async () => {
    await feed(0.5, 20)
    expect(fanout.strobeState.getActive()).toBe('medium')
    expect(processor.getEffectiveStrobeCueType()).toBe(strobeCue.cueType)

    await feed(0.17, 100)

    expect(idleLookRunning()).toBe(true)
    expect(fanout.strobeState.getActive()).toBeNull()
    expect(processor.getEffectiveStrobeCueType()).toBeNull()
    expect(strobeStates).toEqual([true, false])
    expect(strobeCue.onStop).toHaveBeenCalled()
  })
})
