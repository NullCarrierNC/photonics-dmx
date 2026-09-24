import { IAudioCue } from '../../interfaces/IAudioCue'
import { CompiledAudioCue } from '../compiler/NodeCueCompiler'
import {
  AudioCueLayerStyle,
  AudioLightingNodeCueDefinition,
  AudioNodeCueDefinition,
} from '../../types/nodeCueTypes'
import { EffectRegistry } from './EffectRegistry'
import { BaseAudioNodeCue } from './BaseAudioNodeCue'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { noopRuntimeBroadcaster } from '../../../runtime/broadcaster'
import type { NodeCueDebugSwitch } from './executionTypes'

/**
 * Audio lighting node cue: primary / secondary / strobe slot semantics via `style`.
 */
export class AudioNodeCue extends BaseAudioNodeCue implements IAudioCue {
  constructor(
    groupId: string,
    compiledCue: CompiledAudioCue,
    effectRegistry?: EffectRegistry,
    runtimeBroadcaster?: RuntimeBroadcaster,
    debug?: NodeCueDebugSwitch,
  ) {
    const definition = compiledCue.definition as AudioNodeCueDefinition
    if (definition.kind !== 'lighting') {
      throw new Error('AudioNodeCue requires a lighting cue definition')
    }
    const lit = definition as AudioLightingNodeCueDefinition
    super(
      groupId,
      compiledCue,
      effectRegistry,
      runtimeBroadcaster ?? noopRuntimeBroadcaster(),
      lit.cueTypeId,
      debug,
    )
  }

  get style(): AudioCueLayerStyle {
    const def = this.compiledCue.definition as AudioLightingNodeCueDefinition
    const s = def.style
    if (s === 'secondary' || s === 'strobe') {
      return s
    }
    return 'primary'
  }

  protected shouldArmPrimarySetEffectOnFirstFrame(): boolean {
    return this.style === 'primary'
  }

  protected skipEffectRemovalOnStop(): boolean {
    return this.style === 'primary'
  }
}
