import type { EditorNodeData } from './types'

export type EditorMode = 'cue' | 'effect'

type NodeKind = EditorNodeData['kind']

const CUE_VALID_SOURCE_KINDS: NodeKind[] = [
  'event',
  'action',
  'logic',
  'event-raiser',
  'event-listener',
  'effect-raiser',
]
const CUE_VALID_TARGET_KINDS: NodeKind[] = ['action', 'logic', 'event-raiser', 'effect-raiser']

const EFFECT_VALID_SOURCE_KINDS: NodeKind[] = [
  'event',
  'action',
  'logic',
  'event-raiser',
  'event-listener',
  'effect-listener',
]
const EFFECT_VALID_TARGET_KINDS: NodeKind[] = ['action', 'logic', 'event-raiser']

/**
 * Returns whether an edge from source to target is valid for the given editor mode.
 * Used when serializing flow to document and when validating connections interactively.
 */
export function isValidEditorEdge(
  sourceKind: NodeKind,
  targetKind: NodeKind,
  editorMode: EditorMode,
): boolean {
  const validTargets = editorMode === 'cue' ? CUE_VALID_TARGET_KINDS : EFFECT_VALID_TARGET_KINDS
  const validSources = editorMode === 'cue' ? CUE_VALID_SOURCE_KINDS : EFFECT_VALID_SOURCE_KINDS

  if (sourceKind === 'event-listener' || sourceKind === 'effect-listener') {
    return validTargets.includes(targetKind)
  }
  return validSources.includes(sourceKind) && validTargets.includes(targetKind)
}
