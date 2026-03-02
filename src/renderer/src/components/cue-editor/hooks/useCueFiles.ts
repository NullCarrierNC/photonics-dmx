import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type {
  AudioNodeCueDefinition,
  NodeCueFile,
  NodeCueMode,
  YargNodeCueDefinition,
  EffectFile,
  YargEffectDefinition,
  AudioEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { getNodeCueTypes, listNodeCueFiles, listEffectFiles } from '../../../ipcApi'
import { addIpcListener, removeIpcListener } from '../../../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels'
import {
  clearStoredLastFilePath,
  getLastActiveMode,
  getLastFilePathForMode,
  getLastItemIdForMode,
  getStoredLastFilePath,
  setLastActiveMode,
  setLastItemIdForMode,
  setStoredLastFilePath,
} from './useLastCueFilePath'
import type { EditorModeKey } from './useLastCueFilePath'
import type { EditorDocument, EditorMode } from '../lib/types'
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader'
import { useCueFileIO } from './useCueFileIO'
import { useCueCrud } from './useCueCrud'
import { useCueMetadata } from './useCueMetadata'
import { isCueTypeSelectable } from '../lib/cueUtils'

type UseCueFilesParams = {
  loadCueIntoFlow: (
    cue:
      | YargNodeCueDefinition
      | AudioNodeCueDefinition
      | YargEffectDefinition
      | AudioEffectDefinition
      | null,
  ) => void
  getUpdatedDocument: () => NodeCueFile | EffectFile | null
  onSaveSuccess?: (message: string) => void
  onError?: (message: string) => void
}

const useCueFiles = ({
  loadCueIntoFlow,
  getUpdatedDocument,
  onSaveSuccess,
  onError,
}: UseCueFilesParams) => {
  const [files, setFiles] = useState<NodeCueFileSummary[]>([])
  const [effectFiles, setEffectFiles] = useState<EffectFileSummary[]>([])
  const [mode, setMode] = useState<NodeCueMode>(() => {
    const stored = getLastActiveMode()
    if (stored) return stored.startsWith('yarg') ? 'yarg' : 'audio'
    return 'yarg'
  })
  const [editorMode, setEditorMode] = useState<EditorMode>(() => {
    const stored = getLastActiveMode()
    if (stored) return stored.endsWith('-effect') ? 'effect' : 'cue'
    return 'cue'
  })
  const [editorDoc, setEditorDoc] = useState<EditorDocument | null>(null)
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null)
  const [filename, setFilename] = useState<string>('untitled.json')
  const [availableCueTypes, setAvailableCueTypes] = useState<string[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const restoredLastFileRef = useRef<boolean>(false)
  const lastStoredFilePathRef = useRef<string | null>(getStoredLastFilePath())

  const activeMode: NodeCueMode = editorDoc?.file.mode ?? mode

  const refreshFiles = useCallback(async () => {
    try {
      const summary = await listNodeCueFiles()
      setFiles([...summary.yarg, ...summary.audio])
    } catch (error) {
      console.error('Failed to list node cue files', error)
    }
  }, [])

  const refreshEffectFiles = useCallback(async () => {
    try {
      const summary = await listEffectFiles()
      setEffectFiles([...summary.yarg, ...summary.audio])
    } catch (error) {
      console.error('Failed to list effect files', error)
    }
  }, [])

  const rememberLastFilePath = useCallback((path: string | null) => {
    if (!path) return
    setStoredLastFilePath(path)
    lastStoredFilePathRef.current = path
  }, [])

  const clearLastFilePath = useCallback(() => {
    clearStoredLastFilePath()
    lastStoredFilePathRef.current = null
  }, [])

  const fileIO = useCueFileIO({
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
    onSaveError: onError,
    lastStoredFilePathRef,
  })

  const crud = useCueCrud({
    editorDoc,
    setEditorDoc,
    selectedCueId,
    setSelectedCueId,
    setFilename,
    mode,
    setValidationErrors,
    setIsDirty,
    loadCueIntoFlow,
    refreshFiles: fileIO.refreshFiles,
    refreshEffectFiles: fileIO.refreshEffectFiles,
    onError,
  })

  const metadata = useCueMetadata({
    editorDoc,
    setEditorDoc,
    selectedCueId,
    setIsDirty,
  })

  const currentCueDefinition = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return null
    const cueFile = editorDoc.file as NodeCueFile
    return cueFile.cues.find((cue) => cue.id === selectedCueId) ?? null
  }, [editorDoc, selectedCueId])

  const currentEffectDefinition = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'effect') return null
    const effectFile = editorDoc.file as EffectFile
    return effectFile.effects.find((effect) => effect.id === selectedCueId) ?? null
  }, [editorDoc, selectedCueId])

  const groupedFiles = useMemo(
    () => ({
      yarg: files.filter((file) => file.mode === 'yarg'),
      audio: files.filter((file) => file.mode === 'audio'),
    }),
    [files],
  )

  const groupedEffectFiles = useMemo(
    () => ({
      yarg: effectFiles.filter((file) => file.mode === 'yarg'),
      audio: effectFiles.filter((file) => file.mode === 'audio'),
    }),
    [effectFiles],
  )

  const handleModeChange = useCallback(
    (nextMode: string) => {
      const isEffect = nextMode === 'yarg-effect' || nextMode === 'audio-effect'
      const cueMode: NodeCueMode =
        nextMode === 'yarg-effect' || nextMode === 'yarg' ? 'yarg' : 'audio'
      const modeKey: EditorModeKey = isEffect
        ? cueMode === 'yarg'
          ? 'yarg-effect'
          : 'audio-effect'
        : cueMode === 'yarg'
          ? 'yarg-cue'
          : 'audio-cue'

      setMode(cueMode)
      setEditorMode(isEffect ? 'effect' : 'cue')
      setLastActiveMode(modeKey)

      const storedPath = getLastFilePathForMode(modeKey)
      const preferredItemId = getLastItemIdForMode(modeKey) ?? undefined

      if (isEffect) {
        const summary = effectFiles.find((f) => f.path === storedPath)
        if (summary) {
          fileIO.selectEffectFile(summary, preferredItemId)
        } else {
          setEditorDoc(null)
          setSelectedCueId(null)
          setFilename('untitled.json')
          loadCueIntoFlow(null)
          setIsDirty(false)
        }
      } else {
        const summary = files.find((f) => f.path === storedPath)
        if (summary) {
          fileIO.selectFile(summary, preferredItemId)
        } else {
          setEditorDoc(null)
          setSelectedCueId(null)
          setFilename('untitled.json')
          loadCueIntoFlow(null)
          setIsDirty(false)
        }
      }
    },
    [
      effectFiles,
      files,
      fileIO,
      loadCueIntoFlow,
      setEditorDoc,
      setFilename,
      setMode,
      setSelectedCueId,
      setIsDirty,
    ],
  )

  useEffect(() => {
    fileIO.refreshFiles()
    fileIO.refreshEffectFiles()
    const handler = (payload: { yarg: NodeCueFileSummary[]; audio: NodeCueFileSummary[] }) => {
      setFiles([...payload.yarg, ...payload.audio])
    }
    const effectHandler = (payload: { yarg: EffectFileSummary[]; audio: EffectFileSummary[] }) => {
      setEffectFiles([...payload.yarg, ...payload.audio])
    }
    addIpcListener(RENDERER_RECEIVE.NODE_CUES_CHANGED, handler)
    addIpcListener(RENDERER_RECEIVE.EFFECTS_CHANGED, effectHandler)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.NODE_CUES_CHANGED, handler)
      removeIpcListener(RENDERER_RECEIVE.EFFECTS_CHANGED, effectHandler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: fileIO methods only
  }, [fileIO.refreshFiles, fileIO.refreshEffectFiles])

  useEffect(() => {
    getNodeCueTypes(mode)
      .then((types: string[]) => setAvailableCueTypes(types.filter(isCueTypeSelectable)))
      .catch(() => setAvailableCueTypes([]))
  }, [mode])

  useEffect(() => {
    if (!selectedCueId || !editorDoc) return
    const isEffect = editorDoc.mode === 'effect'
    const cueMode = editorDoc.file.mode
    const modeKey: EditorModeKey = isEffect
      ? cueMode === 'yarg'
        ? 'yarg-effect'
        : 'audio-effect'
      : cueMode === 'yarg'
        ? 'yarg-cue'
        : 'audio-cue'
    setLastItemIdForMode(modeKey, selectedCueId)
  }, [selectedCueId, editorDoc])

  useEffect(() => {
    if (restoredLastFileRef.current) return

    const modeKey = getLastActiveMode()
    if (!modeKey) {
      restoredLastFileRef.current = true
      return
    }

    const isEffect = modeKey === 'yarg-effect' || modeKey === 'audio-effect'
    const storedPath = getLastFilePathForMode(modeKey)
    if (!storedPath) {
      restoredLastFileRef.current = true
      return
    }

    const preferredItemId = getLastItemIdForMode(modeKey) ?? undefined

    if (isEffect) {
      if (effectFiles.length === 0) return
      const summary = effectFiles.find((f) => f.path === storedPath)
      restoredLastFileRef.current = true
      if (summary) fileIO.selectEffectFile(summary, preferredItemId)
    } else {
      if (files.length === 0) return
      const summary = files.find((f) => f.path === storedPath)
      restoredLastFileRef.current = true
      if (summary) fileIO.selectFile(summary, preferredItemId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: one-shot restore
  }, [files, effectFiles, fileIO.selectFile, fileIO.selectEffectFile])

  return {
    mode,
    activeMode,
    editorMode,
    files,
    effectFiles,
    groupedFiles,
    groupedEffectFiles,
    editorDoc,
    selectedCueId,
    filename,
    availableCueTypes,
    validationErrors,
    isDirty,
    currentCueDefinition,
    currentEffectDefinition,
    setFilename,
    setSelectedCueId,
    setEditorDoc,
    setIsDirty,
    setValidationErrors,
    handleModeChange,
    handleNewFile: crud.handleNewFile,
    handleCreateNewFile: crud.handleCreateNewFile,
    updateGroupMeta: metadata.updateGroupMeta,
    updateCueMetadata: metadata.updateCueMetadata,
    updateEffectMetadata: metadata.updateEffectMetadata,
    handleAddCue: crud.handleAddCue,
    handleAddEffect: crud.handleAddEffect,
    removeCue: crud.removeCue,
    removeEffect: crud.removeEffect,
    selectFile: fileIO.selectFile,
    selectEffectFile: fileIO.selectEffectFile,
    handleSave: fileIO.handleSave,
    handleDelete: fileIO.handleDelete,
    handleImport: fileIO.handleImport,
    handleExport: fileIO.handleExport,
    refreshFiles: fileIO.refreshFiles,
    handleReload: fileIO.handleReload,
  }
}

export { useCueFiles }
