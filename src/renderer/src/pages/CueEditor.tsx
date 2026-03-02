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
import ActionNodeComponent from '../components/cue-editor/components/flow/ActionNode'
import EventNodeComponent from '../components/cue-editor/components/flow/EventNode'
import LogicNodeComponent from '../components/cue-editor/components/flow/LogicNode'
import EventRaiserNodeComponent from '../components/cue-editor/components/flow/EventRaiserNode'
import EventListenerNodeComponent from '../components/cue-editor/components/flow/EventListenerNode'
import EffectRaiserNodeComponent from '../components/cue-editor/components/flow/EffectRaiserNode'
import EffectListenerNodeComponent from '../components/cue-editor/components/flow/EffectListenerNode'
import NotesNodeComponent from '../components/cue-editor/components/flow/NotesNode'
import NewFileModal from '../components/cue-editor/components/NewFileModal'
import ToastContainer from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { useCueFiles } from '../components/cue-editor/hooks/useCueFiles'
import { useCueFlow } from '../components/cue-editor/hooks/useCueFlow'
import { useActiveNodes } from '../components/cue-editor/hooks/useActiveNodes'
import { ActiveNodesContext } from '../components/cue-editor/context/ActiveNodesContext'
import {
  updateDocumentFromFlow,
  updateEffectDocumentFromFlow,
} from '../components/cue-editor/lib/cueTransforms'
import type {
  NodeCueFile,
  EffectFile,
  VariableDefinition,
  EventDefinition,
  EffectReference,
  YargEffectDefinition,
  AudioEffectDefinition,
  EffectDefinition,
  ActionNode,
  LogicNode,
  EffectRaiserNode,
  ValueSource,
  YargNodeCueDefinition,
  AudioNodeCueDefinition,
} from '../../../photonics-dmx/cues/types/nodeCueTypes'

type EditorCueOrEffect =
  | YargNodeCueDefinition
  | AudioNodeCueDefinition
  | YargEffectDefinition
  | AudioEffectDefinition
  | null
import { readEffectFile, runNodeScript, showItemInFolder } from '../ipcApi'

const SIDEBAR_LAYOUT_KEY = 'photonics.nodeCueEditor.sidebarLayout'
// Original grid was minmax(260px,300px) | 2fr | minmax(260px,400px) — approximate as %
const DEFAULT_SIDEBAR_LAYOUT: Layout = { left: 25, center: 42, right: 33 }

function getStoredSidebarLayout(): Layout | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(SIDEBAR_LAYOUT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Layout
    if (!parsed || typeof parsed !== 'object') return null
    const left = Number(parsed.left)
    const center = Number(parsed.center)
    const right = Number(parsed.right)
    const sum = left + center + right
    if (
      Number.isNaN(left) ||
      Number.isNaN(center) ||
      Number.isNaN(right) ||
      left < 15 ||
      right < 15 ||
      center < 25 ||
      sum < 99 ||
      sum > 101
    ) {
      return null
    }
    return { left, center, right }
  } catch {
    return null
  }
}

function setStoredSidebarLayout(layout: Layout): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    // Storage might be unavailable
  }
}

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
  const [loadedEffectDefinitions, setLoadedEffectDefinitions] = useState<
    Map<string, EffectDefinition>
  >(new Map())
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
  } = useCueFiles({
    loadCueIntoFlow: loadCueIntoFlowProxy,
    getUpdatedDocument: getUpdatedDocumentProxy,
    onSaveSuccess: (message) => showToast(message, 'success'),
    onError: (message) => showToast(message, 'error'),
  })

  const cueMode = mode
  const isEffectMode = editorMode === 'effect'

  const handleCueModeChange = useCallback(
    (mode: 'yarg' | 'audio') => {
      handleModeChange(isEffectMode ? (mode === 'yarg' ? 'yarg-effect' : 'audio-effect') : mode)
    },
    [handleModeChange, isEffectMode],
  )
  const handleEffectToggle = useCallback(
    (isEffect: boolean) => {
      handleModeChange(
        isEffect ? (activeMode === 'yarg' ? 'yarg-effect' : 'audio-effect') : activeMode,
      )
    },
    [handleModeChange, activeMode],
  )

  const {
    nodes,
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
    loadCueIntoFlow,
    setReactFlowInstance,
    reactFlowInstance,
    closeContextMenu,
    handlePaneContextMenu,
  } = useCueFlow({
    activeMode,
    setIsDirty,
    flowWrapperRef,
    effectDefinitions: loadedEffectDefinitions,
  })

  useEffect(() => {
    loadCueIntoFlowRef.current = loadCueIntoFlow
  }, [loadCueIntoFlow])

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

  const usedCueTypes = useMemo((): Set<string> => {
    if (!editorDoc || editorDoc.mode !== 'cue' || activeMode !== 'yarg') return new Set()
    const cueFile = editorDoc.file as NodeCueFile
    return new Set(
      cueFile.cues
        .filter((cue) => cue.id !== selectedCueId)
        .map((cue) => (cue as YargNodeCueDefinition).cueType)
        .filter(Boolean),
    )
  }, [editorDoc, selectedCueId, activeMode])

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
    (varName: string, _scope: 'cue' | 'cue-group'): string[] => {
      if (!editorDoc) return []

      const references: string[] = []
      const addReference = (nodeType: string, nodeId: string, label?: string, detail?: string) => {
        const labelSuffix = label ? ` "${label}"` : ''
        const detailSuffix = detail ? ` (${detail})` : ''
        references.push(`${nodeType} ${nodeId}${labelSuffix}${detailSuffix}`)
      }
      const checkValueSource = (
        source: ValueSource | undefined,
        nodeType: string,
        nodeId: string,
        nodeLabel: string | undefined,
        detail: string,
      ) => {
        if (source?.source === 'variable' && source.name === varName) {
          addReference(nodeType, nodeId, nodeLabel, detail)
        }
      }
      const checkVarName = (
        name: string | undefined,
        nodeType: string,
        nodeId: string,
        nodeLabel: string | undefined,
        detail: string,
      ) => {
        if (name === varName) {
          addReference(nodeType, nodeId, nodeLabel, detail)
        }
      }

      for (const node of nodes) {
        const nodeId = node.id
        const nodeLabel = typeof node.data.label === 'string' ? node.data.label : undefined
        if (node.data.kind === 'action') {
          const action = node.data.payload as ActionNode
          const nodeType = 'Action Node'
          checkValueSource(action.target?.groups, nodeType, nodeId, nodeLabel, 'target.groups')
          checkValueSource(action.target?.filter, nodeType, nodeId, nodeLabel, 'target.filter')
          checkValueSource(action.color?.name, nodeType, nodeId, nodeLabel, 'color.name')
          checkValueSource(
            action.color?.brightness,
            nodeType,
            nodeId,
            nodeLabel,
            'color.brightness',
          )
          checkValueSource(action.color?.blendMode, nodeType, nodeId, nodeLabel, 'color.blendMode')
          checkValueSource(action.color?.opacity, nodeType, nodeId, nodeLabel, 'color.opacity')
          checkValueSource(action.layer, nodeType, nodeId, nodeLabel, 'layer')
          if (action.timing) {
            checkValueSource(
              action.timing.waitForTime,
              nodeType,
              nodeId,
              nodeLabel,
              'timing.waitForTime',
            )
            checkValueSource(
              action.timing.waitForConditionCount,
              nodeType,
              nodeId,
              nodeLabel,
              'timing.waitForConditionCount',
            )
            checkValueSource(action.timing.duration, nodeType, nodeId, nodeLabel, 'timing.duration')
            checkValueSource(
              action.timing.waitUntilTime,
              nodeType,
              nodeId,
              nodeLabel,
              'timing.waitUntilTime',
            )
            checkValueSource(
              action.timing.waitUntilConditionCount,
              nodeType,
              nodeId,
              nodeLabel,
              'timing.waitUntilConditionCount',
            )
            checkValueSource(action.timing.level, nodeType, nodeId, nodeLabel, 'timing.level')
          }
        }

        if (node.data.kind === 'logic') {
          const logicNode = node.data.payload as LogicNode
          const nodeType = `Logic Node (${logicNode.logicType})`
          switch (logicNode.logicType) {
            case 'variable':
              checkVarName(logicNode.varName, nodeType, nodeId, nodeLabel, 'varName')
              checkValueSource(logicNode.value, nodeType, nodeId, nodeLabel, 'value')
              break
            case 'math':
              checkValueSource(logicNode.left, nodeType, nodeId, nodeLabel, 'left')
              checkValueSource(logicNode.right, nodeType, nodeId, nodeLabel, 'right')
              checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
              break
            case 'conditional':
              checkValueSource(logicNode.left, nodeType, nodeId, nodeLabel, 'left')
              checkValueSource(logicNode.right, nodeType, nodeId, nodeLabel, 'right')
              break
            case 'cue-data':
            case 'config-data':
              checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
              break
            case 'lights-from-index':
              checkVarName(logicNode.sourceVariable, nodeType, nodeId, nodeLabel, 'sourceVariable')
              checkValueSource(logicNode.index, nodeType, nodeId, nodeLabel, 'index')
              checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
              break
            case 'array-length':
            case 'reverse-lights':
            case 'create-pairs':
              checkVarName(logicNode.sourceVariable, nodeType, nodeId, nodeLabel, 'sourceVariable')
              checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
              break
            case 'concat-lights':
              for (const sourceVar of logicNode.sourceVariables ?? []) {
                checkVarName(sourceVar, nodeType, nodeId, nodeLabel, 'sourceVariables')
              }
              checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
              break
            case 'delay':
              checkValueSource(logicNode.delayTime, nodeType, nodeId, nodeLabel, 'delayTime')
              break
            case 'debugger':
              checkValueSource(logicNode.message, nodeType, nodeId, nodeLabel, 'message')
              for (const loggedVar of logicNode.variablesToLog ?? []) {
                checkVarName(loggedVar, nodeType, nodeId, nodeLabel, 'variablesToLog')
              }
              break
          }
        }

        if (node.data.kind === 'effect-raiser') {
          const raiser = node.data.payload as EffectRaiserNode
          const nodeType = 'Effect Raiser Node'
          const parameterValues = raiser.parameterValues ?? {}
          for (const [paramName, value] of Object.entries(parameterValues)) {
            checkValueSource(value, nodeType, nodeId, nodeLabel, `parameterValues.${paramName}`)
          }
        }
      }

      return references
    },
    [editorDoc, nodes],
  )

  const getEventReferences = useCallback(
    (eventName: string): string[] => {
      if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return []

      const references: string[] = []
      const cueFile = editorDoc.file as NodeCueFile
      const currentCue = cueFile.cues.find((c) => c.id === selectedCueId)
      if (!currentCue) return []

      // Check event raiser nodes
      const eventRaisers = currentCue.nodes.eventRaisers ?? []
      for (const raiser of eventRaisers) {
        if (raiser.eventName === eventName) {
          references.push(`Event Raiser: ${raiser.label ?? raiser.id}`)
        }
      }

      // Check event listener nodes
      const eventListeners = currentCue.nodes.eventListeners ?? []
      for (const listener of eventListeners) {
        if (listener.eventName === eventName) {
          references.push(`Event Listener: ${listener.label ?? listener.id}`)
        }
      }

      return references
    },
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
      }))
      return effectVars
    }

    // Cue mode: combine group and cue variables
    const cueFile = editorDoc.file as NodeCueFile
    const groupVars = (cueFile.group.variables ?? []).map((v) => ({
      name: v.name,
      type: v.type,
      scope: 'cue-group' as const,
    }))

    const cueVars = selectedCueId
      ? (cueFile.cues.find((c) => c.id === selectedCueId)?.variables ?? []).map((v) => ({
          name: v.name,
          type: v.type,
          scope: 'cue' as const,
        }))
      : []

    return [...groupVars, ...cueVars]
  }, [editorDoc, selectedCueId, currentEffectDefinition])

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

  // Load effect definitions when effect references change
  useEffect(() => {
    if (!editorDoc || editorDoc.mode !== 'cue' || !selectedCueId) return

    const cueFile = editorDoc.file as NodeCueFile
    const currentCue = cueFile.cues.find((c) => c.id === selectedCueId)
    const effectRefs = currentCue?.effects ?? []

    // Load each effect definition
    const loadEffects = async () => {
      const newDefinitions = new Map<string, EffectDefinition>()

      for (const effectRef of effectRefs) {
        try {
          // Find the effect file
          const effectFile = mode === 'yarg' ? groupedEffectFiles.yarg : groupedEffectFiles.audio
          const fileEntry = effectFile.find((f) => f.groupId === effectRef.effectFileId)

          if (fileEntry) {
            const effectFileData = (await readEffectFile(fileEntry.path)) as EffectFile
            const effectDef = effectFileData.effects.find((e) => e.id === effectRef.effectId)
            if (effectDef) {
              newDefinitions.set(effectRef.effectId, effectDef)
            }
          }
        } catch (error) {
          console.warn(`Failed to load effect ${effectRef.effectId}:`, error)
        }
      }

      setLoadedEffectDefinitions(newDefinitions)
    }

    loadEffects()
  }, [editorDoc, selectedCueId, mode, groupedEffectFiles])

  const handleJsonEditorSave = useCallback(
    (updatedCue: YargNodeCueDefinition | AudioNodeCueDefinition) => {
      if (!editorDoc || editorDoc.mode !== 'cue' || !selectedCueId) return
      const file = editorDoc.file as NodeCueFile
      const updatedFile: NodeCueFile = {
        ...file,
        cues: file.cues.map((c) => (c.id === selectedCueId ? updatedCue : c)),
      }
      setEditorDoc({ mode: 'cue', file: updatedFile, path: editorDoc.path })
      loadCueIntoFlow(updatedCue)
      setShowJsonEditor(false)
      setJsonEditorDirty(false)
      setIsDirty(true)
    },
    [editorDoc, selectedCueId, loadCueIntoFlow, setEditorDoc, setIsDirty],
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
      loadCueIntoFlow(updatedEffect)
      setShowJsonEditor(false)
      setJsonEditorDirty(false)
      setIsDirty(true)
    },
    [editorDoc, selectedCueId, loadCueIntoFlow, setEditorDoc, setIsDirty],
  )

  const handleGraphPrettify = useCallback(async () => {
    if (!editorDoc?.path || !selectedCueId) return
    if (isDirty) await handleSave()
    await runNodeScript({
      scriptName: 'node-graph-prettier.mjs',
      args: ['--file', editorDoc.path, '--id', selectedCueId],
    })
    await handleReload()
  }, [editorDoc, selectedCueId, isDirty, handleSave, handleReload])

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

  const handleDiscardNavigation = useCallback(() => {
    if (pendingNavigation) {
      pendingNavigation()
      setPendingNavigation(null)
      setShowJsonEditor(false)
      setJsonEditorDirty(false)
      setIsDirty(false)
    }
  }, [pendingNavigation, setIsDirty])

  const fileList = mode === 'yarg' ? groupedFiles.yarg : groupedFiles.audio
  const effectFiles = mode === 'yarg' ? groupedEffectFiles.yarg : groupedEffectFiles.audio

  const hasFile = !!editorDoc?.path

  const newFileLabel = isEffectMode ? 'New Effect File' : 'New Cue File'
  const importLabel = isEffectMode ? 'Import Effect' : 'Import Cue'
  const exportLabel = isEffectMode ? 'Export Effect' : 'Export Cue'
  const deleteLabel = isEffectMode ? 'Delete Effect File' : 'Delete Cue File'

  return (
    <div className="p-4 space-y-4 text-sm h-full flex flex-col">
      <CueEditorToolbar
        cueMode={cueMode}
        isEffectMode={isEffectMode}
        onCueModeChange={(m) => guardJsonEditorNavigation(() => handleCueModeChange(m))}
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
                onSave={handleJsonEditorSave}
                onCancel={() => {
                  setShowJsonEditor(false)
                  setJsonEditorDirty(false)
                }}
                onDirtyChange={setJsonEditorDirty}
              />
            ) : (
              <ActiveNodesContext.Provider value={activeNodeIds}>
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
              </ActiveNodesContext.Provider>
            )}
            <CueEditorValidationErrors errors={validationErrors} />
          </section>
        </Panel>
        <Separator className="w-2 shrink-0 rounded bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 transition-colors data-[resize-handle-active]:bg-blue-500 cursor-col-resize min-w-2" />
        <Panel id="right" minSize="15%" maxSize="50%" className="overflow-hidden">
          <div className={`h-full ${!hasFile ? 'opacity-50 pointer-events-none' : ''}`}>
            <NodeSidebar
              activeMode={activeMode}
              editorMode={editorMode}
              selectedNode={selectedNode}
              selectedActionHasEventParent={selectedActionHasEventParent}
              availableVariables={availableVariables}
              availableEvents={availableEvents}
              availableEffects={availableEffects}
              currentEffect={currentEffectDefinition}
              addEventNode={addEventNode}
              addActionNode={addActionNode}
              addLogicNode={addLogicNode}
              addEventRaiserNode={addEventRaiserNode}
              addEventListenerNode={addEventListenerNode}
              addEffectRaiserNode={addEffectRaiserNode}
              addEffectListenerNode={addEffectListenerNode}
              addNotesNode={addNotesNode}
              updateSelectedNode={updateSelectedNode}
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
        onCancel={() => setShowNewFileModal(false)}
        onSave={(metadata) => {
          handleCreateNewFile(metadata)
          setShowNewFileModal(false)
        }}
      />

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
