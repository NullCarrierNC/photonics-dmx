import { useCallback } from 'react'
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader'
import type {
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  EffectFile,
  NodeCueFile,
  NodeCueKind,
  NodeCueMode,
  NetNodeCueDefinition,
  YargEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument, EditorMode } from '../lib/types'
import {
  createBlankAudioCue,
  createBlankNetCue,
  createDefaultAudioEffect,
  createDefaultFile,
  createDefaultEffectFile,
  createDefaultYargEffect,
} from '../lib/cueDefaults'
import { effectModeFor, fileBasename, firstByName } from '../lib/cueUtils'
import {
  modeKeyFor,
  setLastActiveMode,
  setLastFilePathForMode,
  type EditorModeKey,
} from './useLastCueFilePath'
import { validateNodeCue, validateEffect, saveNodeCueFile, saveEffectFile } from '../../../ipcApi'
import { createLogger } from '../../../../../shared/logger'
const log = createLogger('useCueCrud')

type AnyCue = NetNodeCueDefinition | AudioNodeCueDefinition
type AnyEffect = YargEffectDefinition | AudioEffectDefinition

/** The file with a blank cue of `kind` added, shaped for the file's own mode. */
function withBlankCue(file: NodeCueFile, kind: NodeCueKind): { file: NodeCueFile; cue: AnyCue } {
  if (file.mode === 'audio') {
    const cue = createBlankAudioCue(kind)
    return { file: { ...file, cues: [...file.cues, cue] }, cue }
  }
  const cue = createBlankNetCue(file.mode, kind)
  return { file: { ...file, cues: [...file.cues, cue] }, cue }
}

/** The file with a blank effect added, shaped for the file's own mode. */
function withBlankEffect(file: EffectFile): { file: EffectFile; effect: AnyEffect } {
  if (file.mode === 'audio') {
    const effect = createDefaultAudioEffect()
    return { file: { ...file, effects: [...file.effects, effect] }, effect }
  }
  const effect = createDefaultYargEffect()
  return { file: { ...file, effects: [...file.effects, effect] }, effect }
}

function withoutCue(file: NodeCueFile, cueId: string): NodeCueFile {
  return file.mode === 'audio'
    ? { ...file, cues: file.cues.filter((cue) => cue.id !== cueId) }
    : { ...file, cues: file.cues.filter((cue) => cue.id !== cueId) }
}

function withoutEffect(file: EffectFile, effectId: string): EffectFile {
  return file.mode === 'audio'
    ? { ...file, effects: file.effects.filter((effect) => effect.id !== effectId) }
    : { ...file, effects: file.effects.filter((effect) => effect.id !== effectId) }
}

export type UseCueCrudParams = {
  editorDoc: EditorDocument | null
  setEditorDoc: React.Dispatch<React.SetStateAction<EditorDocument | null>>
  selectedCueId: string | null
  setSelectedCueId: (id: string | null) => void
  setFilename: React.Dispatch<React.SetStateAction<string>>
  mode: NodeCueMode
  /** The tab showing, which decides whether a new file holds cues or effects. */
  editorMode: EditorMode
  /** Lighting vs motion for new cues and blank files (both YARG and Audio). */
  cueKind: NodeCueKind
  files: NodeCueFileSummary[]
  effectFiles: EffectFileSummary[]
  setValidationErrors: (errors: string[]) => void
  setIsDirty: (dirty: boolean) => void
  setCueKind: React.Dispatch<React.SetStateAction<NodeCueKind>>
  loadCueIntoFlow: (cue: AnyCue | AnyEffect | null) => void
  rememberLastFilePath: (path: string | null) => void
  refreshFiles: () => Promise<void>
  refreshEffectFiles: () => Promise<void>
  onError?: (message: string) => void
}

export function useCueCrud({
  editorDoc,
  setEditorDoc,
  selectedCueId,
  setSelectedCueId,
  setFilename,
  mode,
  editorMode,
  cueKind,
  files,
  effectFiles,
  setValidationErrors,
  setIsDirty,
  setCueKind,
  loadCueIntoFlow,
  rememberLastFilePath,
  refreshFiles,
  refreshEffectFiles,
  onError,
}: UseCueCrudParams) {
  // A new file is the one open, so reopening the editor returns to it.
  const rememberCreatedFile = useCallback(
    (path: string, modeKey: EditorModeKey) => {
      rememberLastFilePath(path)
      setLastFilePathForMode(modeKey, path)
      setLastActiveMode(modeKey)
    },
    [rememberLastFilePath],
  )

  const handleCreateNewFile = useCallback(
    async (metadata: {
      groupId: string
      groupName: string
      groupDescription: string
      itemName: string
      itemDescription: string
    }) => {
      const isInEffectMode = editorMode === 'effect'
      const kindLabel = isInEffectMode ? 'Effect' : 'Cue'
      const summaries = isInEffectMode
        ? effectFiles.filter((f) => f.mode === mode)
        : files.filter((f) => f.mode === mode)
      const newIdKey = metadata.groupId.trim().toLowerCase()
      if (newIdKey && summaries.some((s) => s.groupId.trim().toLowerCase() === newIdKey)) {
        onError?.(
          `${kindLabel} group ID "${metadata.groupId.trim()}" is already in use. Choose a different ID.`,
        )
        return
      }
      const newFilenameKey = `${metadata.groupId}.json`.toLowerCase()
      if (summaries.some((s) => fileBasename(s.path).toLowerCase() === newFilenameKey)) {
        onError?.(
          `A ${kindLabel.toLowerCase()} file named "${metadata.groupId}.json" already exists. Choose a different ID.`,
        )
        return
      }

      if (isInEffectMode) {
        const file = createDefaultEffectFile(effectModeFor(mode))
        file.group.id = metadata.groupId
        file.group.name = metadata.groupName
        file.group.description = metadata.groupDescription
        file.effects[0].name = metadata.itemName
        file.effects[0].description = metadata.itemDescription

        const filename = `${metadata.groupId}.json`

        try {
          const validation = await validateEffect({ content: file })
          if (!validation.valid) {
            setValidationErrors(validation.errors)
            onError?.('Failed to create effect file: ' + validation.errors.join(', '))
            return
          }

          const response = await saveEffectFile({
            mode: file.mode,
            filename,
            content: file,
            createOnly: true,
          })
          if (!response.success) {
            onError?.('Failed to save: ' + response.error)
            return
          }
          setEditorDoc({ mode: 'effect', file, path: response.path })
          setSelectedCueId(file.effects[0]?.id ?? null)
          setFilename(filename)
          loadCueIntoFlow(file.effects[0] ?? null)
          setValidationErrors([])
          setIsDirty(false)
          rememberCreatedFile(response.path, modeKeyFor(file.mode, 'lighting', true))
          await refreshEffectFiles()
        } catch (error) {
          log.error('Failed to create effect file', error)
          onError?.('Failed to create effect file: ' + error)
        }
      } else {
        const file = createDefaultFile(mode, cueKind)
        file.group.id = metadata.groupId
        file.group.name = metadata.groupName
        file.group.description = metadata.groupDescription
        file.cues[0].name = metadata.itemName
        file.cues[0].description = metadata.itemDescription

        const filename = `${metadata.groupId}.json`

        try {
          const validation = await validateNodeCue({ content: file })
          if (!validation.valid) {
            setValidationErrors(validation.errors)
            onError?.('Failed to create cue file: ' + validation.errors.join(', '))
            return
          }

          const response = await saveNodeCueFile({
            mode: file.mode,
            filename,
            content: file,
            createOnly: true,
          })
          if (!response.success) {
            onError?.('Failed to save: ' + response.error)
            return
          }
          setEditorDoc({ mode: 'cue', file, path: response.path })
          setSelectedCueId(file.cues[0]?.id ?? null)
          setFilename(filename)
          loadCueIntoFlow(file.cues[0] ?? null)
          setValidationErrors([])
          setIsDirty(false)
          rememberCreatedFile(response.path, modeKeyFor(file.mode, cueKind, false))
          await refreshFiles()
        } catch (error) {
          log.error('Failed to create cue file', error)
          onError?.('Failed to create cue file: ' + error)
        }
      }
    },
    [
      editorMode,
      mode,
      cueKind,
      files,
      effectFiles,
      onError,
      loadCueIntoFlow,
      refreshFiles,
      refreshEffectFiles,
      rememberCreatedFile,
      setEditorDoc,
      setSelectedCueId,
      setFilename,
      setValidationErrors,
      setIsDirty,
    ],
  )

  const handleAddCue = useCallback(() => {
    if (!editorDoc) {
      // A new document holds the one blank cue the default file carries, and is named after its
      // group until the first save creates the file.
      const file = createDefaultFile(mode, cueKind)
      const newCue = file.cues[0]
      setFilename(`${file.group.id}.json`)
      setEditorDoc({ mode: 'cue', file, path: null })
      setSelectedCueId(newCue?.id ?? null)
      loadCueIntoFlow(newCue ?? null)
      setIsDirty(true)
      return
    }

    if (editorDoc.mode === 'effect') {
      log.warn('Cannot add cue in effect mode')
      return
    }

    // The new cue joins the open file, so it takes that file's shape.
    const added = withBlankCue(editorDoc.file, cueKind)
    setEditorDoc({ ...editorDoc, file: added.file })
    setSelectedCueId(added.cue.id)
    loadCueIntoFlow(added.cue)
    setIsDirty(true)
  }, [
    editorDoc,
    mode,
    cueKind,
    loadCueIntoFlow,
    setEditorDoc,
    setFilename,
    setSelectedCueId,
    setIsDirty,
  ])

  const handleAddEffect = useCallback(() => {
    if (!editorDoc) {
      const file = createDefaultEffectFile(effectModeFor(mode))
      const newEffect = file.effects[0]
      setFilename(`${file.group.id}.json`)
      setEditorDoc({ mode: 'effect', file, path: null })
      setSelectedCueId(newEffect?.id ?? null)
      loadCueIntoFlow(newEffect ?? null)
      setIsDirty(true)
      return
    }

    if (editorDoc.mode === 'cue') {
      log.warn('Cannot add effect in cue mode')
      return
    }

    const added = withBlankEffect(editorDoc.file)
    setEditorDoc({ ...editorDoc, file: added.file })
    setSelectedCueId(added.effect.id)
    loadCueIntoFlow(added.effect)
    setIsDirty(true)
  }, [editorDoc, mode, loadCueIntoFlow, setEditorDoc, setFilename, setSelectedCueId, setIsDirty])

  const removeCue = useCallback(
    (cueId: string) => {
      if (!editorDoc || editorDoc.mode !== 'cue') return
      const cueFile = editorDoc.file
      if (cueFile.cues.length <= 1) return

      const updatedFile = withoutCue(cueFile, cueId)
      const updatedCues: AnyCue[] = updatedFile.cues
      const updatedDoc: EditorDocument = { ...editorDoc, file: updatedFile }

      setEditorDoc(updatedDoc)

      // Only the removal of the open cue moves the selection. The flow holds unsaved canvas
      // edits, so any other deletion leaves it alone rather than reloading the persisted copy.
      if (cueId === selectedCueId) {
        const sameKindCues = updatedCues.filter((cue) => cue.kind === cueKind)
        // The cross-kind fallback is unreachable from the sidebar, which disables delete at the
        // last cue of a kind, but it keeps the hook correct for any other caller.
        const nextCue = firstByName(sameKindCues) ?? firstByName(updatedCues)
        if (nextCue) {
          setCueKind(nextCue.kind)
        }
        setSelectedCueId(nextCue?.id ?? null)
        loadCueIntoFlow(nextCue)
      }

      setIsDirty(true)
    },
    [
      editorDoc,
      cueKind,
      loadCueIntoFlow,
      selectedCueId,
      setEditorDoc,
      setSelectedCueId,
      setCueKind,
      setIsDirty,
    ],
  )

  const removeEffect = useCallback(
    (effectId: string) => {
      if (!editorDoc || editorDoc.mode !== 'effect') return
      const effectFile = editorDoc.file
      if (effectFile.effects.length <= 1) return

      const updatedFile = withoutEffect(effectFile, effectId)
      const updatedDoc: EditorDocument = { ...editorDoc, file: updatedFile }

      setEditorDoc(updatedDoc)

      // As with removeCue, leave the canvas alone unless the open effect is the one going away.
      if (effectId === selectedCueId) {
        const nextEffect = firstByName<AnyEffect>(updatedFile.effects)
        setSelectedCueId(nextEffect?.id ?? null)
        loadCueIntoFlow(nextEffect)
      }

      setIsDirty(true)
    },
    [editorDoc, loadCueIntoFlow, selectedCueId, setEditorDoc, setSelectedCueId, setIsDirty],
  )

  return {
    handleCreateNewFile,
    handleAddCue,
    handleAddEffect,
    removeCue,
    removeEffect,
  }
}
