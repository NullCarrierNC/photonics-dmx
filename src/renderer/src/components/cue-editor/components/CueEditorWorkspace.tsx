import React from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Layout } from 'react-resizable-panels'
import type { NodeTypes } from 'reactflow'
import CueFlowCanvas from './CueFlowCanvas'
import CueJsonEditor from './CueJsonEditor'
import EffectJsonEditor from './EffectJsonEditor'
import CueFileSidebar from './CueFileSidebar'
import CueMetadataForm from './CueMetadataForm'
import NodeSidebar from './NodeSidebar'
import CueEditorRegistryPanel from './CueEditorRegistryPanel'
import CueEditorValidationErrors from './CueEditorValidationErrors'
import CueEditorWarnings from './CueEditorWarnings'
import { ActiveNodesContext } from '../context/ActiveNodesContext'
import { ErrorNodesContext } from '../context/ErrorNodesContext'
import { WarningNodesContext } from '../context/WarningNodesContext'
import { setStoredSidebarLayout } from '../lib/sidebarLayout'
import type { useCueFlow } from '../hooks/useCueFlow'
import type { useCueRegistryPanel } from '../hooks/useCueRegistryPanel'
import type { useCueJsonEditor } from '../hooks/useCueJsonEditor'
import type { EditorDocument } from '../lib/types'
import type {
  NodeCueKind,
  NodeCueMode,
  NetNodeCueDefinition,
  AudioNodeCueDefinition,
  YargEffectDefinition,
  AudioEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

type EditorCueOrEffect =
  | NetNodeCueDefinition
  | AudioNodeCueDefinition
  | YargEffectDefinition
  | AudioEffectDefinition
  | null

/** The document, file lists and metadata callbacks the workspace panels read and write. */
export interface WorkspaceFiles {
  mode: NodeCueMode
  cueKind: NodeCueKind
  isEffectMode: boolean
  editorMode: 'cue' | 'effect'
  activeMode: NodeCueMode
  editorDoc: EditorDocument | null
  selectedCueId: string | null
  filename: string
  fileList: Parameters<typeof CueFileSidebar>[0]['fileList']
  effectFiles: Parameters<typeof CueFileSidebar>[0]['effectFileList']
  availableCueTypes: Parameters<typeof CueMetadataForm>[0]['availableCueTypes']
  usedCueTypes: Set<string>
  validationErrors: Parameters<typeof CueEditorValidationErrors>[0]['errors']
  currentCueDefinition: NetNodeCueDefinition | AudioNodeCueDefinition | null
  currentEffectDefinition: YargEffectDefinition | AudioEffectDefinition | null
  hasFile: boolean
  selectFile: Parameters<typeof CueFileSidebar>[0]['onSelectFile']
  selectEffectFile: Parameters<typeof CueFileSidebar>[0]['onSelectEffectFile']
  handleReload: () => void
  handleAddCue: Parameters<typeof CueFileSidebar>[0]['onAddCue']
  handleAddEffect: Parameters<typeof CueFileSidebar>[0]['onAddEffect']
  removeCue: Parameters<typeof CueFileSidebar>[0]['onRemoveCue']
  removeEffect: Parameters<typeof CueFileSidebar>[0]['onRemoveEffect']
  setSelectedCueId: (id: string | null) => void
  updateGroupMeta: Parameters<typeof CueMetadataForm>[0]['onGroupChange']
  updateCueMetadata: Parameters<typeof CueMetadataForm>[0]['onCueMetadataChange']
  updateEffectMetadata: Parameters<typeof CueMetadataForm>[0]['onEffectMetadataChange']
}

export interface CueEditorWorkspaceProps {
  sidebarLayout: Layout
  files: WorkspaceFiles
  flow: ReturnType<typeof useCueFlow>
  registry: ReturnType<typeof useCueRegistryPanel>
  json: ReturnType<typeof useCueJsonEditor>
  nodeTypes: NodeTypes
  flowWrapperRef: React.MutableRefObject<HTMLDivElement | null>
  activeNodeIds: Set<string>
  errorNodeIds: Set<string>
  warningNodeIds: Set<string>
  warningMessages: Parameters<typeof CueEditorWarnings>[0]['warnings']
  /** Run an action, prompting first when the editor holds unsaved work. */
  guardJsonEditorNavigation: (action: () => void) => void
}

/**
 * The cue editor's three-panel workspace: the file and registry sidebar, the centre pane holding
 * the metadata form and either a JSON editor or the flow canvas, and the node sidebar.
 *
 * Presentational: every value and callback arrives through props, grouped by the hook that owns
 * it, so the page above stays composition only.
 */
const CueEditorWorkspace: React.FC<CueEditorWorkspaceProps> = ({
  sidebarLayout,
  files,
  flow,
  registry,
  json,
  nodeTypes,
  flowWrapperRef,
  activeNodeIds,
  errorNodeIds,
  warningNodeIds,
  warningMessages,
  guardJsonEditorNavigation,
}) => {
  const {
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
  } = files
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
    updateNodeId,
    loadCueIntoFlow,
    setReactFlowInstance,
    closeContextMenu,
    handlePaneContextMenu,
  } = flow
  const {
    registryTab,
    setRegistryTab,
    handleVariablesChange,
    handleSyncVariableValidValues,
    handleEventsChange,
    handleEffectsChange,
    getVariableReferences,
    getEventReferences,
    availableVariables,
    availableEvents,
    availableEffects,
  } = registry
  const {
    showJsonEditor,
    setShowJsonEditor,
    setJsonEditorDirty,
    handleJsonEditorSave,
    handleJsonEffectSave,
    handleGraphPrettify,
  } = json

  return (
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
  )
}

export default CueEditorWorkspace
