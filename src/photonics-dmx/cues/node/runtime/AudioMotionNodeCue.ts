import { IAudioCue } from '../../interfaces/IAudioCue'
import { AudioCueData } from '../../types/audioCueTypes'
import { CompiledAudioCue } from '../compiler/NodeCueCompiler'
import { AudioMotionNodeCueDefinition, AudioNodeCueDefinition } from '../../types/nodeCueTypes'
import { EffectRegistry } from './EffectRegistry'
import { BaseAudioNodeCue } from './BaseAudioNodeCue'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { noopRuntimeBroadcaster } from '../../../runtime/broadcaster'

/**
 * Maximum BPM passed into audio motion graphs. Detected tempo can spike; motion-pattern speed is in Hz
 * and uncapped oscillation can be unsafe on real moving heads.
 */
export const AUDIO_MOTION_MAX_BPM = 130

/** Shallow-clone cue data with BPM capped for motion-pattern speed safety. */
export function withMotionSafeAudioData(data: AudioCueData): AudioCueData {
  const rawBpm = data.audioData.bpm ?? 0
  const safeBpm = Math.min(rawBpm, AUDIO_MOTION_MAX_BPM)
  return {
    ...data,
    audioData: { ...data.audioData, bpm: safeBpm },
  }
}

/**
 * Audio motion node cue: pan/tilt / motion-pattern programs parallel to lighting. Does not use
 * primary/secondary/strobe slot semantics (`style` is omitted). BPM is clamped before graph execution.
 */
export class AudioMotionNodeCue extends BaseAudioNodeCue implements IAudioCue {
  constructor(
    groupId: string,
    compiledCue: CompiledAudioCue,
    effectRegistry?: EffectRegistry,
    runtimeBroadcaster?: RuntimeBroadcaster,
  ) {
    const definition = compiledCue.definition as AudioNodeCueDefinition
    if (definition.kind !== 'motion') {
      throw new Error('AudioMotionNodeCue requires a motion cue definition')
    }
    const motion = definition as AudioMotionNodeCueDefinition
    super(
      groupId,
      compiledCue,
      effectRegistry,
      runtimeBroadcaster ?? noopRuntimeBroadcaster(),
      motion.id,
    )
  }

  protected transformCueDataForExecution(data: AudioCueData): AudioCueData {
    return withMotionSafeAudioData(data)
  }

  protected shouldArmPrimarySetEffectOnFirstFrame(): boolean {
    return false
  }

  protected skipEffectRemovalOnStop(): boolean {
    return false
  }
}
