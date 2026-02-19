import { useCallback } from 'react'
import type {
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  NodeCueFile,
  NodeCueMode,
  YargNodeCueDefinition,
  YargEffectDefinition,
  YargNodeCueFile,
  AudioNodeCueFile,
  YargEffectFile,
  AudioEffectFile,
  EffectFile,
  EffectMode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'
import {
  createBlankCue,
  createDefaultFile,
  createDefaultEffectFile,
  createDefaultEffect,
} from '../lib/cueDefaults'
import { validateNodeCue, validateEffect, saveNodeCueFile, saveEffectFile } from '../../../ipcApi'

export type UseCueCrudParams = {
  editorDoc: EditorDocument | null
  setEditorDoc: React.Dispatch<React.SetStateAction<EditorDocument | null>>
  selectedCueId: string | null
  setSelectedCueId: (id: string | null) => void
  setFilename: React.Dispatch<React.SetStateAction<string>>
  mode: NodeCueMode
  setValidationErrors: (errors: string[]) => void
  setIsDirty: (dirty: boolean) => void
  loadCueIntoFlow: (
    cue:
      | YargNodeCueDefinition
      | AudioNodeCueDefinition
      | YargEffectDefinition
      | AudioEffectDefinition
      | null,
  ) => void
  refreshFiles: () => Promise<void>
  refreshEffectFiles: () => Promise<void>
}

export function useCueCrud({
  editorDoc,
  setEditorDoc,
  selectedCueId,
  setSelectedCueId,
  setFilename,
  mode,
  setValidationErrors,
  setIsDirty,
  loadCueIntoFlow,
  refreshFiles,
  refreshEffectFiles,
}: UseCueCrudParams) {
  const handleNewFile = useCallback(() => {}, [])

  const handleCreateNewFile = useCallback(
    async (metadata: {
      groupId: string
      groupName: string
      groupDescription: string
      itemName: string
      itemDescription: string
    }) => {
      const isInEffectMode = editorDoc?.mode === 'effect'

      if (isInEffectMode) {
        const file = createDefaultEffectFile(mode as EffectMode)
        file.group.id = metadata.groupId
        file.group.name = metadata.groupName
        file.group.description = metadata.groupDescription
        file.effects[0].name = metadata.itemName
        file.effects[0].description = metadata.itemDescription

        const filename = `${metadata.groupId}.json`

        const validation = await validateEffect({ content: file })
        if (!validation.valid) {
          setValidationErrors(validation.errors)
          alert('Failed to create effect file: ' + validation.errors.join(', '))
          return
        }

        try {
          const response = await saveEffectFile({ mode: file.mode, filename, content: file })
          setEditorDoc({ mode: 'effect', file, path: response.path })
          setSelectedCueId(file.effects[0]?.id ?? null)
          setFilename(filename)
          loadCueIntoFlow(file.effects[0] ?? null)
          setValidationErrors([])
          setIsDirty(false)
          refreshEffectFiles()
        } catch (error) {
          console.error('Failed to save effect file', error)
          alert('Failed to save effect file: ' + error)
        }
      } else {
        const file = createDefaultFile(mode)
        file.group.id = metadata.groupId
        file.group.name = metadata.groupName
        file.group.description = metadata.groupDescription
        file.cues[0].name = metadata.itemName
        file.cues[0].description = metadata.itemDescription

        const filename = `${metadata.groupId}.json`

        const validation = await validateNodeCue({ content: file })
        if (!validation.valid) {
          setValidationErrors(validation.errors)
          alert('Failed to create cue file: ' + validation.errors.join(', '))
          return
        }

        try {
          const response = await saveNodeCueFile({ mode: file.mode, filename, content: file })
          setEditorDoc({ mode: 'cue', file, path: response.path })
          setSelectedCueId(file.cues[0]?.id ?? null)
          setFilename(filename)
          loadCueIntoFlow(file.cues[0] ?? null)
          setValidationErrors([])
          setIsDirty(false)
          refreshFiles()
        } catch (error) {
          console.error('Failed to save cue file', error)
          alert('Failed to save cue file: ' + error)
        }
      }
    },
    [
      editorDoc?.mode,
      mode,
      loadCueIntoFlow,
      refreshFiles,
      refreshEffectFiles,
      setEditorDoc,
      setSelectedCueId,
      setFilename,
      setValidationErrors,
      setIsDirty,
    ],
  )

  const handleAddCue = useCallback(() => {
    const baseDoc = editorDoc ?? {
      mode: 'cue' as const,
      file: createDefaultFile(mode),
      path: null,
    }

    if (baseDoc.mode === 'effect') {
      console.warn('Cannot add cue in effect mode')
      return
    }

    const newCue = createBlankCue(mode)
    const baseCueFile = baseDoc.file as NodeCueFile
    const updatedCues = [...baseCueFile.cues, newCue]
    const updatedFile =
      mode === 'yarg'
        ? ({ ...baseDoc.file, cues: updatedCues as YargNodeCueDefinition[] } as YargNodeCueFile)
        : ({ ...baseDoc.file, cues: updatedCues as AudioNodeCueDefinition[] } as AudioNodeCueFile)
    const updatedDoc: EditorDocument = { ...baseDoc, file: updatedFile }
    setEditorDoc(updatedDoc)
    setSelectedCueId(newCue.id)
    loadCueIntoFlow(newCue as YargNodeCueDefinition | AudioNodeCueDefinition)
    setIsDirty(true)
  }, [editorDoc, mode, loadCueIntoFlow, setEditorDoc, setSelectedCueId, setIsDirty])

  const handleAddEffect = useCallback(() => {
    const baseDoc = editorDoc ?? {
      mode: 'effect' as const,
      file: createDefaultEffectFile(mode as EffectMode),
      path: null,
    }

    if (baseDoc.mode === 'cue') {
      console.warn('Cannot add effect in cue mode')
      return
    }

    const newEffect = createDefaultEffect(mode as EffectMode)
    const baseEffectFile = baseDoc.file as EffectFile
    const updatedEffects = [...baseEffectFile.effects, newEffect]
    const updatedFile =
      mode === 'yarg'
        ? ({
            ...baseDoc.file,
            effects: updatedEffects as YargEffectDefinition[],
          } as YargEffectFile)
        : ({
            ...baseDoc.file,
            effects: updatedEffects as AudioEffectDefinition[],
          } as AudioEffectFile)
    const updatedDoc: EditorDocument = { ...baseDoc, file: updatedFile }
    setEditorDoc(updatedDoc)
    setSelectedCueId(newEffect.id)
    loadCueIntoFlow(newEffect as YargEffectDefinition | AudioEffectDefinition)
    setIsDirty(true)
  }, [editorDoc, mode, loadCueIntoFlow, setEditorDoc, setSelectedCueId, setIsDirty])

  const removeCue = useCallback(
    (cueId: string) => {
      if (!editorDoc || editorDoc.mode !== 'cue') return
      const cueFile = editorDoc.file as NodeCueFile
      if (cueFile.cues.length <= 1) return

      const updatedCues = cueFile.cues.filter((cue) => cue.id !== cueId)
      const updatedFile =
        cueFile.mode === 'yarg'
          ? ({ ...cueFile, cues: updatedCues as YargNodeCueDefinition[] } as YargNodeCueFile)
          : ({ ...cueFile, cues: updatedCues as AudioNodeCueDefinition[] } as AudioNodeCueFile)
      const updatedDoc: EditorDocument = { ...editorDoc, file: updatedFile }

      setEditorDoc(updatedDoc)

      let nextCueId = selectedCueId
      if (cueId === selectedCueId) {
        nextCueId = updatedCues[0]?.id ?? null
        setSelectedCueId(nextCueId)
      }

      const nextCue = updatedCues.find((cue) => cue.id === nextCueId) ?? updatedCues[0] ?? null
      loadCueIntoFlow(nextCue as YargNodeCueDefinition | AudioNodeCueDefinition | null)
      setIsDirty(true)
    },
    [editorDoc, loadCueIntoFlow, selectedCueId, setEditorDoc, setSelectedCueId, setIsDirty],
  )

  const removeEffect = useCallback(
    (effectId: string) => {
      if (!editorDoc || editorDoc.mode !== 'effect') return
      const effectFile = editorDoc.file as EffectFile
      if (effectFile.effects.length <= 1) return

      const updatedEffects = effectFile.effects.filter((effect) => effect.id !== effectId)
      const updatedFile =
        effectFile.mode === 'yarg'
          ? ({
              ...effectFile,
              effects: updatedEffects as YargEffectDefinition[],
            } as YargEffectFile)
          : ({
              ...effectFile,
              effects: updatedEffects as AudioEffectDefinition[],
            } as AudioEffectFile)
      const updatedDoc: EditorDocument = { ...editorDoc, file: updatedFile }

      setEditorDoc(updatedDoc)

      let nextEffectId = selectedCueId
      if (effectId === selectedCueId) {
        nextEffectId = updatedEffects[0]?.id ?? null
        setSelectedCueId(nextEffectId)
      }

      const nextEffect =
        updatedEffects.find((effect) => effect.id === nextEffectId) ?? updatedEffects[0] ?? null
      loadCueIntoFlow(nextEffect as YargEffectDefinition | AudioEffectDefinition | null)
      setIsDirty(true)
    },
    [editorDoc, loadCueIntoFlow, selectedCueId, setEditorDoc, setSelectedCueId, setIsDirty],
  )

  return {
    handleNewFile,
    handleCreateNewFile,
    handleAddCue,
    handleAddEffect,
    removeCue,
    removeEffect,
  }
}
