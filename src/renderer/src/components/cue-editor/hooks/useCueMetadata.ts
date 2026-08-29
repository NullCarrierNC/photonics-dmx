import { useCallback } from 'react'
import type {
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  NodeCueFile,
  NodeCueGroupMeta,
  NetNodeCueDefinition,
  YargEffectDefinition,
  EffectFile,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'
import { updateCueInFile, updateEffectInFile } from '../lib/cueUtils'

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
    (updates: Partial<NetNodeCueDefinition> | Partial<AudioNodeCueDefinition>) => {
      if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return
      const cueFile = editorDoc.file as NodeCueFile
      // `updates` is a partial of either family, so spreading it over a cue widens the result past
      // both branches. The form only ever edits the cue that is open, so the family is the one the
      // cue already had.
      const updatedFile = updateCueInFile(
        cueFile,
        selectedCueId,
        (cue) => ({ ...cue, ...updates }) as NetNodeCueDefinition | AudioNodeCueDefinition,
      )
      setEditorDoc({ ...editorDoc, file: updatedFile })
      setIsDirty(true)
    },
    [editorDoc, selectedCueId, setEditorDoc, setIsDirty],
  )

  const updateEffectMetadata = useCallback(
    (updates: Partial<YargEffectDefinition> & Partial<AudioEffectDefinition>) => {
      if (!editorDoc || !selectedCueId || editorDoc.mode !== 'effect') return
      const effectFile = editorDoc.file as EffectFile
      const updatedFile = updateEffectInFile(effectFile, selectedCueId, (effect) => ({
        ...effect,
        ...updates,
      }))
      setEditorDoc({ ...editorDoc, file: updatedFile })
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
