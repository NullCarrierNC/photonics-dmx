/**
 * Compiling the effects a cue raises into the registry its engine looks them up in.
 *
 * A reference to a missing file or effect, or one that fails to compile, is logged and left out
 * of the registry, and the cue still builds.
 */
import { getCueDomain } from '../../domains'
import type { EffectFile, EffectMode, EffectReference, NodeCueMode } from '../../types/nodeCueTypes'
import { EffectRegistry } from '../runtime/EffectRegistry'
import { EffectCompiler } from '../compiler/EffectCompiler'
import type { EffectLoader } from './EffectLoader'
import { createLogger } from '../../../../shared/logger'
const log = createLogger('EffectRegistryBuilder')

/**
 * Effect files by group id per effect mode, read once and shared by every cue file built from it.
 */
export type EffectFilesByMode = Map<EffectMode, Promise<Map<string, EffectFile>>>

/**
 * Build the registry for one cue's effect references, reading each mode's effect files through
 * `effectFiles` the first time a reference needs them.
 */
export async function buildEffectRegistry(
  effectLoader: Pick<EffectLoader, 'readEffectFilesByGroupId'> | undefined,
  effectReferences: EffectReference[],
  mode: NodeCueMode,
  effectFiles: EffectFilesByMode,
): Promise<EffectRegistry> {
  const registry = new EffectRegistry()

  if (!effectLoader || effectReferences.length === 0) {
    return registry
  }

  // Which effect tree this mode raises from is the domain's to say, not the loader's: RB3 folds
  // onto the yarg tree, and a mode added later brings its own answer with its descriptor.
  const effectLoaderMode: EffectMode = getCueDomain(mode).effectMode
  let filesForMode = effectFiles.get(effectLoaderMode)
  if (!filesForMode) {
    filesForMode = effectLoader.readEffectFilesByGroupId(effectLoaderMode)
    effectFiles.set(effectLoaderMode, filesForMode)
  }
  const effectFilesById = await filesForMode

  for (const effectRef of effectReferences) {
    try {
      const effectFile = effectFilesById.get(effectRef.effectFileId)

      if (!effectFile) {
        log.warn(
          `Effect file ${effectRef.effectFileId} not found, skipping effect ${effectRef.effectId}`,
        )
        continue
      }

      const effect = effectFile.effects.find((e) => e.id === effectRef.effectId)

      if (!effect) {
        log.warn(
          `Effect ${effectRef.effectId} not found in file ${effectRef.effectFileId}, skipping`,
        )
        continue
      }

      const compiledEffect = EffectCompiler.compile(effect)
      registry.registerEffect(effectRef.effectId, compiledEffect)
    } catch (error) {
      log.error(`Failed to load/compile effect ${effectRef.effectId}:`, error)
    }
  }

  return registry
}
