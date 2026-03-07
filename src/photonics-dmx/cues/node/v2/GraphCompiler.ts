/**
 * V2 unified compilation facade. Delegates to NodeCueCompiler and EffectCompiler
 * so one entry point can be used for cues and effects.
 */

import { NodeCueCompiler } from '../compiler/NodeCueCompiler'
import { EffectCompiler } from '../compiler/EffectCompiler'
import type { CompiledYargCue } from '../compiler/NodeCueCompiler'
import type { CompiledYargEffect, CompiledAudioEffect } from '../compiler/EffectCompiler'
import type {
  YargNodeCueDefinition,
  YargEffectDefinition,
  AudioEffectDefinition,
} from '../../types/nodeCueTypes'

export { NodeCueCompilationError } from '../compiler/NodeCueCompiler'
export { EffectCompilationError } from '../compiler/EffectCompiler'

export class GraphCompiler {
  /** Compile a YARG cue definition (delegates to NodeCueCompiler). */
  static compileYargCue(definition: YargNodeCueDefinition): CompiledYargCue {
    return NodeCueCompiler.compileYargCue(definition)
  }

  /** Compile a YARG effect definition (delegates to EffectCompiler). */
  static compileYargEffect(definition: YargEffectDefinition): CompiledYargEffect {
    return EffectCompiler.compileYargEffect(definition)
  }

  /** Compile an effect by mode (delegates to EffectCompiler.compile). */
  static compileEffect(
    effect: YargEffectDefinition | AudioEffectDefinition,
  ): CompiledYargEffect | CompiledAudioEffect {
    return EffectCompiler.compile(effect)
  }
}
