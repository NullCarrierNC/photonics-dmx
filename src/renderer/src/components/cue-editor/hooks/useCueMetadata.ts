import { useCallback } from 'react'
import type {
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  NodeCueFile,
  NodeCueMode,
  NodeCueGroupMeta,
  YargNodeCueDefinition,
  YargEffectDefinition,
  EffectFile,
  EffectMode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'
import { createDefaultFile, createDefaultEffectFile } from '../lib/cueDefaults'

export type UseCueMetadataParams = {
  editorDoc: EditorDocument | null
  setEditorDoc: React.Dispatch<React.SetStateAction<EditorDocument | null>>
  selectedCueId: string | null
  setSelectedCueId: (id: string | null) => void
  setMode: React.Dispatch<React.SetStateAction<NodeCueMode>>
  setFilename: React.Dispatch<React.SetStateAction<string>>
  setIsDirty: (dirty: boolean) => void
  loadCueIntoFlow: (
    cue:
      | YargNodeCueDefinition
      | AudioNodeCueDefinition
      | YargEffectDefinition
      | AudioEffectDefinition
      | null,
  ) => void
}

export function useCueMetadata({
  editorDoc,
  setEditorDoc,
  selectedCueId,
  setSelectedCueId,
  setMode,
  setFilename,
  setIsDirty,
  loadCueIntoFlow,
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

  const handleModeChange = useCallback(
    (nextMode: NodeCueMode | string) => {
      const isEffectMode = nextMode === 'yarg-effect' || nextMode === 'audio-effect'
      const effectMode: EffectMode = nextMode === 'yarg-effect' ? 'yarg' : 'audio'
      const cueMode: NodeCueMode =
        nextMode === 'yarg-effect' || nextMode === 'yarg' ? 'yarg' : 'audio'

      setMode(cueMode)

      if (isEffectMode) {
        const file = createDefaultEffectFile(effectMode)
        setEditorDoc({ mode: 'effect', file, path: null })
        setSelectedCueId(file.effects[0]?.id ?? null)
        setFilename(`${file.group.id}.json`)
        loadCueIntoFlow(file.effects[0] ?? null)
        setIsDirty(true)
      } else if (!editorDoc || editorDoc.mode === 'effect') {
        const file = createDefaultFile(cueMode)
        setEditorDoc({ mode: 'cue', file, path: null })
        setSelectedCueId(file.cues[0]?.id ?? null)
        setFilename(`${file.group.id}.json`)
        loadCueIntoFlow(file.cues[0] ?? null)
        setIsDirty(true)
      }
    },
    [editorDoc, loadCueIntoFlow, setEditorDoc, setFilename, setMode, setSelectedCueId, setIsDirty],
  )

  return {
    updateGroupMeta,
    updateCueMetadata,
    updateEffectMetadata,
    handleModeChange,
  }
}
