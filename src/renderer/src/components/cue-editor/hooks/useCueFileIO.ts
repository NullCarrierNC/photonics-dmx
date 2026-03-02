import { useCallback } from 'react'
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type {
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  NodeCueFile,
  YargNodeCueDefinition,
  YargEffectDefinition,
  EffectFile,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'
import { firstByName } from '../lib/cueUtils'
import type { EditorModeKey } from './useLastCueFilePath'
import { setLastActiveMode, setLastFilePathForMode } from './useLastCueFilePath'
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader'
import {
  readNodeCueFile,
  readEffectFile,
  saveNodeCueFile,
  saveEffectFile,
  deleteNodeCueFile,
  deleteEffectFile,
  importNodeCueFile,
  exportNodeCueFile,
  importEffectFile,
  exportEffectFile,
  validateNodeCue,
  validateEffect,
} from '../../../ipcApi'

export type UseCueFileIOParams = {
  editorDoc: EditorDocument | null
  setEditorDoc: React.Dispatch<React.SetStateAction<EditorDocument | null>>
  filename: string
  setFilename: React.Dispatch<React.SetStateAction<string>>
  selectedCueId: string | null
  setSelectedCueId: (id: string | null) => void
  mode: 'yarg' | 'audio'
  setMode: React.Dispatch<React.SetStateAction<'yarg' | 'audio'>>
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
  getUpdatedDocument: () => NodeCueFile | EffectFile | null
  rememberLastFilePath: (path: string | null) => void
  clearLastFilePath: () => void
  refreshFiles: () => Promise<void>
  refreshEffectFiles: () => Promise<void>
  onSaveSuccess?: (message: string) => void
  onSaveError?: (message: string) => void
  lastStoredFilePathRef: React.MutableRefObject<string | null>
}

/** Translates internal field names to user-facing labels in save error messages. */
function formatSaveError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/\bcueType\b/g, 'Game Event Trigger')
}

export function useCueFileIO({
  editorDoc,
  setEditorDoc,
  filename,
  setFilename,
  selectedCueId,
  setSelectedCueId,
  mode,
  setMode,
  setValidationErrors,
  setIsDirty,
  loadCueIntoFlow,
  getUpdatedDocument,
  rememberLastFilePath,
  clearLastFilePath,
  refreshFiles,
  refreshEffectFiles,
  onSaveSuccess,
  onSaveError,
  lastStoredFilePathRef,
}: UseCueFileIOParams) {
  const selectFile = useCallback(
    async (fileSummary: NodeCueFileSummary, preferredItemId?: string) => {
      try {
        const file = await readNodeCueFile(fileSummary.path)
        setEditorDoc({ mode: 'cue', file, path: fileSummary.path })
        setMode(file.mode)
        setFilename(fileSummary.path.split(/[/\\]/).pop() ?? fileSummary.path)
        const cueFile = file as NodeCueFile
        const cues = cueFile.cues as (YargNodeCueDefinition | AudioNodeCueDefinition)[]
        const preferredCue =
          preferredItemId != null ? cues.find((c) => c.id === preferredItemId) : null
        const cueToLoad = preferredCue ?? firstByName(cues)
        const cueId = cueToLoad?.id ?? null
        setSelectedCueId(cueId)
        setIsDirty(false)
        loadCueIntoFlow(cueToLoad ?? null)
        rememberLastFilePath(fileSummary.path)
        const modeKey: EditorModeKey = file.mode === 'yarg' ? 'yarg-cue' : 'audio-cue'
        setLastFilePathForMode(modeKey, fileSummary.path)
        setLastActiveMode(modeKey)
      } catch (error) {
        console.error('Failed to open node cue file', error)
      }
    },
    [
      loadCueIntoFlow,
      rememberLastFilePath,
      setEditorDoc,
      setFilename,
      setMode,
      setSelectedCueId,
      setIsDirty,
    ],
  )

  const selectEffectFile = useCallback(
    async (fileSummary: EffectFileSummary, preferredItemId?: string) => {
      try {
        const file = await readEffectFile(fileSummary.path)
        setEditorDoc({ mode: 'effect', file, path: fileSummary.path })
        setMode(file.mode)
        setFilename(fileSummary.path.split(/[/\\]/).pop() ?? fileSummary.path)
        const effectFile = file as EffectFile
        const effects = effectFile.effects as (YargEffectDefinition | AudioEffectDefinition)[]
        const preferredEffect =
          preferredItemId != null ? effects.find((e) => e.id === preferredItemId) : null
        const effectToLoad = preferredEffect ?? firstByName(effects)
        const effectId = effectToLoad?.id ?? null
        setSelectedCueId(effectId)
        setIsDirty(false)
        loadCueIntoFlow(effectToLoad ?? null)
        rememberLastFilePath(fileSummary.path)
        const modeKey: EditorModeKey = file.mode === 'yarg' ? 'yarg-effect' : 'audio-effect'
        setLastFilePathForMode(modeKey, fileSummary.path)
        setLastActiveMode(modeKey)
      } catch (error) {
        console.error('Failed to open effect file', error)
      }
    },
    [
      loadCueIntoFlow,
      rememberLastFilePath,
      setEditorDoc,
      setFilename,
      setMode,
      setSelectedCueId,
      setIsDirty,
    ],
  )

  const handleSave = useCallback(async () => {
    if (!editorDoc) return
    const updatedFile = getUpdatedDocument()
    if (!updatedFile) return

    if (editorDoc.mode === 'effect') {
      const effectContent = updatedFile as EffectFile
      const validation = await validateEffect({ content: effectContent })
      if (!validation.valid) {
        setValidationErrors(validation.errors)
        return
      }
      try {
        const response = await saveEffectFile({
          mode: effectContent.mode,
          filename,
          content: effectContent,
        })
        if (!response.success) {
          onSaveError?.(`Failed to save effect: ${filename}`)
          return
        }
        setEditorDoc({ mode: 'effect', file: updatedFile, path: response.path })
        rememberLastFilePath(response.path)
        setValidationErrors([])
        setIsDirty(false)
        refreshEffectFiles()
        onSaveSuccess?.(`Effect saved: ${filename}`)
      } catch (error) {
        console.error('Failed to save effect file', error)
        onSaveError?.(formatSaveError(error))
      }
    } else {
      const cueContent = updatedFile as NodeCueFile
      const validation = await validateNodeCue({ content: cueContent })
      if (!validation.valid) {
        setValidationErrors(validation.errors)
        return
      }
      try {
        const response = await saveNodeCueFile({
          mode: cueContent.mode,
          filename,
          content: cueContent,
        })
        if (!response.success) {
          onSaveError?.(`Failed to save cue: ${filename}`)
          return
        }
        setEditorDoc({ mode: 'cue', file: updatedFile, path: response.path })
        rememberLastFilePath(response.path)
        setValidationErrors([])
        setIsDirty(false)
        refreshFiles()
        onSaveSuccess?.(`Cue saved: ${filename}`)
      } catch (error) {
        console.error('Failed to save node cue file', error)
        onSaveError?.(formatSaveError(error))
      }
    }
  }, [
    editorDoc,
    filename,
    getUpdatedDocument,
    refreshFiles,
    refreshEffectFiles,
    rememberLastFilePath,
    onSaveSuccess,
    onSaveError,
    setEditorDoc,
    setValidationErrors,
    setIsDirty,
  ])

  const handleDelete = useCallback(async () => {
    if (!editorDoc?.path) return

    try {
      if (editorDoc.mode === 'effect') {
        await deleteEffectFile(editorDoc.path)
      } else {
        await deleteNodeCueFile(editorDoc.path)
      }
    } catch (error) {
      console.error('Failed to delete file', error)
      onSaveError?.(`Failed to delete: ${error instanceof Error ? error.message : String(error)}`)
      return
    }

    if (editorDoc.path === lastStoredFilePathRef.current) {
      clearLastFilePath()
    }
    setEditorDoc(null)
    setSelectedCueId(null)
    setFilename('untitled.json')
    loadCueIntoFlow(null)
    setValidationErrors([])
    setIsDirty(false)
    if (editorDoc.mode === 'effect') {
      refreshEffectFiles()
    } else {
      refreshFiles()
    }
  }, [
    clearLastFilePath,
    editorDoc,
    loadCueIntoFlow,
    onSaveError,
    refreshFiles,
    refreshEffectFiles,
    lastStoredFilePathRef,
    setEditorDoc,
    setFilename,
    setSelectedCueId,
    setValidationErrors,
    setIsDirty,
  ])

  const handleImport = useCallback(async () => {
    if (editorDoc?.mode === 'effect') {
      await importEffectFile(mode)
      refreshEffectFiles()
    } else {
      await importNodeCueFile(mode)
      refreshFiles()
    }
  }, [editorDoc?.mode, mode, refreshFiles, refreshEffectFiles])

  const handleExport = useCallback(async () => {
    if (!editorDoc?.path) return
    if (editorDoc.mode === 'effect') {
      await exportEffectFile(editorDoc.path)
    } else {
      await exportNodeCueFile(editorDoc.path)
    }
  }, [editorDoc])

  const handleReload = useCallback(async () => {
    const currentPath = editorDoc?.path

    if (editorDoc?.mode === 'effect') {
      await refreshEffectFiles()
    } else {
      await refreshFiles()
    }

    if (currentPath) {
      try {
        if (editorDoc?.mode === 'effect') {
          const file = await readEffectFile(currentPath)
          setEditorDoc({ mode: 'effect', file, path: currentPath })
          setMode(file.mode)
          setFilename(currentPath.split(/[/\\]/).pop() ?? currentPath)
          const effectFile = file as EffectFile
          const firstEffect = firstByName(
            effectFile.effects as (YargEffectDefinition | AudioEffectDefinition)[],
          )
          const effectId =
            effectFile.effects.find((e) => e.id === selectedCueId)?.id ?? firstEffect?.id ?? null
          setSelectedCueId(effectId)
          setIsDirty(false)
          loadCueIntoFlow(effectFile.effects.find((e) => e.id === effectId) ?? firstEffect ?? null)
        } else {
          const file = await readNodeCueFile(currentPath)
          setEditorDoc({ mode: 'cue', file, path: currentPath })
          setMode(file.mode)
          setFilename(currentPath.split(/[/\\]/).pop() ?? currentPath)
          const cueFile = file as NodeCueFile
          const firstCue = firstByName(
            cueFile.cues as (YargNodeCueDefinition | AudioNodeCueDefinition)[],
          )
          const cueId = cueFile.cues.find((c) => c.id === selectedCueId)?.id ?? firstCue?.id ?? null
          setSelectedCueId(cueId)
          setIsDirty(false)
          loadCueIntoFlow(cueFile.cues.find((c) => c.id === cueId) ?? firstCue ?? null)
        }
      } catch (error) {
        console.error('Failed to reload current file', error)
      }
    }
  }, [
    editorDoc,
    selectedCueId,
    refreshFiles,
    refreshEffectFiles,
    loadCueIntoFlow,
    setEditorDoc,
    setFilename,
    setMode,
    setSelectedCueId,
    setIsDirty,
  ])

  return {
    selectFile,
    selectEffectFile,
    handleSave,
    handleDelete,
    handleImport,
    handleExport,
    handleReload,
    refreshFiles,
    refreshEffectFiles,
  }
}
