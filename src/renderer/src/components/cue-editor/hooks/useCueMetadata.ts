import { useCallback } from 'react'
import type {
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  NodeCueFile,
  NodeCueGroupMeta,
  YargNodeCueDefinition,
  YargEffectDefinition,
  EffectFile,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'

export type UseCueMetadataParams = {
  editorDoc: EditorDocument | null
  setEditorDoc: React.Dispatch<React.SetStateAction<EditorDocument | null>>
  selectedCueId: string | null
  setIsDirty: (dirty: boolean) => void
}

export function useCueMetadata({
  editorDoc,
  setEditorDoc,
  selectedCueId,
  setIsDirty,
}: UseCueMetadataParams) {
  const updateGroupMeta = useCallback(
    (updates: Partial<NodeCueGroupMeta>) => {
      if (!editorDoc) return
      const updated = {
        ...editorDoc,
        file: {
          ...editorDoc.file,
          group: { ...editorDoc.file.group, ...updates },
        },
      }
      setEditorDoc(updated)
      setIsDirty(true)
    },
    [editorDoc, setEditorDoc, setIsDirty],
  )

  const updateCueMetadata = useCallback(
    (updates: Partial<YargNodeCueDefinition & AudioNodeCueDefinition>) => {
      if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return
      const cueFile = editorDoc.file as NodeCueFile
      const updatedCues = cueFile.cues.map((cue) =>
        cue.id === selectedCueId ? { ...cue, ...updates } : cue,
      )
      const updated = {
        ...editorDoc,
        file: {
          ...cueFile,
          cues: updatedCues,
        },
      }
      setEditorDoc(updated)
      setIsDirty(true)
    },
    [editorDoc, selectedCueId, setEditorDoc, setIsDirty],
  )

  const updateEffectMetadata = useCallback(
    (updates: Partial<YargEffectDefinition> & Partial<AudioEffectDefinition>) => {
      if (!editorDoc || !selectedCueId || editorDoc.mode !== 'effect') return
      const effectFile = editorDoc.file as EffectFile
      const updatedEffects = effectFile.effects.map((effect) =>
        effect.id === selectedCueId ? { ...effect, ...updates } : effect,
      )
      const updated = {
        ...editorDoc,
        file: {
          ...effectFile,
          effects: updatedEffects,
        },
      }
      setEditorDoc(updated)
      setIsDirty(true)
    },
    [editorDoc, selectedCueId, setEditorDoc, setIsDirty],
  )

  return {
    updateGroupMeta,
    updateCueMetadata,
    updateEffectMetadata,
  }
}
