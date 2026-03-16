/**
 * Eager cache of compiled effects keyed by mode, effect file id, and effect id.
 * When the loader uses this, effects are compiled once and reused across cues.
 */

import type { CompiledEffect } from './EffectRegistry'
import type { NodeCueMode } from '../../types/nodeCueTypes'

function indexKey(mode: NodeCueMode, effectFileId: string, effectId: string): string {
  return `${mode}:${effectFileId}:${effectId}`
}

export class CompiledEffectIndex {
  private cache = new Map<string, CompiledEffect>()

  get(mode: NodeCueMode, effectFileId: string, effectId: string): CompiledEffect | undefined {
    return this.cache.get(indexKey(mode, effectFileId, effectId))
  }

  set(mode: NodeCueMode, effectFileId: string, effectId: string, compiled: CompiledEffect): void {
    this.cache.set(indexKey(mode, effectFileId, effectId), compiled)
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}
