/**
 * AudioCueHandler: primary + secondary + strobe slots execute independently (dedup same instance).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ILightingController } from '../../controllers/sequencer/interfaces'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import { IAudioCue } from '../../cues/interfaces/IAudioCue'
import { AudioCueType } from '../../cues/types/audioCueTypes'
import { createMockLightingConfig } from '../helpers/testFixtures'
import type { AudioConfig, AudioLightingData } from '../../listeners/Audio/AudioTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../listeners/Audio/AudioConfig'

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

function minimalLighting(energy: number): AudioLightingData {
  return {
    timestamp: Date.now(),
    overallLevel: energy,
    bpm: null,
    beatDetected: false,
    energy,
  }
}

const TEST_GROUP = 'audio-cue-handler-test-group'

describe('AudioCueHandler', () => {
  let registry: AudioCueRegistry
  let lightManager: DmxLightManager
  let sequencer: ILightingController
  let handler: AudioCueHandler
  let audioConfig: AudioConfig

  beforeEach(() => {
    registry = AudioCueRegistry.getInstance()
    registry.reset()

    const primary = makeCue('primary-a', 'primary')
    const secondary = makeCue('secondary-a', 'secondary')
    const strobe = makeCue('strobe-a', 'strobe')

    registry.registerGroup({
      id: TEST_GROUP,
      name: 'Test',
      description: '',
      cues: new Map<AudioCueType, IAudioCue>([
        ['primary-a', primary],
        ['secondary-a', secondary],
        ['strobe-a', strobe],
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

    handler = new AudioCueHandler(lightManager, sequencer)

    audioConfig = {
      ...DEFAULT_AUDIO_CONFIG,
      strobeEnabled: true,
      strobeTriggerThreshold: 0.5,
      strobeProbability: 100,
    }
  })

  afterEach(() => {
    registry.reset()
  })

  it('runs primary, secondary, and strobe cues in one frame', async () => {
    const primary = registry.getCueImplementation('primary-a')!
    const secondary = registry.getCueImplementation('secondary-a')!
    const strobe = registry.getCueImplementation('strobe-a')!

    await handler.handleAudioData(
      minimalLighting(0.5),
      audioConfig,
      'primary-a',
      'secondary-a',
      'strobe-a',
      0,
    )

    expect(primary.execute).toHaveBeenCalledTimes(1)
    expect(secondary.execute).toHaveBeenCalledTimes(1)
    expect(strobe.execute).toHaveBeenCalledTimes(1)
  })

  it('executes a cue once when it is assigned to multiple slots (same instance)', async () => {
    const primary = registry.getCueImplementation('primary-a')!
    const strobe = registry.getCueImplementation('strobe-a')!

    await handler.handleAudioData(
      minimalLighting(0.5),
      audioConfig,
      'primary-a',
      'primary-a',
      'strobe-a',
      0,
    )

    expect(primary.execute).toHaveBeenCalledTimes(1)
    expect(strobe.execute).toHaveBeenCalledTimes(1)
  })

  it('clears strobe slot when strobe cue type is null', async () => {
    const strobe = registry.getCueImplementation('strobe-a')!

    await handler.handleAudioData(
      minimalLighting(0.5),
      audioConfig,
      'primary-a',
      'secondary-a',
      'strobe-a',
      0,
    )
    expect(strobe.execute).toHaveBeenCalledTimes(1)

    await handler.handleAudioData(
      minimalLighting(0.5),
      audioConfig,
      'primary-a',
      'secondary-a',
      null,
      0,
    )

    expect(strobe.onStop).toHaveBeenCalled()
  })

  it('syncSlots with null strobe does not stop primary or secondary', async () => {
    const primary = registry.getCueImplementation('primary-a')!
    const secondary = registry.getCueImplementation('secondary-a')!

    handler.syncSlots('primary-a', 'secondary-a', 'strobe-a')
    await handler.handleAudioData(
      minimalLighting(0.5),
      audioConfig,
      'primary-a',
      'secondary-a',
      'strobe-a',
      0,
    )

    handler.syncSlots('primary-a', 'secondary-a', null)

    await handler.handleAudioData(
      minimalLighting(0.5),
      audioConfig,
      'primary-a',
      'secondary-a',
      null,
      0,
    )

    expect(primary.onStop).not.toHaveBeenCalled()
    expect(secondary.onStop).not.toHaveBeenCalled()
  })
})
