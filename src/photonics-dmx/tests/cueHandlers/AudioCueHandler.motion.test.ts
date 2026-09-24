import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { AudioCueHandler } from '../../cueHandlers/AudioCueHandler'
import { createAudioMotionCoordinator } from '../../cueHandlers/audioMotionCoordinator'
import { AudioCueRegistry } from '../../cues/registries/AudioCueRegistry'
import type { IAudioCue } from '../../cues/interfaces/IAudioCue'
import type { DmxLightManager } from '../../controllers/DmxLightManager'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  completingLightingController,
  fakeLightingController,
} from '../helpers/fakeLightingController'

type FakeCue = IAudioCue & { execute: jest.Mock; onStop: jest.Mock }

function makeFakeCue(id: string): FakeCue {
  return { id, execute: jest.fn(), onStop: jest.fn() } as unknown as FakeCue
}

const REF = { groupId: 'audio-motion', cueId: 'motion-a' }

describe('AudioCueHandler motion reporting', () => {
  let registry: AudioCueRegistry
  let emit: jest.Mock
  let handler: AudioCueHandler

  beforeEach(() => {
    jest.restoreAllMocks()
    registry = AudioCueRegistry.getInstance()
    emit = jest.fn()
    handler = new AudioCueHandler({} as DmxLightManager, fakeLightingController(), {
      motionCoordinator: createAudioMotionCoordinator({
        runtimeBroadcaster: { emit } as never,
        getMotionCueMinimumHoldMs: () => 0,
      }),
    })
    jest.spyOn(registry, 'findMotionCueRef').mockReturnValue(REF)
  })

  it('reports the running motion cue once a primary cue picks one', () => {
    const primary = makeFakeCue('primary')
    const motion = makeFakeCue('motion-a')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(primary)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)

    handler.syncSlots('wash', null)

    expect(handler.getRunningMotionCue()).toEqual({
      ref: REF,
      source: 'auto',
      manualFallback: false,
    })
    expect(emit).toHaveBeenCalledWith(
      RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE,
      expect.objectContaining({ ref: REF, source: 'auto' }),
    )
  })

  it('reports cleared and broadcasts it when the look ends', () => {
    const primary = makeFakeCue('primary')
    const motion = makeFakeCue('motion-a')
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(primary)
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)
    handler.syncSlots('wash', null)
    emit.mockClear()

    handler.clearCurrentCue()

    expect(motion.onStop).toHaveBeenCalledTimes(1)
    expect(handler.getRunningMotionCue().ref).toBeNull()
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE,
      expect.objectContaining({ ref: null, source: 'cleared' }),
    )
  })

  it('does not broadcast a clear when no motion cue was running', () => {
    handler.clearCurrentCue()

    expect(emit).not.toHaveBeenCalled()
  })

  it('keeps a re-picked cue running and still reports it', () => {
    const wash = makeFakeCue('wash')
    const pulse = makeFakeCue('pulse')
    const motion = makeFakeCue('motion-a')
    jest
      .spyOn(registry, 'getCueImplementation')
      .mockImplementation((cueType) => (cueType === 'wash' ? wash : pulse))
    jest.spyOn(registry, 'getRandomMotionCue').mockReturnValue(motion)

    handler.syncSlots('wash', null)
    handler.syncSlots('pulse', null)

    expect(motion.onStop).not.toHaveBeenCalled()
    expect(handler.getRunningMotionCue().ref).toEqual(REF)
  })
})

describe('AudioCueHandler motion after its sequencer drops the patterns', () => {
  it('picks motion again on the next frame, inside the hold', () => {
    jest.restoreAllMocks()
    const registry = AudioCueRegistry.getInstance()
    const sequencer = completingLightingController()
    const handler = new AudioCueHandler({} as DmxLightManager, sequencer, {
      motionCoordinator: createAudioMotionCoordinator({ getMotionCueMinimumHoldMs: () => 60_000 }),
    })
    jest.spyOn(registry, 'findMotionCueRef').mockReturnValue(REF)
    jest.spyOn(registry, 'getCueImplementation').mockReturnValue(makeFakeCue('primary'))
    const getRandom = jest
      .spyOn(registry, 'getRandomMotionCue')
      .mockReturnValueOnce(makeFakeCue('motion-a'))
      .mockReturnValueOnce(makeFakeCue('motion-b'))

    try {
      handler.syncSlots('wash', null)
      sequencer.removeAllEffects()
      handler.syncSlots('wash', null)

      expect(getRandom).toHaveBeenCalledTimes(2)
    } finally {
      handler.destroy()
    }
  })
})
