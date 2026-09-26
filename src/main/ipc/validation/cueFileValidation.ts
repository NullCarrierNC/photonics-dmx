/**
 * Cue and effect file payloads: the save requests and the cue type lookup.
 *
 * These check the request's shape against the modes the loader was built with. The loaders check a
 * file's content against its schema before they write it.
 */

import type {
  EffectFile,
  EffectMode,
  NodeCueFile,
  NodeCueKind,
  NodeCueMode,
} from '../../../photonics-dmx/cues/types/nodeCueTypes'
import type { ValidationResult } from './primitives'
import { isNonEmptyString, isPlainObject, validateStringUnion } from './primitives'

const NODE_CUE_KINDS: readonly NodeCueKind[] = ['lighting', 'motion']

/** A save that is `createOnly` refuses a filename already taken in the mode's folder. */
type FileSavePayload<Mode, File> = {
  mode: Mode
  filename: string
  content: File
  createOnly: boolean
}

function validateFileSavePayload<Mode extends string, File>(
  value: unknown,
  modes: readonly Mode[],
): ValidationResult<FileSavePayload<Mode, File>> {
  if (!isPlainObject(value)) {
    return { ok: false, error: 'Save payload must be an object' }
  }
  const mode = validateStringUnion(value.mode, modes, 'mode')
  if (!mode.ok) {
    return mode
  }
  if (!isNonEmptyString(value.filename)) {
    return { ok: false, error: 'filename must be a non-empty string' }
  }
  if (!isPlainObject(value.content)) {
    return { ok: false, error: 'content must be an object' }
  }
  if (value.createOnly !== undefined && typeof value.createOnly !== 'boolean') {
    return { ok: false, error: 'createOnly must be a boolean' }
  }
  return {
    ok: true,
    value: {
      mode: mode.value,
      filename: value.filename,
      content: value.content as File,
      createOnly: value.createOnly ?? false,
    },
  }
}

export function validateNodeCueSavePayload(
  value: unknown,
  modes: readonly NodeCueMode[],
): ValidationResult<FileSavePayload<NodeCueMode, NodeCueFile>> {
  return validateFileSavePayload<NodeCueMode, NodeCueFile>(value, modes)
}

export function validateEffectSavePayload(
  value: unknown,
  modes: readonly EffectMode[],
): ValidationResult<FileSavePayload<EffectMode, EffectFile>> {
  return validateFileSavePayload<EffectMode, EffectFile>(value, modes)
}

export function validateCueTypesPayload(
  value: unknown,
  modes: readonly NodeCueMode[],
): ValidationResult<{ mode: NodeCueMode; kind?: NodeCueKind }> {
  if (!isPlainObject(value)) {
    return { ok: false, error: 'Cue type request must be an object' }
  }
  const mode = validateStringUnion(value.mode, modes, 'mode')
  if (!mode.ok) {
    return mode
  }
  if (value.kind === undefined) {
    return { ok: true, value: { mode: mode.value } }
  }
  const kind = validateStringUnion(value.kind, NODE_CUE_KINDS, 'kind')
  if (!kind.ok) {
    return kind
  }
  return { ok: true, value: { mode: mode.value, kind: kind.value } }
}
