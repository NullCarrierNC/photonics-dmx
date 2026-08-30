import type {
  AudioNodeCueDefinition,
  NetNodeCueDefinition,
  NodeCueFile,
  NodeCueKind,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { firstByName } from './cueUtils'
import type { EditorDocument } from './types'

type CueKindSyncResult =
  | { action: 'none' }
  | { action: 'clear' }
  | { action: 'select'; cue: NetNodeCueDefinition | AudioNodeCueDefinition }

/**
 * Decide which cue the editor should hold for `cueKind`. Callers invoke this synchronously while
 * changing kind, so kind and selection always move together in one batch. Returns a clear action
 * when no cues of that kind remain, or a reselect when the current cue is missing from the
 * filtered set.
 */
export function resolveCueKindSelection(
  editorMode: 'cue' | 'effect',
  editorDoc: EditorDocument | null,
  cueKind: NodeCueKind,
  selectedCueId: string | null,
): CueKindSyncResult {
  if (editorMode !== 'cue' || !editorDoc || editorDoc.mode !== 'cue') {
    return { action: 'none' }
  }

  const cueFile = editorDoc.file as NodeCueFile
  const matchingCues = cueFile.cues.filter((c) => c.kind === cueKind)
  if (matchingCues.length === 0) {
    return { action: 'clear' }
  }

  const selectedOk = selectedCueId != null && matchingCues.some((c) => c.id === selectedCueId)
  if (!selectedOk) {
    // Alphabetical rather than file order, so auto-selection lands on the cue the sidebar
    // shows first. Non-null because the empty case returned above.
    return { action: 'select', cue: firstByName(matchingCues)! }
  }

  return { action: 'none' }
}
