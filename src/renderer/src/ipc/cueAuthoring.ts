/**
 * Node cue and effect file management, plus the authoring debug channel.
 */
import type {
  EffectFile,
  EffectMode,
  IpcErrorResult,
  NodeCueFile,
  NodeCueKind,
  NodeCueMode,
} from '../../../shared/ipcTypes'
import { EFFECTS, NODE_CUES } from '../../../shared/ipcChannels'
import { orThrow, wasRefused } from './ipcResult'

/** The verdict every validator answers with, whatever else it carries alongside. */
interface CueValidation {
  valid: boolean
  errors: string[]
}

/**
 * A refusal carries an error rather than a verdict, and the editor reads the verdict either way,
 * so a refusal is reported as the file not being usable, with the reason main gave.
 */
function asValidation<T extends CueValidation>(result: T | IpcErrorResult): T {
  if (wasRefused(result)) {
    const refusal: CueValidation = {
      valid: false,
      errors: [result.error ?? 'Validation was refused without a reason'],
    }
    return refusal as T
  }
  return result as T
}

// Listing, reloading and reading answer with a payload that has no error arm of its own, so a
// refusal becomes a throw here rather than reaching a caller as a value it cannot read.

// ---------------------------------------------------------------------------
// Node cue debug
// ---------------------------------------------------------------------------

export const setNodeCueDebug = (enabled: boolean) => window.api.invoke(NODE_CUES.SET_DEBUG, enabled)

// ---------------------------------------------------------------------------
// Node cue management
// ---------------------------------------------------------------------------

export const listNodeCueFiles = () => window.api.invoke(NODE_CUES.LIST, undefined).then(orThrow)

export const reloadNodeCueFiles = () => window.api.invoke(NODE_CUES.RELOAD, undefined).then(orThrow)

export const readNodeCueFile = (filePath: string) =>
  window.api.invoke(NODE_CUES.READ, filePath).then(orThrow)

export const saveNodeCueFile = (payload: {
  mode: NodeCueMode
  filename: string
  content: NodeCueFile
  createOnly?: boolean
}) => window.api.invoke(NODE_CUES.SAVE, payload)

export const deleteNodeCueFile = (filePath: string) => window.api.invoke(NODE_CUES.DELETE, filePath)

export const validateNodeCue = (payload: { path?: string; content?: NodeCueFile }) =>
  window.api.invoke(NODE_CUES.VALIDATE, payload).then(asValidation)

export const getNodeCueTypes = (mode: NodeCueMode, kind?: NodeCueKind) =>
  window.api.invoke(NODE_CUES.GET_CUE_TYPES, { mode, kind }).then(orThrow)

export const pickNodeCueImportFile = (mode?: NodeCueMode) =>
  window.api.invoke(NODE_CUES.IMPORT_PICK, mode)

export const exportNodeCueFile = (filePath: string) => window.api.invoke(NODE_CUES.EXPORT, filePath)

// ---------------------------------------------------------------------------
// Effect file management
// ---------------------------------------------------------------------------

export const listEffectFiles = () => window.api.invoke(EFFECTS.LIST, undefined).then(orThrow)

export const reloadEffectFiles = () => window.api.invoke(EFFECTS.RELOAD, undefined).then(orThrow)

export const readEffectFile = (filePath: string) =>
  window.api.invoke(EFFECTS.READ, filePath).then(orThrow)

export const saveEffectFile = (payload: {
  mode: EffectMode
  filename: string
  content: EffectFile
  createOnly?: boolean
}) => window.api.invoke(EFFECTS.SAVE, payload)

export const deleteEffectFile = (filePath: string) => window.api.invoke(EFFECTS.DELETE, filePath)

export const validateEffect = (payload: { path?: string; content?: EffectFile }) =>
  window.api.invoke(EFFECTS.VALIDATE, payload).then(asValidation)

export const pickEffectImportFile = (mode?: EffectMode) =>
  window.api.invoke(EFFECTS.IMPORT_PICK, mode)

export const exportEffectFile = (filePath: string) => window.api.invoke(EFFECTS.EXPORT, filePath)
