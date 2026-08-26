import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import type { Layout } from 'react-resizable-panels'
import 'reactflow/dist/style.css'
import CueEditorToolbar from '../components/cue-editor/components/CueEditorToolbar'
import CueEditorWorkspace from '../components/cue-editor/components/CueEditorWorkspace'
import ActionNodeComponent from '../components/cue-editor/components/flow/ActionNode'
import EventNodeComponent from '../components/cue-editor/components/flow/EventNode'
import LogicNodeComponent from '../components/cue-editor/components/flow/LogicNode'
import EventRaiserNodeComponent from '../components/cue-editor/components/flow/EventRaiserNode'
import EventListenerNodeComponent from '../components/cue-editor/components/flow/EventListenerNode'
import EffectRaiserNodeComponent from '../components/cue-editor/components/flow/EffectRaiserNode'
import EffectListenerNodeComponent from '../components/cue-editor/components/flow/EffectListenerNode'
import NotesNodeComponent from '../components/cue-editor/components/flow/NotesNode'
import NewFileModal from '../components/cue-editor/components/NewFileModal'
import ImportCueFileModal from '../components/cue-editor/components/ImportCueFileModal'
import ToastContainer from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { useCueFiles } from '../components/cue-editor/hooks/useCueFiles'
import { useCueFlow } from '../components/cue-editor/hooks/useCueFlow'
import { useActiveNodes } from '../components/cue-editor/hooks/useActiveNodes'
import { useErrorNodes } from '../components/cue-editor/hooks/useErrorNodes'
import { useLevelModeWarnings } from '../components/cue-editor/hooks/useLevelModeWarnings'
import { useEffectDefinitions } from '../components/cue-editor/hooks/useEffectDefinitions'
import { useCueEditorNavigation } from '../components/cue-editor/hooks/useCueEditorNavigation'
import { useCueRegistryPanel } from '../components/cue-editor/hooks/useCueRegistryPanel'
import { useCueJsonEditor } from '../components/cue-editor/hooks/useCueJsonEditor'
import type {
  NodeCueFile,
  EffectFile,
  YargEffectDefinition,
  AudioEffectDefinition,
  NetNodeCueDefinition,
  AudioNodeCueDefinition,
} from '../../../photonics-dmx/cues/types/nodeCueTypes'
import { showItemInFolder } from '../ipcApi'
import {
  DEFAULT_SIDEBAR_LAYOUT,
  getStoredSidebarLayout,
} from '../components/cue-editor/lib/sidebarLayout'

type EditorCueOrEffect =
  | NetNodeCueDefinition
  | AudioNodeCueDefinition
  | YargEffectDefinition
  | AudioEffectDefinition
  | null

const CueEditor: React.FC = () => {
  const [sidebarLayout] = useState<Layout>(
    () => getStoredSidebarLayout() ?? { ...DEFAULT_SIDEBAR_LAYOUT },
  )
  const [showNewFileModal, setShowNewFileModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { toasts, showToast, hideToast } = useToast()
  const loadCueIntoFlowRef = useRef<(cue: EditorCueOrEffect) => void>(() => {})
  const getUpdatedDocumentRef = useRef<() => NodeCueFile | EffectFile | null>(() => null)
  const flowWrapperRef = useRef<HTMLDivElement | null>(null)

  const loadCueIntoFlowProxy = useCallback(
    (cue: EditorCueOrEffect) => loadCueIntoFlowRef.current(cue),
    [],
  )
  const getUpdatedDocumentProxy = useCallback(() => getUpdatedDocumentRef.current(), [])

  const {
    mode,
    cueKind,
    setCueKind,
    activeMode,
    editorMode,
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
    setSelectedCueId,
    setEditorDoc,
    setIsDirty,
    handleModeChange,
    handleCreateNewFile,
    existingGroupIdsForNewFileModal,
    updateGroupMeta,
    updateCueMetadata,
    updateEffectMetadata,
    handleAddCue,
    handleAddEffect,
    removeCue,
    removeEffect,
    selectFile,
    selectEffectFile,
    handleSave,
    handleDelete,
    handleImport,
    handleExport,
    handleReload,
    revertCurrentFileToDisk,
    pendingImport,
    clearPendingImport,
    commitPendingImport,
    existingGroupIdsForImportModal,
    existingFilenamesLowerForImportModal,
  } = useCueFiles({
    loadCueIntoFlow: loadCueIntoFlowProxy,
    getUpdatedDocument: getUpdatedDocumentProxy,
    onSaveSuccess: (message) => showToast(message, 'success'),
    onError: (message) => showToast(message, 'error'),
  })

  const isEffectMode = editorMode === 'effect'

  const loadedEffectDefinitions = useEffectDefinitions(
    editorDoc,
    selectedCueId,
    mode,
    groupedEffectFiles,
  )

  const flow = useCueFlow({
    activeMode,
    cueKind: editorMode === 'cue' ? cueKind : 'lighting',
    editorMode,
    setIsDirty,
    flowWrapperRef,
    effectDefinitions: loadedEffectDefinitions,
  })
  const { nodes, setNodes, edges, loadCueIntoFlow, reactFlowInstance } = flow

  useEffect(() => {
    loadCueIntoFlowRef.current = loadCueIntoFlow
  }, [loadCueIntoFlow])

  const json = useCueJsonEditor({
    editorDoc,
    selectedCueId,
    currentCueDefinition,
    currentEffectDefinition: currentEffectDefinition as
      | YargEffectDefinition
      | AudioEffectDefinition
      | null,
    nodes,
    edges,
    reactFlowInstance,
    setNodes,
    setEditorDoc,
    setSelectedCueId,
    setIsDirty,
    loadCueIntoFlow,
  })
  const { showJsonEditor, jsonEditorDirty, closeJsonEditor, getUpdatedDocument } = json

  useEffect(() => {
    getUpdatedDocumentRef.current = getUpdatedDocument
  }, [getUpdatedDocument])

  const {
    handleCuePlatformChange,
    handleCueKindChange,
    handleEffectToggle,
    guardJsonEditorNavigation,
    pendingNavigation,
    handleDiscardNavigation,
    cancelPendingNavigation,
  } = useCueEditorNavigation({
    mode,
    cueKind,
    isEffectMode,
    isDirty,
    jsonEditorDirty: showJsonEditor && jsonEditorDirty,
    setCueKind,
    handleModeChange,
    closeJsonEditor,
    revertCurrentFileToDisk,
    setIsDirty,
  })

  useEffect(() => {
    if (editorMode !== 'cue' || !editorDoc || editorDoc.mode !== 'cue') return
    const cueFile = editorDoc.file as NodeCueFile
    const matchingCues = cueFile.cues.filter((c) => c.kind === cueKind)
    if (matchingCues.length === 0) {
      setEditorDoc(null)
      setSelectedCueId(null)
      loadCueIntoFlow(null)
      setIsDirty(false)
      return
    }
    const selectedOk = selectedCueId != null && matchingCues.some((c) => c.id === selectedCueId)
    if (!selectedOk) {
      const first = matchingCues[0]
      setSelectedCueId(first.id)
      loadCueIntoFlow(first as EditorCueOrEffect)
    }
  }, [
    cueKind,
    editorDoc,
    selectedCueId,
    editorMode,
    setEditorDoc,
    setSelectedCueId,
    loadCueIntoFlow,
    setIsDirty,
  ])

  const currentGraphId =
    editorDoc?.mode === 'effect'
      ? (currentEffectDefinition as { id?: string } | null)?.id ?? null
      : editorDoc?.file && selectedCueId && 'group' in editorDoc.file
        ? `${(editorDoc.file as NodeCueFile).group.id}:${selectedCueId}`
        : selectedCueId ?? null
  const activeNodeIds = useActiveNodes(currentGraphId)
  const errorNodeIds = useErrorNodes(currentGraphId)
  const { warningNodeIds, warningMessages } = useLevelModeWarnings(nodes, edges)

  const usedCueTypes = useMemo((): Set<string> => {
    if (!editorDoc || editorDoc.mode !== 'cue' || cueKind !== 'lighting') return new Set()
    const cueFile = editorDoc.file as NodeCueFile
    return new Set(
      cueFile.cues
        .filter((cue) => cue.id !== selectedCueId && cue.kind === 'lighting')
        .map((cue) =>
          // rb3 is YARG-shaped (keyed by cueType); only audio cues are keyed by cueTypeId.
          cueFile.mode === 'audio'
            ? (cue as AudioNodeCueDefinition & { kind: 'lighting' }).cueTypeId
            : (cue as NetNodeCueDefinition & { kind: 'lighting' }).cueType,
        )
        .filter(Boolean),
    )
  }, [editorDoc, selectedCueId, cueKind])

  const nodeTypes = useMemo(
    () => ({
      'event': EventNodeComponent,
      'action': ActionNodeComponent,
      'logic': LogicNodeComponent,
      'event-raiser': EventRaiserNodeComponent,
      'event-listener': EventListenerNodeComponent,
      'effect-raiser': EffectRaiserNodeComponent,
      'effect-listener': EffectListenerNodeComponent,
      'notes': NotesNodeComponent,
    }),
    [],
  )

  const registry = useCueRegistryPanel({
    editorDoc,
    selectedCueId,
    activeMode,
    nodes,
    currentEffectDefinition: currentEffectDefinition as
      | YargEffectDefinition
      | AudioEffectDefinition
      | null,
    loadedEffectDefinitions,
    updateGroupMeta,
    updateCueMetadata,
    updateEffectMetadata,
  })

  const fileList =
    mode === 'rb3' ? groupedFiles.rb3 : mode === 'audio' ? groupedFiles.audio : groupedFiles.yarg
  // rb3 has no effect files of its own; only audio differs from the yarg effect bucket.
  const effectFiles = mode === 'audio' ? groupedEffectFiles.audio : groupedEffectFiles.yarg

  const hasFile = !!editorDoc?.path

  const newFileLabel = isEffectMode ? 'New Effect File' : 'New Cue File'
  const importLabel = isEffectMode ? 'Import Effect' : 'Import Cue File'
  const exportLabel = isEffectMode ? 'Export Effect' : 'Export Cue File'
  const deleteLabel = isEffectMode ? 'Delete Effect File' : 'Delete Cue File'

  return (
    <div className="p-4 space-y-4 text-sm h-full flex flex-col">
      <CueEditorToolbar
        cuePlatform={mode}
        cueKind={cueKind}
        isEffectMode={isEffectMode}
        onCuePlatformChange={(p) => guardJsonEditorNavigation(() => handleCuePlatformChange(p))}
        onCueKindChange={(k) => guardJsonEditorNavigation(() => handleCueKindChange(k))}
        onEffectToggle={(e) => guardJsonEditorNavigation(() => handleEffectToggle(e))}
        onNewFile={() => setShowNewFileModal(true)}
        onSave={handleSave}
        onImport={handleImport}
        onExport={handleExport}
        onDelete={() => setShowDeleteConfirm(true)}
        hasEditorDoc={!!editorDoc}
        hasFile={hasFile}
        newFileLabel={newFileLabel}
        importLabel={importLabel}
        exportLabel={exportLabel}
        deleteLabel={deleteLabel}
      />
      <CueEditorWorkspace
        sidebarLayout={sidebarLayout}
        files={{
          mode,
          cueKind,
          isEffectMode,
          editorMode,
          activeMode,
          editorDoc,
          selectedCueId,
          filename,
          fileList,
          effectFiles,
          availableCueTypes,
          usedCueTypes,
          validationErrors,
          currentCueDefinition,
          currentEffectDefinition,
          hasFile,
          selectFile,
          selectEffectFile,
          handleReload,
          handleAddCue,
          handleAddEffect,
          removeCue,
          removeEffect,
          setSelectedCueId,
          updateGroupMeta,
          updateCueMetadata,
          updateEffectMetadata,
        }}
        flow={flow}
        registry={registry}
        json={json}
        nodeTypes={nodeTypes}
        flowWrapperRef={flowWrapperRef}
        activeNodeIds={activeNodeIds}
        errorNodeIds={errorNodeIds}
        warningNodeIds={warningNodeIds}
        warningMessages={warningMessages}
        guardJsonEditorNavigation={guardJsonEditorNavigation}
      />
      <div className="text-xs text-gray-500 flex justify-between">
        {editorDoc?.path ? (
          <button
            className="hover:text-blue-600 hover:underline text-left"
            onClick={() => {
              if (editorDoc?.path) showItemInFolder(editorDoc.path)
            }}
            title="Click to reveal in file explorer">
            {editorDoc.path}
          </button>
        ) : (
          <span>Unsaved file</span>
        )}
        <span>{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
      </div>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 max-w-sm text-sm space-y-3">
            <p id="delete-confirm-title" className="font-semibold">
              Delete {deleteLabel}?
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              This will permanently delete all items in the{' '}
              <span className="font-medium">{filename}</span> file. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  setShowDeleteConfirm(false)
                  await handleDelete()
                }}
                className="px-3 py-1.5 text-sm font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500">
                Delete
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <NewFileModal
        isOpen={showNewFileModal}
        isEffectMode={isEffectMode}
        mode={mode}
        existingGroupIds={existingGroupIdsForNewFileModal}
        onCancel={() => setShowNewFileModal(false)}
        onSave={(metadata) => {
          handleCreateNewFile(metadata)
          setShowNewFileModal(false)
        }}
      />

      {pendingImport !== null && (
        <ImportCueFileModal
          key={`${pendingImport.kind}-${pendingImport.sourceBasename}`}
          isOpen
          isEffectMode={pendingImport.kind === 'effect'}
          mode={pendingImport.saveMode}
          sourceBasename={pendingImport.sourceBasename}
          defaultGroupId={pendingImport.suggestedGroupId}
          existingGroupIds={existingGroupIdsForImportModal}
          existingFilenamesLower={existingFilenamesLowerForImportModal}
          onCancel={clearPendingImport}
          onSave={(saveFilename, groupId) => {
            void commitPendingImport(saveFilename, groupId)
          }}
        />
      )}

      {pendingNavigation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-title">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 max-w-sm text-sm space-y-3">
            <p id="unsaved-title">You have unsaved changes. Discard them?</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleDiscardNavigation}
                className="px-3 py-1.5 text-sm font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500">
                Discard
              </button>
              <button
                type="button"
                onClick={cancelPendingNavigation}
                className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={hideToast} />
    </div>
  )
}

export default CueEditor
