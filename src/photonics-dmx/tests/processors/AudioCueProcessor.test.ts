/**
 * AudioCueProcessor: strobe slot independent from secondary; getEffective* accessors; the secondary
 * runtime tee (same frame and cue types as the lighting fan-out, solo suppression, idle blank).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { performance } from 'perf_hooks'
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
import type { AudioSecondaryRuntime } from '../../processors/AudioSecondaryRuntime'
import { fakeLightingController } from '../helpers/fakeLightingController'

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

function makeSecondaryRuntime(
  decision: { plays: boolean; suppress: boolean } = { plays: true, suppress: false },
): AudioSecondaryRuntime & Record<string, jest.Mock> {
  return {
    handleFrame: jest.fn(),
    getLastDispatchDecision: jest.fn(() => decision),
    blank: jest.fn(),
  } as unknown as AudioSecondaryRuntime & Record<string, jest.Mock>
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
    sequencer = fakeLightingController()

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
      cueHandlers: {
        yarg: null,
        rb3: null,
      },
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
    const nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
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
    const nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
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

  it('rolls the strobe probability once per rising edge above threshold, not every frame', async () => {
    const strobeCue = registry.getCueImplementation('proc-strobe')!
    // 0.5 * 100 = 50, which fails any probability below 50: the roll never succeeds here.
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5)

    const fakeChain = {
      rigId: 'stub-low-prob',
      isPrimary: true,
      dmxLightManager: lightManager,
      sequencer,
      cueHandlers: { yarg: null, rb3: null },
      audioCueHandler: null,
      rb3MenuCueHandler: null,
    } as unknown as RigChain
    const chainFanout = new ChainFanout()
    chainFanout.setChains([fakeChain])

    const lowProbProcessor = new AudioCueProcessor(
      chainFanout,
      noopRuntimeBroadcaster(),
      {
        ...DEFAULT_AUDIO_CONFIG,
        strobeEnabled: true,
        strobeTriggerThreshold: 0.5,
        strobeProbability: 10,
      },
      'proc-primary',
      'proc-secondary',
      () => 5000,
    )
    lowProbProcessor.start()

    lowProbProcessor.processAudioData(minimalLightingData(0.9))
    await flushAudioFrame()
    const callsAfterFirstFrame = randomSpy.mock.calls.length
    expect(callsAfterFirstFrame).toBeGreaterThan(0)
    expect(strobeCue.execute).not.toHaveBeenCalled()

    // Energy stays above threshold for two more frames: without rolling once per rising edge,
    // this would call Math.random again on each of them and, over enough frames, the strobe would
    // fire on most loud passages even at a 10% probability instead of roughly one in ten.
    lowProbProcessor.processAudioData(minimalLightingData(0.9))
    await flushAudioFrame()
    lowProbProcessor.processAudioData(minimalLightingData(0.9))
    await flushAudioFrame()
    expect(randomSpy.mock.calls.length).toBe(callsAfterFirstFrame)
    expect(lowProbProcessor.getEffectiveStrobeCueType()).toBeNull()

    // Dropping back below threshold and rising again is a new edge, so it rolls once more.
    lowProbProcessor.processAudioData(minimalLightingData(0.1))
    await flushAudioFrame()
    lowProbProcessor.processAudioData(minimalLightingData(0.9))
    await flushAudioFrame()
    expect(randomSpy.mock.calls.length).toBeGreaterThan(callsAfterFirstFrame)

    lowProbProcessor.shutdown()
    randomSpy.mockRestore()
  })

  describe('strobe release hysteresis', () => {
    const makeStrobeProcessor = (strobeProbability: number): AudioCueProcessor => {
      const fakeChain = {
        rigId: 'stub-hysteresis',
        isPrimary: true,
        dmxLightManager: lightManager,
        sequencer,
        cueHandlers: { yarg: null, rb3: null },
        audioCueHandler: null,
        rb3MenuCueHandler: null,
      } as unknown as RigChain
      const chainFanout = new ChainFanout()
      chainFanout.setChains([fakeChain])
      return new AudioCueProcessor(
        chainFanout,
        noopRuntimeBroadcaster(),
        {
          ...DEFAULT_AUDIO_CONFIG,
          strobeEnabled: true,
          strobeTriggerThreshold: 0.5,
          strobeProbability,
        },
        'proc-primary',
        'proc-secondary',
        () => 5000,
      )
    }

    const feed = async (processor: AudioCueProcessor, energies: number[]): Promise<void> => {
      for (const energy of energies) {
        processor.processAudioData(minimalLightingData(energy))
        await flushAudioFrame()
      }
    }

    it('rolls once while energy jitters around the threshold, and again after a real drop', async () => {
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5)
      const processor = makeStrobeProcessor(10)
      processor.start()

      await feed(processor, [0.9])
      const callsAfterRise = randomSpy.mock.calls.length
      expect(callsAfterRise).toBeGreaterThan(0)

      await feed(processor, [0.49, 0.51, 0.48, 0.52, 0.47, 0.53])
      expect(randomSpy.mock.calls.length).toBe(callsAfterRise)

      await feed(processor, [0.3, 0.9])
      expect(randomSpy.mock.calls.length).toBeGreaterThan(callsAfterRise)

      processor.shutdown()
      randomSpy.mockRestore()
    })

    it('holds an active strobe through a dip that stays above the release level', async () => {
      const processor = makeStrobeProcessor(100)
      processor.start()

      await feed(processor, [0.9])
      expect(processor.getEffectiveStrobeCueType()).not.toBeNull()

      await feed(processor, [0.48])
      expect(processor.getEffectiveStrobeCueType()).not.toBeNull()

      await feed(processor, [0.3])
      expect(processor.getEffectiveStrobeCueType()).toBeNull()

      processor.shutdown()
    })

    it('rolls again after a stop and restart while the audio is still loud', async () => {
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5)
      const processor = makeStrobeProcessor(10)
      processor.start()
      await feed(processor, [0.9])
      const callsBeforeRestart = randomSpy.mock.calls.length

      processor.stop()
      processor.start()
      await feed(processor, [0.9])

      expect(randomSpy.mock.calls.length).toBeGreaterThan(callsBeforeRestart)

      processor.shutdown()
      randomSpy.mockRestore()
    })
  })

  it('tees each frame to the secondary runtime with the lighting cue types', async () => {
    const runtime = makeSecondaryRuntime()
    processor.setSecondaryRuntime(runtime)

    processor.processAudioData(minimalLightingData(0.9))
    await flushAudioFrame()

    expect(runtime.handleFrame).toHaveBeenCalledWith(
      expect.objectContaining({ enabledBandCount: DEFAULT_AUDIO_CONFIG.bands.length }),
      'proc-primary',
      'proc-strobe',
    )
  })

  it('clears the lighting once and skips dispatch while the secondary runs solo', async () => {
    const handleDataSpy = jest.spyOn(AudioCueHandler.prototype, 'handleAudioData')
    const clearSpy = jest.spyOn(AudioCueHandler.prototype, 'clearCurrentCue')
    processor.setSecondaryRuntime(makeSecondaryRuntime({ plays: true, suppress: true }))
    handleDataSpy.mockClear()

    processor.processAudioData(minimalLightingData(0.9))
    processor.processAudioData(minimalLightingData(0.9))
    await flushAudioFrame()

    expect(handleDataSpy).not.toHaveBeenCalled()
    expect(clearSpy).toHaveBeenCalledTimes(1)
  })

  it('resumes the lighting when the secondary stops suppressing', async () => {
    const handleDataSpy = jest.spyOn(AudioCueHandler.prototype, 'handleAudioData')
    const decision = { plays: true, suppress: true }
    processor.setSecondaryRuntime(makeSecondaryRuntime(decision))
    handleDataSpy.mockClear()

    processor.processAudioData(minimalLightingData(0.9))
    await flushAudioFrame()
    expect(handleDataSpy).not.toHaveBeenCalled()

    decision.suppress = false
    processor.processAudioData(minimalLightingData(0.9))
    await flushAudioFrame()
    expect(handleDataSpy).toHaveBeenCalled()
  })

  it('blanks the secondary when the audio goes idle', () => {
    const runtime = makeSecondaryRuntime()
    processor.setSecondaryRuntime(runtime)
    let t = 0
    const nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 500
      return t
    })
    try {
      processor.enableGameMode({ enabled: true, cueDurationMin: 5, cueDurationMax: 20 })

      for (let i = 0; i < 12; i += 1) {
        processor.processAudioData({ ...minimalLightingData(0.01) })
      }

      expect(runtime.blank).toHaveBeenCalledTimes(1)
    } finally {
      nowSpy.mockRestore()
      processor.disableGameMode()
    }
  })
})
