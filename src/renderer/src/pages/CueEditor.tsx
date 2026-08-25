import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Layout } from 'react-resizable-panels'
import 'reactflow/dist/style.css'
import CueFlowCanvas from '../components/cue-editor/components/CueFlowCanvas'
import CueJsonEditor from '../components/cue-editor/components/CueJsonEditor'
import EffectJsonEditor from '../components/cue-editor/components/EffectJsonEditor'
import CueFileSidebar from '../components/cue-editor/components/CueFileSidebar'
import CueMetadataForm from '../components/cue-editor/components/CueMetadataForm'
import NodeSidebar from '../components/cue-editor/components/NodeSidebar'
import CueEditorToolbar from '../components/cue-editor/components/CueEditorToolbar'
import CueEditorRegistryPanel from '../components/cue-editor/components/CueEditorRegistryPanel'
import CueEditorValidationErrors from '../components/cue-editor/components/CueEditorValidationErrors'
import CueEditorWarnings from '../components/cue-editor/components/CueEditorWarnings'
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
import { ActiveNodesContext } from '../components/cue-editor/context/ActiveNodesContext'
import { ErrorNodesContext } from '../components/cue-editor/context/ErrorNodesContext'
import { WarningNodesContext } from '../components/cue-editor/context/WarningNodesContext'
import {
  updateDocumentFromFlow,
  updateEffectDocumentFromFlow,
} from '../components/cue-editor/lib/cueTransforms'
import { layoutGraph } from '../components/cue-editor/lib/graphPrettier'
import type {
  NodeCueFile,
  EffectFile,
  VariableDefinition,
  EventDefinition,
  EffectReference,
  YargEffectDefinition,
  AudioEffectDefinition,
  NetNodeCueDefinition,
  AudioNodeCueDefinition,
  NodeCueKind,
} from '../../../photonics-dmx/cues/types/nodeCueTypes'
import { showItemInFolder } from '../ipcApi'
import {
  DEFAULT_SIDEBAR_LAYOUT,
  getStoredSidebarLayout,
  setStoredSidebarLayout,
} from '../components/cue-editor/lib/sidebarLayout'
import { enrichAvailableVariables } from '../components/cue-editor/lib/availableVariables'
import {
  collectEventReferences,
  collectVariableReferences,
} from '../components/cue-editor/lib/graphReferences'

type EditorCueOrEffect =
  | NetNodeCueDefinition
  | AudioNodeCueDefinition
  | YargEffectDefinition
  | AudioEffectDefinition
  | null

const CueEditor: React.FC = () => {
  const [registryTab, setRegistryTab] = useState<'variables' | 'events' | 'effects'>('variables')
  const [sidebarLayout] = useState<Layout>(
    () => getStoredSidebarLayout() ?? { ...DEFAULT_SIDEBAR_LAYOUT },
  )
  const [showNewFileModal, setShowNewFileModal] = useState(false)
  const [showJsonEditor, setShowJsonEditor] = useState(false)
  const [jsonEditorDirty, setJsonEditorDirty] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
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

  const handleCuePlatformChange = useCallback(
    (p: 'yarg' | 'audio' | 'rb3') => {
      // rb3 has no effects of its own, so it always lands on a cue.
      if (isEffectMode && p !== 'rb3') {
        handleModeChange(p === 'audio' ? 'audio-effect' : 'yarg-effect')
        return
      }
      if (cueKind === 'motion') {
        handleModeChange(
          p === 'yarg' ? 'yarg-motion-cue' : p === 'rb3' ? 'rb3-motion-cue' : 'audio-motion-cue',
        )
      } else {
        handleModeChange(p === 'yarg' ? 'yarg-cue' : p === 'rb3' ? 'rb3-cue' : 'audio-cue')
      }
    },
    [handleModeChange, isEffectMode, cueKind],
  )

  const handleCueKindChange = useCallback(
    (k: NodeCueKind) => {
      // The kind toggle is hidden in effect mode, which has no motion side.
      if (isEffectMode) return
      setCueKind(k)
      if (k === 'motion') {
        handleModeChange(
          mode === 'yarg'
            ? 'yarg-motion-cue'
            : mode === 'rb3'
              ? 'rb3-motion-cue'
              : 'audio-motion-cue',
        )
      } else {
        handleModeChange(mode === 'yarg' ? 'yarg-cue' : mode === 'rb3' ? 'rb3-cue' : 'audio-cue')
      }
    },
    [handleModeChange, isEffectMode, mode, setCueKind],
  )

  const handleEffectToggle = useCallback(
    (isEffect: boolean) => {
      // There is no rb3 effect mode: rb3 cues reference YARG effects, so from rb3 the Effects
      // toggle switches to the YARG effect platform (where those effects are authored).
      if (isEffect) {
        setCueKind('lighting')
        const effectKey = mode === 'audio' ? 'audio-effect' : 'yarg-effect'
        handleModeChange(effectKey)
      } else {
        const cueKey = mode === 'audio' ? 'audio-cue' : 'yarg-cue'
        handleModeChange(cueKey)
      }
    },
    [handleModeChange, mode, setCueKind],
  )

  const {
    nodes,
    setNodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    handleNodeSelection,
    handleNodeContextMenu,
    handleRemoveNode,
    onEdgeContextMenu,
    selectedNode,
    selectedActionHasEventParent,
    contextMenu,
    paneContextMenu,
    addEventNode,
    addActionNode,
    addLogicNode,
    addEventRaiserNode,
    addEventListenerNode,
    addEffectRaiserNode,
    addEffectListenerNode,
    addNotesNode,
    updateSelectedNode,
    updateNodeId,
    loadCueIntoFlow,
    setReactFlowInstance,
    reactFlowInstance,
    closeContextMenu,
    handlePaneContextMenu,
  } = useCueFlow({
    activeMode,
    cueKind: editorMode === 'cue' ? cueKind : 'lighting',
    editorMode,
    setIsDirty,
    flowWrapperRef,
    effectDefinitions: loadedEffectDefinitions,
  })

  useEffect(() => {
    loadCueIntoFlowRef.current = loadCueIntoFlow
  }, [loadCueIntoFlow])

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

  const getUpdatedDocument = useCallback((): NodeCueFile | EffectFile | null => {
    if (editorDoc?.mode === 'effect') {
      return updateEffectDocumentFromFlow(
        editorDoc,
        currentEffectDefinition as YargEffectDefinition | AudioEffectDefinition | null,
        nodes,
        edges,
        reactFlowInstance,
      )
    } else {
      return updateDocumentFromFlow(
        editorDoc,
        currentCueDefinition,
        nodes,
        edges,
        reactFlowInstance,
      )
    }
  }, [editorDoc, currentCueDefinition, currentEffectDefinition, nodes, edges, reactFlowInstance])

  useEffect(() => {
    getUpdatedDocumentRef.current = getUpdatedDocument
  }, [getUpdatedDocument])

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

  const handleVariablesChange = useCallback(
    (groupVars: VariableDefinition[], cueVars: VariableDefinition[]) => {
      if (!editorDoc) return

      if (editorDoc.mode === 'effect') {
        // In effect mode, cueVars are actually effect variables
        updateEffectMetadata({ variables: cueVars })
      } else {
        // In cue mode, update both group and cue variables
        updateGroupMeta({ variables: groupVars })

        if (selectedCueId) {
          updateCueMetadata({ variables: cueVars })
        }
      }
    },
    [editorDoc, selectedCueId, updateGroupMeta, updateCueMetadata, updateEffectMetadata],
  )

  const handleSyncVariableValidValues = useCallback(
    (varName: string, scope: 'cue' | 'cue-group', validValues: string[]) => {
      if (!editorDoc) return

      if (editorDoc.mode === 'effect') {
        const vars = (currentEffectDefinition?.variables ?? []).map((v) =>
          v.name === varName ? { ...v, validValues: [...validValues] } : v,
        )
        updateEffectMetadata({ variables: vars })
      } else {
        const cueFile = editorDoc.file as NodeCueFile
        if (scope === 'cue-group') {
          const groupVars = (cueFile.group.variables ?? []).map((v) =>
            v.name === varName ? { ...v, validValues: [...validValues] } : v,
          )
          updateGroupMeta({ variables: groupVars })
        } else {
          if (!selectedCueId) return
          const cueVars = (cueFile.cues.find((c) => c.id === selectedCueId)?.variables ?? []).map(
            (v) => (v.name === varName ? { ...v, validValues: [...validValues] } : v),
          )
          updateCueMetadata({ variables: cueVars })
        }
      }
    },
    [
      editorDoc,
      selectedCueId,
      currentEffectDefinition?.variables,
      updateGroupMeta,
      updateCueMetadata,
      updateEffectMetadata,
    ],
  )

  const handleEventsChange = useCallback(
    (events: EventDefinition[]) => {
      if (!editorDoc || !selectedCueId) return

      // Update cue events
      updateCueMetadata({ events })
    },
    [editorDoc, selectedCueId, updateCueMetadata],
  )

  const handleEffectsChange = useCallback(
    (effects: EffectReference[]) => {
      if (!editorDoc || !selectedCueId) return

      // Update cue effects
      updateCueMetadata({ effects })
    },
    [editorDoc, selectedCueId, updateCueMetadata],
  )

  const getVariableReferences = useCallback(
    (varName: string, _scope: 'cue' | 'cue-group'): string[] =>
      editorDoc ? collectVariableReferences(nodes, varName) : [],
    [editorDoc, nodes],
  )

  const getEventReferences = useCallback(
    (eventName: string): string[] =>
      editorDoc && selectedCueId && editorDoc.mode === 'cue'
        ? collectEventReferences(editorDoc.file as NodeCueFile, selectedCueId, eventName)
        : [],
    [editorDoc, selectedCueId],
  )

  const availableVariables = useMemo(() => {
    if (!editorDoc) return []

    // Effect mode: use effect's variables
    if (editorDoc.mode === 'effect') {
      const effectVars = (currentEffectDefinition?.variables ?? []).map((v) => ({
        name: v.name,
        type: v.type,
        scope: 'cue' as const, // Effect variables are cue-scoped
        validValues: v.validValues,
      }))
      return enrichAvailableVariables(effectVars, currentEffectDefinition?.nodes.logic, activeMode)
    }

    // Cue mode: combine group and cue variables
    const cueFile = editorDoc.file as NodeCueFile
    const currentCue = selectedCueId ? cueFile.cues.find((c) => c.id === selectedCueId) : undefined
    const groupVars = (cueFile.group.variables ?? []).map((v) => ({
      name: v.name,
      type: v.type,
      scope: 'cue-group' as const,
      validValues: v.validValues,
    }))

    const cueVars = (currentCue?.variables ?? []).map((v) => ({
      name: v.name,
      type: v.type,
      scope: 'cue' as const,
      validValues: v.validValues,
    }))

    return enrichAvailableVariables([...groupVars, ...cueVars], currentCue?.nodes.logic, activeMode)
  }, [editorDoc, selectedCueId, currentEffectDefinition, activeMode])

  const availableEvents = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return []

    const cueFile = editorDoc.file as NodeCueFile
    const currentCue = cueFile.cues.find((c) => c.id === selectedCueId)
    return (currentCue?.events ?? []).map((e) => e.name)
  }, [editorDoc, selectedCueId])

  const availableEffects = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return []

    const cueFile = editorDoc.file as NodeCueFile
    const currentCue = cueFile.cues.find((c) => c.id === selectedCueId)
    return (currentCue?.effects ?? []).map((e) => ({
      id: e.effectId,
      name: e.name,
      definition: loadedEffectDefinitions.get(e.effectId),
    }))
  }, [editorDoc, selectedCueId, loadedEffectDefinitions])

  const handleJsonEditorSave = useCallback(
    (updatedCue: NetNodeCueDefinition | AudioNodeCueDefinition) => {
      if (!editorDoc || editorDoc.mode !== 'cue' || !selectedCueId) return
      const file = editorDoc.file as NodeCueFile
      const updatedFile: NodeCueFile = {
        ...file,
        cues: file.cues.map((c) => (c.id === selectedCueId ? updatedCue : c)),
      }
      setEditorDoc({ mode: 'cue', file: updatedFile, path: editorDoc.path })
      // Collision resolution may have regenerated the cue's id; follow it so the editor
      // keeps the same cue selected instead of falling back to another one.
      setSelectedCueId(updatedCue.id)
      loadCueIntoFlow(updatedCue)
      setShowJsonEditor(false)
      setJsonEditorDirty(false)
      setIsDirty(true)
    },
    [editorDoc, selectedCueId, loadCueIntoFlow, setEditorDoc, setSelectedCueId, setIsDirty],
  )

  const handleJsonEffectSave = useCallback(
    (updatedEffect: YargEffectDefinition | AudioEffectDefinition) => {
      if (!editorDoc || editorDoc.mode !== 'effect' || !selectedCueId) return
      const file = editorDoc.file as EffectFile
      const updatedFile: EffectFile = {
        ...file,
        effects: file.effects.map((e) => (e.id === selectedCueId ? updatedEffect : e)),
      }
      setEditorDoc({ mode: 'effect', file: updatedFile, path: editorDoc.path })
      setSelectedCueId(updatedEffect.id)
      loadCueIntoFlow(updatedEffect)
      setShowJsonEditor(false)
      setJsonEditorDirty(false)
      setIsDirty(true)
    },
    [editorDoc, selectedCueId, loadCueIntoFlow, setEditorDoc, setSelectedCueId, setIsDirty],
  )

  const handleGraphPrettify = useCallback(() => {
    const definition = editorDoc?.mode === 'effect' ? currentEffectDefinition : currentCueDefinition
    if (!definition) return

    const nodesData = definition.nodes
    const connections = definition.connections
    const existingPositions = definition.layout?.nodePositions ?? {}
    const result = layoutGraph(definition.id, nodesData, connections, existingPositions)
    if (!('nodePositions' in result) || !result.nodePositions) return

    setNodes((prev) =>
      prev.map((node) => {
        const newPos = result.nodePositions[node.id]
        return newPos ? { ...node, position: newPos } : node
      }),
    )

    if (result.viewport && reactFlowInstance) {
      reactFlowInstance.setViewport(result.viewport)
    }

    setIsDirty(true)
  }, [
    editorDoc?.mode,
    currentCueDefinition,
    currentEffectDefinition,
    setNodes,
    reactFlowInstance,
    setIsDirty,
  ])

  const guardJsonEditorNavigation = useCallback(
    (action: () => void) => {
      const jsonDirty = showJsonEditor && jsonEditorDirty
      if (jsonDirty || isDirty) {
        setPendingNavigation(() => action)
      } else {
        setShowJsonEditor(false)
        setJsonEditorDirty(false)
        action()
      }
    },
    [showJsonEditor, jsonEditorDirty, isDirty],
  )

  const handleDiscardNavigation = useCallback(async () => {
    if (!pendingNavigation) return
    // Edits live in the in-memory editorDoc (Add Cue / JSON Apply / metadata), so truly
    // discarding them means reverting to the on-disk copy before performing the navigation.
    await revertCurrentFileToDisk()
    pendingNavigation()
    setPendingNavigation(null)
    setShowJsonEditor(false)
    setJsonEditorDirty(false)
    setIsDirty(false)
  }, [pendingNavigation, revertCurrentFileToDisk, setIsDirty])

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

      <Group
        className="flex-1 min-h-0"
        orientation="horizontal"
        defaultLayout={sidebarLayout}
        onLayoutChanged={setStoredSidebarLayout}
        resizeTargetMinimumSize={{ fine: 8, coarse: 24 }}>
        <Panel
          id="left"
          minSize="15%"
          maxSize="50%"
          className="flex flex-col gap-4 overflow-hidden min-h-0">
          <CueFileSidebar
            mode={mode}
            cueKind={cueKind}
            isEffectMode={isEffectMode}
            fileList={fileList}
            effectFileList={effectFiles}
            editorDoc={editorDoc}
            selectedCueId={selectedCueId}
            onSelectFile={(fileSummary) => guardJsonEditorNavigation(() => selectFile(fileSummary))}
            onSelectEffectFile={(fileSummary) =>
              guardJsonEditorNavigation(() => selectEffectFile(fileSummary))
            }
            onReload={handleReload}
            onAddCue={handleAddCue}
            onAddEffect={handleAddEffect}
            onRemoveCue={removeCue}
            onRemoveEffect={removeEffect}
            onSelectCue={(cue) =>
              guardJsonEditorNavigation(() => {
                setSelectedCueId(cue?.id ?? null)
                loadCueIntoFlow(cue as EditorCueOrEffect)
              })
            }
          />

          <CueEditorRegistryPanel
            registryTab={registryTab}
            setRegistryTab={setRegistryTab}
            hasFile={hasFile}
            editorDoc={editorDoc}
            selectedCueId={selectedCueId}
            currentEffectDefinition={currentEffectDefinition}
            onVariablesChange={handleVariablesChange}
            getVariableReferences={getVariableReferences}
            onEventsChange={handleEventsChange}
            getEventReferences={getEventReferences}
            onEffectsChange={handleEffectsChange}
          />
        </Panel>
        <Separator className="w-2 shrink-0 rounded bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 transition-colors data-[resize-handle-active]:bg-blue-500 cursor-col-resize min-w-2" />
        <Panel id="center" minSize="30%" className="flex flex-col min-h-0 overflow-hidden">
          <section
            className={`flex flex-col flex-1 min-h-0 overflow-hidden bg-white dark:bg-gray-900 rounded-lg shadow-inner ${!hasFile ? 'opacity-50 pointer-events-none' : ''}`}>
            <CueMetadataForm
              filename={filename}
              group={editorDoc?.file.group ?? null}
              currentCue={currentCueDefinition}
              currentEffect={currentEffectDefinition}
              availableCueTypes={availableCueTypes}
              usedCueTypes={usedCueTypes}
              activeMode={activeMode}
              editorMode={editorMode}
              onGroupChange={updateGroupMeta}
              onCueMetadataChange={updateCueMetadata}
              onEffectMetadataChange={updateEffectMetadata}
            />

            {showJsonEditor &&
            editorMode === 'effect' &&
            selectedCueId &&
            editorDoc &&
            currentEffectDefinition ? (
              <EffectJsonEditor
                effectDefinition={currentEffectDefinition}
                editorDoc={editorDoc}
                selectedEffectId={selectedCueId}
                onSave={handleJsonEffectSave}
                onCancel={() => {
                  setShowJsonEditor(false)
                  setJsonEditorDirty(false)
                }}
                onDirtyChange={setJsonEditorDirty}
              />
            ) : showJsonEditor &&
              editorMode === 'cue' &&
              selectedCueId &&
              editorDoc &&
              currentCueDefinition ? (
              <CueJsonEditor
                cueDefinition={currentCueDefinition}
                editorDoc={editorDoc}
                selectedCueId={selectedCueId}
                availableCueTypes={availableCueTypes}
                onSave={handleJsonEditorSave}
                onCancel={() => {
                  setShowJsonEditor(false)
                  setJsonEditorDirty(false)
                }}
                onDirtyChange={setJsonEditorDirty}
              />
            ) : (
              <ActiveNodesContext.Provider value={activeNodeIds}>
                <ErrorNodesContext.Provider value={errorNodeIds}>
                  <WarningNodesContext.Provider value={warningNodeIds}>
                    <CueFlowCanvas
                      nodes={nodes}
                      edges={edges}
                      nodeTypes={nodeTypes}
                      selectedCueName={
                        editorMode === 'effect'
                          ? currentEffectDefinition?.name
                          : currentCueDefinition?.name
                      }
                      contextMenu={contextMenu}
                      paneContextMenu={paneContextMenu}
                      flowWrapperRef={flowWrapperRef}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      onSelectionChange={handleNodeSelection}
                      onNodeContextMenu={handleNodeContextMenu}
                      onEdgeContextMenu={onEdgeContextMenu}
                      onPaneClick={closeContextMenu}
                      onPaneContextMenu={handlePaneContextMenu}
                      onRemoveNode={handleRemoveNode}
                      setReactFlowInstance={setReactFlowInstance}
                      isValidConnection={isValidConnection}
                      activeMode={activeMode}
                      activeCueKind={editorMode === 'cue' ? cueKind : 'lighting'}
                      editorMode={editorMode}
                      addEventNode={addEventNode}
                      addActionNode={addActionNode}
                      addLogicNode={addLogicNode}
                      addEventRaiserNode={addEventRaiserNode}
                      addEventListenerNode={addEventListenerNode}
                      addEffectRaiserNode={addEffectRaiserNode}
                      addEffectListenerNode={addEffectListenerNode}
                      addNotesNode={addNotesNode}
                      onJsonToggle={() => setShowJsonEditor(true)}
                      onGraphPrettify={handleGraphPrettify}
                    />
                  </WarningNodesContext.Provider>
                </ErrorNodesContext.Provider>
              </ActiveNodesContext.Provider>
            )}
            <CueEditorValidationErrors errors={validationErrors} />
            <CueEditorWarnings warnings={warningMessages} />
          </section>
        </Panel>
        <Separator className="w-2 shrink-0 rounded bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 transition-colors data-[resize-handle-active]:bg-blue-500 cursor-col-resize min-w-2" />
        <Panel id="right" minSize="15%" maxSize="50%" className="overflow-hidden">
          <div className={`h-full ${!hasFile ? 'opacity-50 pointer-events-none' : ''}`}>
            <NodeSidebar
              activeMode={activeMode}
              cueKind={editorMode === 'cue' ? cueKind : 'lighting'}
              editorMode={editorMode}
              selectedNode={selectedNode}
              selectedActionHasEventParent={selectedActionHasEventParent}
              availableVariables={availableVariables}
              availableEvents={availableEvents}
              availableEffects={availableEffects}
              currentEffect={currentEffectDefinition}
              onSyncVariableValidValues={handleSyncVariableValidValues}
              addEventNode={addEventNode}
              addActionNode={addActionNode}
              addLogicNode={addLogicNode}
              addEventRaiserNode={addEventRaiserNode}
              addEventListenerNode={addEventListenerNode}
              addEffectRaiserNode={addEffectRaiserNode}
              addEffectListenerNode={addEffectListenerNode}
              addNotesNode={addNotesNode}
              updateSelectedNode={updateSelectedNode}
              updateNodeId={updateNodeId}
            />
          </div>
        </Panel>
      </Group>
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
                onClick={() => setPendingNavigation(null)}
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
