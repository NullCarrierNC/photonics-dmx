/**
 * AudioCueProcessor: strobe slot independent from secondary; getEffective* accessors.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { AudioCueProcessor } from '../../processors/AudioCueProcessor'
import { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { ChainFanout } from '../../controllers/ChainFanout'
import type { RigChain } from '../../controllers/RigChain'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import { IAudioCue } from '../../cues/interfaces/IAudioCue'
import { AudioCueType } from '../../cues/types/audioCueTypes'
import { createMockLightingConfig } from '../helpers/testFixtures'
import {
  DEFAULT_AUDIO_CONFIG,
  DEFAULT_AUDIO_IDLE_DETECTION,
} from '../../listeners/Audio/AudioConfig'
import { AUDIO_IDLE_EFFECT_NAME, AUDIO_IDLE_LAYER } from '../../processors/audioIdleConstants'
import { AudioLightingData } from '../../listeners/Audio/AudioTypes'
import { noopRuntimeBroadcaster } from '../../runtime/broadcaster'

const TEST_GROUP = 'audio-cue-processor-test-group'

function makeCue(cueType: AudioCueType, style: IAudioCue['style']): IAudioCue {
  return {
    id: `id:${cueType}`,
    cueType,
    name: cueType,
    description: '',
    style,
    execute: jest.fn(async () => {}) as IAudioCue['execute'],
    onStop: jest.fn(),
  }
}

function minimalLightingData(energy: number): AudioLightingData {
  return {
    timestamp: Date.now(),
    overallLevel: energy,
    bpm: null,
    beatDetected: false,
    energy,
  }
}

/** AudioCueProcessor fires handleAudioData without awaiting; flush async completion. */
async function flushAudioFrame(): Promise<void> {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

describe('AudioCueProcessor', () => {
  let registry: AudioCueRegistry
  let lightManager: DmxLightManager
  let sequencer: ILightingController
  let processor: AudioCueProcessor

  beforeEach(() => {
    jest.useRealTimers()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    registry = AudioCueRegistry.getInstance()
    registry.reset()

    const primary = makeCue('proc-primary', 'primary')
    const secondary = makeCue('proc-secondary', 'secondary')
    const strobe = makeCue('proc-strobe', 'strobe')

    registry.registerGroup({
      id: TEST_GROUP,
      name: 'Test',
      description: '',
      cues: new Map<AudioCueType, IAudioCue>([
        ['proc-primary', primary],
        ['proc-secondary', secondary],
        ['proc-strobe', strobe],
      ]),
    })

    const config = createMockLightingConfig()
    lightManager = new DmxLightManager(config)
    sequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn(),
      removeEffect: jest.fn(),
      removeAllEffects: jest.fn(),
      removeEffectByLayer: jest.fn(),
      addEffectUnblockedName: jest.fn(),
      setEffectUnblockedName: jest.fn(),
      onBeat: jest.fn(),
    } as unknown as ILightingController

    const audioConfig = {
      ...DEFAULT_AUDIO_CONFIG,
      strobeEnabled: true,
      strobeTriggerThreshold: 0.5,
      strobeProbability: 100,
      idleDetection: {
        ...DEFAULT_AUDIO_IDLE_DETECTION,
        minIdleSeconds: 2,
        resumeSeconds: 1,
        thresholdPct: 50,
      },
    }

    // Wrap the stub light manager + sequencer in a fake chain so the processor's
    // ChainFanout-based fanout has somewhere to dispatch.
    const fakeChain = {
      rigId: 'stub',
      isPrimary: true,
      dmxLightManager: lightManager,
      sequencer,
      yargCueHandler: null,
      audioCueHandler: null,
      rb3MenuCueHandler: null,
    } as unknown as RigChain
    const chainFanout = new ChainFanout()
    chainFanout.setChains([fakeChain])

    processor = new AudioCueProcessor(
      chainFanout,
      noopRuntimeBroadcaster(),
      audioConfig,
      'proc-primary',
      'proc-secondary',
      () => 5000,
    )
    processor.start()
  })

  afterEach(() => {
    processor.shutdown()
    registry.reset()
    jest.restoreAllMocks()
    jest.useFakeTimers()
  })

  it('keeps manual secondary while strobe is active (both execute)', async () => {
    const primary = registry.getCueImplementation('proc-primary')!
    const secondary = registry.getCueImplementation('proc-secondary')!
    const strobeCue = registry.getCueImplementation('proc-strobe')!

    processor.processAudioData(minimalLightingData(0.9))
    await flushAudioFrame()

    expect(primary.execute).toHaveBeenCalled()
    expect(secondary.execute).toHaveBeenCalled()
    expect(strobeCue.execute).toHaveBeenCalled()

    expect(processor.getEffectiveSecondaryCueType()).toBe('proc-secondary')
    expect(processor.getEffectiveStrobeCueType()).toBe('proc-strobe')
  })

  it('applies idle look and skips cue execution when game mode idle threshold sustained', () => {
    let t = 0
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      t += 500
      return t
    })
    try {
      processor.enableGameMode({ enabled: true, cueDurationMin: 5, cueDurationMax: 20 })
      const primary = registry.getCueImplementation('proc-primary')!
      ;(primary.execute as jest.Mock).mockClear()

      for (let i = 0; i < 12; i += 1) {
        processor.processAudioData({
          ...minimalLightingData(0.01),
          overallLevel: 0.01,
          energy: 0.01,
        })
      }

      expect(sequencer.setEffect).toHaveBeenCalledWith(
        AUDIO_IDLE_EFFECT_NAME,
        expect.anything(),
        true,
      )
      expect((primary.execute as jest.Mock).mock.calls.length).toBeLessThan(12)
    } finally {
      nowSpy.mockRestore()
      processor.disableGameMode()
    }
  })

  it('idle: setMotionEnabled(false) on enter, no handleAudioData while idle, removeEffect and setMotionEnabled(true) on exit', () => {
    const setMotionSpy = jest.spyOn(AudioCueHandler.prototype, 'setMotionEnabled')
    const handleDataSpy = jest.spyOn(AudioCueHandler.prototype, 'handleAudioData')
    let t = 0
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      t += 500
      return t
    })
    try {
      processor.enableGameMode({ enabled: true, cueDurationMin: 5, cueDurationMax: 20 })
      setMotionSpy.mockClear()
      handleDataSpy.mockClear()

      for (let i = 0; i < 12; i += 1) {
        processor.processAudioData({
          ...minimalLightingData(0.01),
          overallLevel: 0.01,
          energy: 0.01,
        })
      }

      expect(setMotionSpy).toHaveBeenCalledWith(false)
      setMotionSpy.mockClear()
      handleDataSpy.mockClear()

      for (let i = 0; i < 4; i += 1) {
        processor.processAudioData({
          ...minimalLightingData(0.01),
          overallLevel: 0.01,
          energy: 0.01,
        })
      }
      expect(handleDataSpy).not.toHaveBeenCalled()
      expect(setMotionSpy).not.toHaveBeenCalled()

      for (let i = 0; i < 10; i += 1) {
        processor.processAudioData({
          ...minimalLightingData(0.9),
          overallLevel: 0.9,
          energy: 0.9,
        })
      }

      expect(sequencer.removeEffect).toHaveBeenCalledWith(AUDIO_IDLE_EFFECT_NAME, AUDIO_IDLE_LAYER)
      expect(setMotionSpy).toHaveBeenCalledWith(true)
    } finally {
      nowSpy.mockRestore()
      setMotionSpy.mockRestore()
      handleDataSpy.mockRestore()
      processor.disableGameMode()
    }
  })

  it('getEffectiveSecondaryCueType returns manual secondary only, not strobe', async () => {
    processor.processAudioData(minimalLightingData(0.9))
    await flushAudioFrame()
    expect(processor.getEffectiveSecondaryCueType()).toBe('proc-secondary')
    expect(processor.getEffectiveStrobeCueType()).toBe('proc-strobe')
  })

  it('getEffectiveStrobeCueType is null when energy below threshold', async () => {
    processor.processAudioData(minimalLightingData(0.1))
    await flushAudioFrame()
    expect(processor.getEffectiveStrobeCueType()).toBeNull()
    expect(processor.getEffectiveSecondaryCueType()).toBe('proc-secondary')
  })
})
