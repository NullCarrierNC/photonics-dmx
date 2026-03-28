/**
 * AudioCueProcessor: strobe slot independent from secondary; getEffective* accessors.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { AudioCueProcessor } from '../../processors/AudioCueProcessor'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import { IAudioCue } from '../../cues/interfaces/IAudioCue'
import { AudioCueType } from '../../cues/types/audioCueTypes'
import { createMockLightingConfig } from '../helpers/testFixtures'
import { DEFAULT_AUDIO_CONFIG } from '../../listeners/Audio/AudioConfig'
import { AudioLightingData } from '../../listeners/Audio/AudioTypes'

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
    onDestroy: jest.fn(),
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
    }

    processor = new AudioCueProcessor(
      lightManager,
      sequencer,
      audioConfig,
      'proc-primary',
      'proc-secondary',
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
