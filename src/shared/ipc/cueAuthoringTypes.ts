/**
 * Node cue and effect file management: listing, reading, saving, validating, import and export.
 *
 * Part of the IpcInvokeMap contract, recomposed in shared/ipcTypes.ts.
 */

import { NODE_CUES, EFFECTS } from '../ipcChannels'
import type {
  NodeCueFile,
  NodeCueMode,
  NodeCueKind,
  EffectFile,
  EffectMode,
} from '../../photonics-dmx/cues/types/nodeCueTypes'
import type {
  NodeCueListSummary,
  NodeCueLoadResult,
} from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type {
  EffectListSummary,
  EffectLoadResult,
} from '../../photonics-dmx/cues/node/loader/EffectLoader'
import type { IpcErrorResult } from './common'

export interface CueAuthoringInvokeMap {
  // ---- Node cues ----
  [NODE_CUES.SET_DEBUG]: {
    request: boolean
    response: { success: true; enabled: boolean }
  }
  [NODE_CUES.LIST]: {
    request: void
    response: NodeCueListSummary
  }
  [NODE_CUES.RELOAD]: {
    request: void
    response: NodeCueLoadResult
  }
  [NODE_CUES.READ]: {
    request: string
    response: NodeCueFile
  }
  [NODE_CUES.SAVE]: {
    request: { mode: NodeCueMode; filename: string; content: NodeCueFile }
    response: { success: true; path: string } | IpcErrorResult
  }
  [NODE_CUES.DELETE]: {
    request: string
    response: { success: true; path: string } | IpcErrorResult
  }
  [NODE_CUES.VALIDATE]: {
    request: { path?: string; content?: NodeCueFile }
    response:
      | { valid: true; data: NodeCueFile; errors: string[]; mode: NodeCueMode }
      | { valid: false; errors: string[] }
  }
  [NODE_CUES.GET_CUE_TYPES]: {
    request: { mode: NodeCueMode; kind?: NodeCueKind }
    response: string[]
  }
  [NODE_CUES.IMPORT_PICK]: {
    request: NodeCueMode | undefined
    response:
      | { success: true; sourceBasename: string; mode: NodeCueMode; content: NodeCueFile }
      | IpcErrorResult
  }
  [NODE_CUES.EXPORT]: {
    request: string
    response: { success: true; path: string } | IpcErrorResult
  }

  // ---- Effects ----
  [EFFECTS.LIST]: {
    request: void
    response: EffectListSummary
  }
  [EFFECTS.RELOAD]: {
    request: void
    response: EffectLoadResult
  }
  [EFFECTS.READ]: {
    request: string
    response: EffectFile
  }
  [EFFECTS.SAVE]: {
    request: { mode: EffectMode; filename: string; content: EffectFile }
    response: { success: true; path: string } | IpcErrorResult
  }
  [EFFECTS.DELETE]: {
    request: string
    response: { success: true; path: string } | IpcErrorResult
  }
  [EFFECTS.VALIDATE]: {
    request: { path?: string; content?: EffectFile }
    response:
      | { valid: true; data: EffectFile; errors: string[]; mode: EffectMode }
      | { valid: false; errors: string[] }
  }
  [EFFECTS.IMPORT_PICK]: {
    request: EffectMode | undefined
    response:
      | { success: true; sourceBasename: string; mode: EffectMode; content: EffectFile }
      | IpcErrorResult
  }
  [EFFECTS.EXPORT]: {
    request: string
    response: { success: true; path: string } | IpcErrorResult
  }
}
