import { MotionSelectionCoordinator } from './MotionSelectionCoordinator'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import type { IAudioCue } from '../cues/interfaces/IAudioCue'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { RuntimeBroadcaster } from '../runtime/broadcaster'

export interface AudioMotionCoordinatorOptions {
  getMotionCueMinimumHoldMs?: () => number
  /** Probability (0-100) that an automatic pick plays on a primary cue change. */
  getMotionCueProbabilityPercent?: () => number
  runtimeBroadcaster?: RuntimeBroadcaster
}

/** The audio input's motion decision, shared by the audio cue handler on every rig chain. */
export function createAudioMotionCoordinator(
  options: AudioMotionCoordinatorOptions = {},
): MotionSelectionCoordinator<IAudioCue> {
  return new MotionSelectionCoordinator<IAudioCue>({
    ...options,
    registry: AudioCueRegistry.getInstance(),
    motionChangeChannel: RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE,
    domainLabel: 'audio',
  })
}
