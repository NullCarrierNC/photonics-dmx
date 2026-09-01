/**
 * Node cue and effect file management, plus the authoring debug channel.
 */
import type {
  EffectFile,
  EffectMode,
  NodeCueFile,
  NodeCueKind,
  NodeCueMode,
} from '../../../shared/ipcTypes'
import { EFFECTS, NODE_CUES } from '../../../shared/ipcChannels'

// ---------------------------------------------------------------------------
// Node cue debug
// ---------------------------------------------------------------------------

export const setNodeCueDebug = (enabled: boolean) => window.api.invoke(NODE_CUES.SET_DEBUG, enabled)

// ---------------------------------------------------------------------------
// Node cue management
// ---------------------------------------------------------------------------

export const listNodeCueFiles = () => window.api.invoke(NODE_CUES.LIST, undefined)

export const reloadNodeCueFiles = () => window.api.invoke(NODE_CUES.RELOAD, undefined)

export const readNodeCueFile = (filePath: string) => window.api.invoke(NODE_CUES.READ, filePath)

export const saveNodeCueFile = (payload: {
  mode: NodeCueMode
  filename: string
  content: NodeCueFile
}) => window.api.invoke(NODE_CUES.SAVE, payload)

export const deleteNodeCueFile = (filePath: string) => window.api.invoke(NODE_CUES.DELETE, filePath)

export const validateNodeCue = (payload: { path?: string; content?: NodeCueFile }) =>
  window.api.invoke(NODE_CUES.VALIDATE, payload)

export const getNodeCueTypes = (mode: NodeCueMode, kind?: NodeCueKind) =>
  window.api.invoke(NODE_CUES.GET_CUE_TYPES, { mode, kind })

export const pickNodeCueImportFile = (mode?: NodeCueMode) =>
  window.api.invoke(NODE_CUES.IMPORT_PICK, mode)

export const exportNodeCueFile = (filePath: string) => window.api.invoke(NODE_CUES.EXPORT, filePath)

// ---------------------------------------------------------------------------
// Effect file management
// ---------------------------------------------------------------------------

export const listEffectFiles = () => window.api.invoke(EFFECTS.LIST, undefined)

export const reloadEffectFiles = () => window.api.invoke(EFFECTS.RELOAD, undefined)

export const readEffectFile = (filePath: string) => window.api.invoke(EFFECTS.READ, filePath)

export const saveEffectFile = (payload: {
  mode: EffectMode
  filename: string
  content: EffectFile
}) => window.api.invoke(EFFECTS.SAVE, payload)

export const deleteEffectFile = (filePath: string) => window.api.invoke(EFFECTS.DELETE, filePath)

export const validateEffect = (payload: { path?: string; content?: EffectFile }) =>
  window.api.invoke(EFFECTS.VALIDATE, payload)

export const pickEffectImportFile = (mode?: EffectMode) =>
  window.api.invoke(EFFECTS.IMPORT_PICK, mode)

export const exportEffectFile = (filePath: string) => window.api.invoke(EFFECTS.EXPORT, filePath)
