import { useCallback, useLayoutEffect, useRef } from 'react'
import equal from 'fast-deep-equal'
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type {
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  NodeCueKind,
  NodeCueMode,
  NetNodeCueDefinition,
  YargEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'
import { fileBasename, firstByName } from '../lib/cueUtils'
import {
  clearLastFilePathForMode,
  modeKeyFor,
  setLastActiveMode,
  setLastFilePathForMode,
} from './useLastCueFilePath'
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader'
import {
  readNodeCueFile,
  readEffectFile,
  saveNodeCueFile,
  saveEffectFile,
  deleteNodeCueFile,
  deleteEffectFile,
  exportNodeCueFile,
  exportEffectFile,
  validateNodeCue,
  validateEffect,
} from '../../../ipcApi'
import { orThrow, wasCancelled } from '../../../ipc/ipcResult'
import { createLogger } from '../../../../../shared/logger'

const log = createLogger('useCueFileIO')

export type UseCueFileIOParams = {
  editorDoc: EditorDocument | null
  setEditorDoc: React.Dispatch<React.SetStateAction<EditorDocument | null>>
  filename: string
  setFilename: React.Dispatch<React.SetStateAction<string>>
  selectedCueId: string | null
  setSelectedCueId: (id: string | null) => void
  /** Active sidebar kind. Selection prefers cues of this kind so opening a file keeps the tab. */
  cueKind: NodeCueKind
  setMode: React.Dispatch<React.SetStateAction<NodeCueMode>>
  setCueKind: React.Dispatch<React.SetStateAction<NodeCueKind>>
  setValidationErrors: (errors: string[]) => void
  setIsDirty: (dirty: boolean) => void
  loadCueIntoFlow: (
    cue:
      | NetNodeCueDefinition
      | AudioNodeCueDefinition
      | YargEffectDefinition
      | AudioEffectDefinition
      | null,
  ) => void
  getUpdatedDocument: () => EditorDocument | null
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

function syncCueKindFromDefinition(
  cue: NetNodeCueDefinition | AudioNodeCueDefinition | null | undefined,
  setCueKind: React.Dispatch<React.SetStateAction<NodeCueKind>>,
): void {
  if (cue?.kind === 'lighting' || cue?.kind === 'motion') {
    setCueKind(cue.kind)
  }
}

export function useCueFileIO({
  editorDoc,
  setEditorDoc,
  filename,
  setFilename,
  selectedCueId,
  setSelectedCueId,
  cueKind,
  setMode,
  setCueKind,
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
  // Monotonic token shared by every read below: only the most recently issued read may commit
  // state, so fast tab switches cannot land a slower earlier read on top of a newer one.
  const selectRequestRef = useRef(0)
  // The document open now, read by a save that resolves after the user carried on editing.
  const openDocRef = useRef(editorDoc)
  useLayoutEffect(() => {
    openDocRef.current = editorDoc
  }, [editorDoc])

  /** Whether nothing was selected since `token` was issued and the document is still `path`. */
  const isStillOpen = useCallback(
    (token: number, mode: EditorDocument['mode'], path: string): boolean => {
      const open = openDocRef.current
      return token === selectRequestRef.current && open?.mode === mode && open.path === path
    },
    [],
  )

  const selectFile = useCallback(
    async (
      fileSummary: NodeCueFileSummary,
      preferredItemId?: string,
      kindOverride?: NodeCueKind,
    ) => {
      const token = ++selectRequestRef.current
      try {
        const file = await readNodeCueFile(fileSummary.path)
        if (token !== selectRequestRef.current) return
        setEditorDoc({ mode: 'cue', file, path: fileSummary.path })
        setMode(file.mode)
        setFilename(fileSummary.path.split(/[/\\]/).pop() ?? fileSummary.path)
        const cues: (NetNodeCueDefinition | AudioNodeCueDefinition)[] = file.cues
        // A caller mid-transition passes the kind it is switching to, since its state has not
        // committed yet. Everyone else gets the active kind.
        const targetKind = kindOverride ?? cueKind
        const preferredCue =
          preferredItemId != null ? cues.find((c) => c.id === preferredItemId) : null
        const sameKindCues = cues.filter((c) => c.kind === targetKind)
        // Fall back across kinds only when the file holds no cue of the target kind, otherwise
        // opening a mixed file drags the sidebar onto the other tab.
        const cueToLoad = preferredCue ?? firstByName(sameKindCues) ?? firstByName(cues)
        const cueId = cueToLoad?.id ?? null
        syncCueKindFromDefinition(cueToLoad, setCueKind)
        setSelectedCueId(cueId)
        setIsDirty(false)
        loadCueIntoFlow(cueToLoad ?? null)
        rememberLastFilePath(fileSummary.path)
        const loadedKind: NodeCueKind =
          cueToLoad?.kind === 'motion' || cueToLoad?.kind === 'lighting'
            ? cueToLoad.kind
            : targetKind
        const modeKey = modeKeyFor(file.mode, loadedKind, false)
        setLastFilePathForMode(modeKey, fileSummary.path)
        setLastActiveMode(modeKey)
      } catch (error) {
        log.error('Failed to open node cue file', error)
        onSaveError?.(
          `Failed to open cue file: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
    [
      cueKind,
      loadCueIntoFlow,
      onSaveError,
      rememberLastFilePath,
      setEditorDoc,
      setFilename,
      setMode,
      setCueKind,
      setSelectedCueId,
      setIsDirty,
    ],
  )

  const selectEffectFile = useCallback(
    async (fileSummary: EffectFileSummary, preferredItemId?: string) => {
      const token = ++selectRequestRef.current
      try {
        const file = await readEffectFile(fileSummary.path)
        if (token !== selectRequestRef.current) return
        setEditorDoc({ mode: 'effect', file, path: fileSummary.path })
        setMode(file.mode)
        setFilename(fileSummary.path.split(/[/\\]/).pop() ?? fileSummary.path)
        const effects: (YargEffectDefinition | AudioEffectDefinition)[] = file.effects
        const preferredEffect =
          preferredItemId != null ? effects.find((e) => e.id === preferredItemId) : null
        const effectToLoad = preferredEffect ?? firstByName(effects)
        const effectId = effectToLoad?.id ?? null
        setSelectedCueId(effectId)
        setIsDirty(false)
        loadCueIntoFlow(effectToLoad ?? null)
        rememberLastFilePath(fileSummary.path)
        const modeKey = modeKeyFor(file.mode, 'lighting', true)
        setLastFilePathForMode(modeKey, fileSummary.path)
        setLastActiveMode(modeKey)
      } catch (error) {
        log.error('Failed to open effect file', error)
        onSaveError?.(
          `Failed to open effect file: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
    [
      loadCueIntoFlow,
      onSaveError,
      rememberLastFilePath,
      setEditorDoc,
      setFilename,
      setMode,
      setSelectedCueId,
      setIsDirty,
    ],
  )

  /**
   * Points the open document at the file just saved. The document as it stands now goes in, so an
   * edit made while the save ran stays in the editor and keeps the file dirty. A different file
   * opened meanwhile is left as it is.
   */
  const installSaved = useCallback(
    (saved: EditorDocument, snapshot: EditorDocument, path: string): void => {
      const open = openDocRef.current
      if (!open || open.mode !== saved.mode || open.path !== saved.path) return
      const current = getUpdatedDocument() ?? open
      setEditorDoc({ ...current, path })
      setFilename(fileBasename(path))
      rememberLastFilePath(path)
      setValidationErrors([])
      setIsDirty(!equal(current.file, snapshot.file))
    },
    [
      getUpdatedDocument,
      rememberLastFilePath,
      setEditorDoc,
      setFilename,
      setValidationErrors,
      setIsDirty,
    ],
  )

  const handleSave = useCallback(async (): Promise<boolean> => {
    const snapshot = editorDoc ? getUpdatedDocument() : null
    if (!editorDoc || !snapshot) {
      onSaveError?.(
        editorDoc?.mode === 'effect'
          ? 'Nothing to save. Select an effect first.'
          : 'Nothing to save. Select a cue first.',
      )
      return false
    }

    // A document with no file yet creates one named after its group, and refuses a name already
    // taken. An open file saves over itself.
    const createOnly = editorDoc.path === null
    const saveFilename = createOnly ? `${snapshot.file.group.id}.json` : filename

    if (snapshot.mode === 'effect') {
      const effectContent = snapshot.file
      try {
        const validation = await validateEffect({ content: effectContent })
        if (!validation.valid) {
          setValidationErrors(validation.errors)
          return false
        }
        const response = await saveEffectFile({
          mode: effectContent.mode,
          filename: saveFilename,
          content: effectContent,
          createOnly,
        })
        if (!response.success) {
          onSaveError?.(`Failed to save effect: ${response.error}`)
          return false
        }
        installSaved(editorDoc, snapshot, response.path)
        await refreshEffectFiles()
        onSaveSuccess?.(`Effect saved: ${saveFilename}`)
        return true
      } catch (error) {
        log.error('Failed to save effect file', error)
        onSaveError?.(formatSaveError(error))
        return false
      }
    } else {
      const cueContent = snapshot.file
      try {
        const validation = await validateNodeCue({ content: cueContent })
        if (!validation.valid) {
          setValidationErrors(validation.errors)
          return false
        }
        const response = await saveNodeCueFile({
          mode: cueContent.mode,
          filename: saveFilename,
          content: cueContent,
          createOnly,
        })
        if (!response.success) {
          onSaveError?.(`Failed to save cue: ${response.error}`)
          return false
        }
        installSaved(editorDoc, snapshot, response.path)
        await refreshFiles()
        if (response.groupEnableError) {
          onSaveError?.(`Cue saved, but its group was not turned on: ${response.groupEnableError}`)
        } else {
          onSaveSuccess?.(`Cue saved: ${saveFilename}`)
        }
        return true
      } catch (error) {
        log.error('Failed to save node cue file', error)
        onSaveError?.(formatSaveError(error))
        return false
      }
    }
  }, [
    editorDoc,
    filename,
    getUpdatedDocument,
    installSaved,
    refreshFiles,
    refreshEffectFiles,
    onSaveSuccess,
    onSaveError,
    setValidationErrors,
  ])

  const handleDelete = useCallback(async () => {
    if (!editorDoc?.path) return
    const deletedPath = editorDoc.path
    const token = ++selectRequestRef.current

    try {
      orThrow(
        editorDoc.mode === 'effect'
          ? await deleteEffectFile(deletedPath)
          : await deleteNodeCueFile(deletedPath),
      )
    } catch (error) {
      log.error('Failed to delete file', error)
      onSaveError?.(`Failed to delete: ${error instanceof Error ? error.message : String(error)}`)
      return
    }

    if (deletedPath === lastStoredFilePathRef.current) {
      clearLastFilePath()
    }
    const isEffectDoc = editorDoc.mode === 'effect'
    const deletedKind = isEffectDoc
      ? undefined
      : editorDoc.file.cues.find((c) => c.id === selectedCueId)?.kind
    const modeKey = modeKeyFor(
      editorDoc.file.mode,
      deletedKind === 'motion' ? 'motion' : 'lighting',
      isEffectDoc,
    )
    clearLastFilePathForMode(modeKey)
    // A file opened while the delete ran stays open, edits and all.
    if (isStillOpen(token, editorDoc.mode, deletedPath)) {
      setEditorDoc(null)
      setSelectedCueId(null)
      setFilename('untitled.json')
      loadCueIntoFlow(null)
      setValidationErrors([])
      setIsDirty(false)
    }
    if (editorDoc.mode === 'effect') {
      await refreshEffectFiles()
    } else {
      await refreshFiles()
    }
  }, [
    clearLastFilePath,
    editorDoc,
    isStillOpen,
    selectedCueId,
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

  const handleExport = useCallback(async () => {
    if (!editorDoc?.path) return
    try {
      const result =
        editorDoc.mode === 'effect'
          ? await exportEffectFile(editorDoc.path)
          : await exportNodeCueFile(editorDoc.path)
      if (!wasCancelled(result)) orThrow(result)
    } catch (error) {
      log.error('Failed to export current file', error)
      onSaveError?.(`Failed to export: ${formatSaveError(error)}`)
    }
  }, [editorDoc, onSaveError])

  const handleReload = useCallback(async () => {
    const currentPath = editorDoc?.path
    const token = ++selectRequestRef.current

    if (editorDoc?.mode === 'effect') {
      await refreshEffectFiles()
    } else {
      await refreshFiles()
    }

    // A file selected while the list refreshed is the one the user wants.
    if (currentPath && isStillOpen(token, editorDoc.mode, currentPath)) {
      try {
        if (editorDoc.mode === 'effect') {
          const file = await readEffectFile(currentPath)
          if (!isStillOpen(token, 'effect', currentPath)) return
          setEditorDoc({ mode: 'effect', file, path: currentPath })
          setMode(file.mode)
          setFilename(currentPath.split(/[/\\]/).pop() ?? currentPath)
          const effects: (YargEffectDefinition | AudioEffectDefinition)[] = file.effects
          const effectToLoad = effects.find((e) => e.id === selectedCueId) ?? firstByName(effects)
          setSelectedCueId(effectToLoad?.id ?? null)
          setIsDirty(false)
          loadCueIntoFlow(effectToLoad ?? null)
        } else {
          const file = await readNodeCueFile(currentPath)
          if (!isStillOpen(token, 'cue', currentPath)) return
          setEditorDoc({ mode: 'cue', file, path: currentPath })
          setMode(file.mode)
          setFilename(currentPath.split(/[/\\]/).pop() ?? currentPath)
          const cues: (NetNodeCueDefinition | AudioNodeCueDefinition)[] = file.cues
          const kept = cues.find((c) => c.id === selectedCueId)
          const cueToLoad =
            kept ?? firstByName(cues.filter((c) => c.kind === cueKind)) ?? firstByName(cues)
          syncCueKindFromDefinition(cueToLoad, setCueKind)
          setSelectedCueId(cueToLoad?.id ?? null)
          setIsDirty(false)
          loadCueIntoFlow(cueToLoad ?? null)
        }
      } catch (error) {
        log.error('Failed to reload current file', error)
      }
    }
  }, [
    editorDoc,
    cueKind,
    isStillOpen,
    selectedCueId,
    refreshFiles,
    refreshEffectFiles,
    loadCueIntoFlow,
    setEditorDoc,
    setFilename,
    setMode,
    setCueKind,
    setSelectedCueId,
    setIsDirty,
  ])

  /**
   * Discards in-memory edits by re-reading the current file from disk. The editor mutates
   * `editorDoc` directly (Add Cue, JSON Apply, metadata), so clearing the dirty flag alone
   * leaves those edits in place — reverting to the on-disk copy is what truly discards them.
   * No-op for an unsaved file (no `path` to revert to). Kind, selection and flow are restored
   * alongside the document: an edit being discarded may have been the cue that was selected.
   */
  const revertCurrentFileToDisk = useCallback(async (): Promise<void> => {
    const currentPath = editorDoc?.path
    if (!currentPath) return
    const token = ++selectRequestRef.current
    try {
      if (editorDoc?.mode === 'effect') {
        const file = await readEffectFile(currentPath)
        if (token !== selectRequestRef.current) return
        setEditorDoc({ mode: 'effect', file, path: currentPath })
        const effects: (YargEffectDefinition | AudioEffectDefinition)[] = file.effects
        const effectToLoad = effects.find((e) => e.id === selectedCueId) ?? firstByName(effects)
        setSelectedCueId(effectToLoad?.id ?? null)
        loadCueIntoFlow(effectToLoad ?? null)
      } else {
        const file = await readNodeCueFile(currentPath)
        if (token !== selectRequestRef.current) return
        setEditorDoc({ mode: 'cue', file, path: currentPath })
        const cues: (NetNodeCueDefinition | AudioNodeCueDefinition)[] = file.cues
        const kept = cues.find((c) => c.id === selectedCueId)
        const cueToLoad =
          kept ?? firstByName(cues.filter((c) => c.kind === cueKind)) ?? firstByName(cues)
        syncCueKindFromDefinition(cueToLoad, setCueKind)
        setSelectedCueId(cueToLoad?.id ?? null)
        loadCueIntoFlow(cueToLoad ?? null)
      }
      setValidationErrors([])
      setIsDirty(false)
    } catch (error) {
      log.error('Failed to revert current file', error)
    }
  }, [
    editorDoc,
    cueKind,
    selectedCueId,
    loadCueIntoFlow,
    setEditorDoc,
    setCueKind,
    setSelectedCueId,
    setValidationErrors,
    setIsDirty,
  ])

  return {
    selectFile,
    selectEffectFile,
    handleSave,
    handleDelete,
    handleExport,
    handleReload,
    revertCurrentFileToDisk,
    refreshFiles,
    refreshEffectFiles,
  }
}
