import fs from 'fs'
import path from 'path'
import { EffectRegistry } from '../../cues/node/runtime/EffectRegistry'
import { EffectCompiler } from '../../cues/node/compiler/EffectCompiler'

/**
 * Build an EffectRegistry with the named core effects compiled + registered. Node cues only paint
 * their effect raisers when the referenced effect definitions are registered (the real runtime
 * registers a cue's effect dependencies on load), so tests that exercise effect raisers must seed it.
 */
export function loadCoreEffectRegistry(effectIds: string[]): EffectRegistry {
  const filePath = path.join(
    __dirname,
    '../../../../resources/defaults/node-data/effects/yarg/yarg-core-effects.json',
  )
  const file = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { effects: Array<{ id: string }> }
  const registry = new EffectRegistry()
  for (const id of effectIds) {
    const def = file.effects.find((e) => e.id === id)
    if (!def) throw new Error(`effect ${id} not found in yarg-core-effects`)
    registry.registerEffect(id, EffectCompiler.compile(def as never))
  }
  return registry
}
