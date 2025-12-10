import React, { useCallback, useMemo, useRef, useState } from 'react';
import 'reactflow/dist/style.css';
import CueFlowCanvas from '../components/cue-editor/components/CueFlowCanvas';
import CueFileSidebar from '../components/cue-editor/components/CueFileSidebar';
import CueMetadataForm from '../components/cue-editor/components/CueMetadataForm';
import NodeSidebar from '../components/cue-editor/components/NodeSidebar';
import VariableRegistry from '../components/cue-editor/components/VariableRegistry';
import EventRegistry from '../components/cue-editor/components/EventRegistry';
import EffectRegistry from '../components/cue-editor/components/EffectRegistry';
import ParameterRegistry from '../components/cue-editor/components/ParameterRegistry';
import ActionNodeComponent from '../components/cue-editor/components/flow/ActionNode';
import EventNodeComponent from '../components/cue-editor/components/flow/EventNode';
import LogicNodeComponent from '../components/cue-editor/components/flow/LogicNode';
import EventRaiserNodeComponent from '../components/cue-editor/components/flow/EventRaiserNode';
import EventListenerNodeComponent from '../components/cue-editor/components/flow/EventListenerNode';
import EffectRaiserNodeComponent from '../components/cue-editor/components/flow/EffectRaiserNode';
import EffectListenerNodeComponent from '../components/cue-editor/components/flow/EffectListenerNode';
import NewFileModal from '../components/cue-editor/components/NewFileModal';
import ToastContainer from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useCueFiles } from '../components/cue-editor/hooks/useCueFiles';
import { useCueFlow } from '../components/cue-editor/hooks/useCueFlow';
import { updateDocumentFromFlow, updateEffectDocumentFromFlow } from '../components/cue-editor/lib/cueTransforms';
import type { NodeCueFile, EffectFile, VariableDefinition, EventDefinition, EffectReference, EffectParameterDefinition, YargEffectDefinition, AudioEffectDefinition } from '../../../photonics-dmx/cues/types/nodeCueTypes';

const CueEditor: React.FC = () => {
  const [registryTab, setRegistryTab] = useState<'variables' | 'events' | 'effects' | 'parameters'>('variables');
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const { toasts, showToast, hideToast } = useToast();
  const loadCueIntoFlowRef = useRef<(cue: any) => void>(() => {});
  const getUpdatedDocumentRef = useRef<() => NodeCueFile | EffectFile | null>(() => null);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);

  const loadCueIntoFlowProxy = useCallback((cue: any) => loadCueIntoFlowRef.current(cue), []);
  const getUpdatedDocumentProxy = useCallback(() => getUpdatedDocumentRef.current(), []);

  const {
    mode,
    activeMode,
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
    setIsDirty,
    handleModeChange,
    handleNewFile,
    handleCreateNewFile,
    updateGroupMeta,
    updateCueMetadata,
    updateEffectMetadata,
    handleAddCue,
    removeCue,
    selectFile,
    selectEffectFile,
    handleSave,
    handleDelete,
    handleImport,
    handleExport,
    refreshFiles
  } = useCueFiles({ 
    loadCueIntoFlow: loadCueIntoFlowProxy, 
    getUpdatedDocument: getUpdatedDocumentProxy,
    onSaveSuccess: (message) => showToast(message, 'success')
  });

  // Compute the current dropdown value based on editor mode
  const dropdownValue = editorDoc?.mode === 'effect' 
    ? (activeMode === 'yarg' ? 'yarg-effect' : 'audio-effect')
    : activeMode;

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
    chainDuration,
    addEventNode,
    addActionNode,
    addLogicNode,
    addEventRaiserNode,
    addEventListenerNode,
    addEffectRaiserNode,
    addEffectListenerNode,
    updateSelectedNode,
    loadCueIntoFlow,
    setReactFlowInstance,
    reactFlowInstance,
    closeContextMenu
  } = useCueFlow({ activeMode, setIsDirty });

  loadCueIntoFlowRef.current = loadCueIntoFlow;

  const getUpdatedDocument = useCallback((): NodeCueFile | EffectFile | null => {
    if (editorDoc?.mode === 'effect') {
      return updateEffectDocumentFromFlow(
        editorDoc,
        currentEffectDefinition as YargEffectDefinition | AudioEffectDefinition | null,
        nodes,
        edges,
        reactFlowInstance
      );
    } else {
      return updateDocumentFromFlow(
        editorDoc,
        currentCueDefinition,
        nodes,
        edges,
        reactFlowInstance
      );
    }
  }, [editorDoc, currentCueDefinition, currentEffectDefinition, nodes, edges, reactFlowInstance]);

  getUpdatedDocumentRef.current = getUpdatedDocument;

  const nodeTypes = useMemo(() => ({
    event: EventNodeComponent,
    action: ActionNodeComponent,
    logic: LogicNodeComponent,
    'event-raiser': EventRaiserNodeComponent,
    'event-listener': EventListenerNodeComponent,
    'effect-raiser': EffectRaiserNodeComponent,
    'effect-listener': EffectListenerNodeComponent
  }), []);

  const handleVariablesChange = useCallback((groupVars: VariableDefinition[], cueVars: VariableDefinition[]) => {
    if (!editorDoc) return;
    
    // Update group variables
    updateGroupMeta({ variables: groupVars });
    
    // Update cue variables
    if (selectedCueId) {
      updateCueMetadata({ variables: cueVars });
    }
  }, [editorDoc, selectedCueId, updateGroupMeta, updateCueMetadata]);

  const handleEventsChange = useCallback((events: EventDefinition[]) => {
    if (!editorDoc || !selectedCueId) return;

    // Update cue events
    updateCueMetadata({ events });
  }, [editorDoc, selectedCueId, updateCueMetadata]);

  const handleEffectsChange = useCallback((effects: EffectReference[]) => {
    if (!editorDoc || !selectedCueId) return;

    // Update cue effects
    updateCueMetadata({ effects });
  }, [editorDoc, selectedCueId, updateCueMetadata]);

  const handleParametersChange = useCallback((_parameters: EffectParameterDefinition[]) => {
    // TODO: Implement effect parameter persistence
    // For now, parameters are view-only. Full implementation requires
    // updateEffectMetadata function similar to updateCueMetadata
    console.warn('Effect parameter persistence not yet implemented');
  }, []);

  const getVariableReferences = useCallback((varName: string, scope: 'cue' | 'cue-group'): string[] => {
    if (!editorDoc || editorDoc.mode !== 'cue') return [];
    
    const references: string[] = [];
    const cueFile = editorDoc.file as NodeCueFile;
    const cuesToCheck = scope === 'cue' && selectedCueId 
      ? cueFile.cues.filter(c => c.id === selectedCueId)
      : cueFile.cues;

    for (const cue of cuesToCheck) {
      // Check logic nodes
      const logicNodes = cue.nodes.logic ?? [];
      for (const logicNode of logicNodes) {
        if (logicNode.logicType === 'variable' && logicNode.varName === varName) {
          references.push(`${cue.name}: Logic Node ${logicNode.id}`);
        }
        if (logicNode.logicType === 'math') {
          if (logicNode.left.source === 'variable' && logicNode.left.name === varName) {
            references.push(`${cue.name}: Math Node ${logicNode.id} (left)`);
          }
          if (logicNode.right.source === 'variable' && logicNode.right.name === varName) {
            references.push(`${cue.name}: Math Node ${logicNode.id} (right)`);
          }
          if (logicNode.assignTo === varName) {
            references.push(`${cue.name}: Math Node ${logicNode.id} (assignTo)`);
          }
        }
        if (logicNode.logicType === 'conditional') {
          if (logicNode.left.source === 'variable' && logicNode.left.name === varName) {
            references.push(`${cue.name}: Conditional Node ${logicNode.id} (left)`);
          }
          if (logicNode.right.source === 'variable' && logicNode.right.name === varName) {
            references.push(`${cue.name}: Conditional Node ${logicNode.id} (right)`);
          }
        }
      }
    }

    return references;
  }, [editorDoc, selectedCueId]);

  const getEventReferences = useCallback((eventName: string): string[] => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return [];
    
    const references: string[] = [];
    const cueFile = editorDoc.file as NodeCueFile;
    const currentCue = cueFile.cues.find(c => c.id === selectedCueId);
    if (!currentCue) return [];

    // Check event raiser nodes
    const eventRaisers = currentCue.nodes.eventRaisers ?? [];
    for (const raiser of eventRaisers) {
      if (raiser.eventName === eventName) {
        references.push(`Event Raiser: ${raiser.label ?? raiser.id}`);
      }
    }

    // Check event listener nodes
    const eventListeners = currentCue.nodes.eventListeners ?? [];
    for (const listener of eventListeners) {
      if (listener.eventName === eventName) {
        references.push(`Event Listener: ${listener.label ?? listener.id}`);
      }
    }

    return references;
  }, [editorDoc, selectedCueId]);

  const availableVariables = useMemo(() => {
    if (!editorDoc || editorDoc.mode !== 'cue') return [];
    
    const cueFile = editorDoc.file as NodeCueFile;
    const groupVars = (cueFile.group.variables ?? []).map(v => ({
      name: v.name,
      type: v.type,
      scope: 'cue-group' as const
    }));
    
    const cueVars = selectedCueId
      ? (cueFile.cues.find(c => c.id === selectedCueId)?.variables ?? []).map(v => ({
          name: v.name,
          type: v.type,
          scope: 'cue' as const
        }))
      : [];
    
    return [...groupVars, ...cueVars];
  }, [editorDoc, selectedCueId]);

  const availableEvents = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return [];
    
    const cueFile = editorDoc.file as NodeCueFile;
    const currentCue = cueFile.cues.find(c => c.id === selectedCueId);
    return (currentCue?.events ?? []).map(e => e.name);
  }, [editorDoc, selectedCueId]);

  const availableEffects = useMemo(() => {
    if (!editorDoc || !selectedCueId || editorDoc.mode !== 'cue') return [];
    
    const cueFile = editorDoc.file as NodeCueFile;
    const currentCue = cueFile.cues.find(c => c.id === selectedCueId);
    return (currentCue?.effects ?? []).map(e => ({ id: e.effectId, name: e.name }));
  }, [editorDoc, selectedCueId]);

  const fileList = mode === 'yarg' ? groupedFiles.yarg : groupedFiles.audio;
  const effectFiles = mode === 'yarg' ? groupedEffectFiles.yarg : groupedEffectFiles.audio;
  
  // Determine if we're in effect mode
  const isEffectMode = editorDoc?.mode === 'effect';
  const hasFile = !!editorDoc?.path;
  
  // Dynamic labels based on mode
  const newFileLabel = isEffectMode ? 'New Effect File' : 'New Cue File';
  const importLabel = isEffectMode ? 'Import Effect' : 'Import Cue';
  const exportLabel = isEffectMode ? 'Export Effect' : 'Export Cue';
  const deleteLabel = isEffectMode ? 'Delete Effect' : 'Delete Cue';
  
  const primaryButton = 'px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500';
  const secondaryButton = 'px-3 py-1 text-xs rounded bg-gray-200 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-700';
  const dangerButton = 'px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-500';

  return (
    <div className="p-4 space-y-4 text-sm h-full">
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="font-semibold text-base">Mode</label>
          <select
            value={dropdownValue}
            onChange={event => handleModeChange(event.target.value as any)}
            className="rounded border border-gray-300 px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-600"
          >
            <optgroup label="Cues">
              <option value="yarg">YARG Node Cues</option>
              <option value="audio">Audio Node Cues</option>
            </optgroup>
            <optgroup label="Effects">
              <option value="yarg-effect">YARG Effects</option>
              <option value="audio-effect">Audio Effects</option>
            </optgroup>
          </select>
        </div>
        <div className="flex gap-2">
          <button className={secondaryButton} onClick={() => setShowNewFileModal(true)}>{newFileLabel}</button>
          <button className={`${primaryButton} ${!editorDoc ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={handleSave} disabled={!editorDoc}>Save</button>
          <button className={secondaryButton} onClick={handleImport}>{importLabel}</button>
          <button className={`${secondaryButton} ${!hasFile ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={handleExport} disabled={!hasFile}>{exportLabel}</button>
          <button className={`${dangerButton} ${!hasFile ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={handleDelete} disabled={!hasFile}>{deleteLabel}</button>
        </div>
      </div>

      <div className="grid grid-cols-[260px_1fr_320px] gap-4 h-[calc(100vh-220px)]">
        <div className="flex flex-col gap-4 overflow-hidden">
          <CueFileSidebar
            mode={mode}
            fileList={fileList}
            effectFileList={effectFiles}
            editorDoc={editorDoc}
            selectedCueId={selectedCueId}
            onSelectFile={selectFile}
            onSelectEffectFile={selectEffectFile}
            onReload={refreshFiles}
            onNewFile={handleNewFile}
            onAddCue={handleAddCue}
            onRemoveCue={removeCue}
            onSelectCue={cue => {
              setSelectedCueId(cue?.id ?? null);
              loadCueIntoFlow(cue as any);
            }}
          />
          
          {/* Tabbed Registry Interface */}
          <div className={`bg-white dark:bg-gray-900 rounded-lg shadow-inner overflow-hidden flex flex-col ${!hasFile ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium ${
                  registryTab === 'variables'
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border-b-2 border-blue-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => setRegistryTab('variables')}
              >
                Variables
              </button>
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium ${
                  registryTab === 'events'
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 border-b-2 border-purple-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => setRegistryTab('events')}
              >
                Events
              </button>
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium ${
                  registryTab === 'effects'
                    ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-300 border-b-2 border-cyan-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => setRegistryTab('effects')}
              >
                Effects
              </button>
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium ${
                  registryTab === 'parameters'
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 border-b-2 border-purple-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => setRegistryTab('parameters')}
              >
                Parameters
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {registryTab === 'variables' ? (
                <VariableRegistry
                  editorDoc={editorDoc}
                  selectedCueId={selectedCueId}
                  onVariablesChange={handleVariablesChange}
                  getVariableReferences={getVariableReferences}
                />
              ) : registryTab === 'events' ? (
                <EventRegistry
                  editorDoc={editorDoc}
                  selectedCueId={selectedCueId}
                  onEventsChange={handleEventsChange}
                  getEventReferences={getEventReferences}
                />
              ) : registryTab === 'effects' ? (
                <EffectRegistry
                  editorDoc={editorDoc}
                  selectedCueId={selectedCueId}
                  onEffectsChange={handleEffectsChange}
                />
              ) : (
                <ParameterRegistry
                  editorDoc={editorDoc}
                  selectedEffectId={selectedCueId}
                  onParametersChange={handleParametersChange}
                />
              )}
            </div>
          </div>
        </div>

        <section className={`flex flex-col bg-white dark:bg-gray-900 rounded-lg shadow-inner ${!hasFile ? 'opacity-50 pointer-events-none' : ''}`}>
          <CueMetadataForm
            filename={filename}
            group={editorDoc?.file.group ?? null}
            currentCue={currentCueDefinition}
            currentEffect={currentEffectDefinition}
            availableCueTypes={availableCueTypes}
            activeMode={activeMode}
            editorMode={editorDoc?.mode ?? 'cue'}
            onGroupChange={updateGroupMeta}
            onCueMetadataChange={updateCueMetadata}
            onEffectMetadataChange={updateEffectMetadata}
          />

          <CueFlowCanvas
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            chainDuration={chainDuration}
            selectedCueName={currentCueDefinition?.name}
            contextMenu={contextMenu}
          flowWrapperRef={flowWrapperRef}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={handleNodeSelection}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onPaneClick={closeContextMenu}
            onRemoveNode={handleRemoveNode}
            setReactFlowInstance={setReactFlowInstance}
            isValidConnection={isValidConnection}
          />
          {validationErrors.length > 0 && (
            <div className="p-3 text-xs text-red-600 dark:text-red-300 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40">
              <p className="font-semibold mb-1">Validation errors</p>
              <ul className="list-disc list-inside space-y-1">
                {validationErrors.map(error => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className={!hasFile ? 'opacity-50 pointer-events-none' : ''}>
          <NodeSidebar
            activeMode={activeMode}
            editorMode={editorDoc?.mode ?? 'cue'}
            selectedNode={selectedNode}
            selectedActionHasEventParent={selectedActionHasEventParent}
            availableVariables={availableVariables}
            availableEvents={availableEvents}
            availableEffects={availableEffects}
            addEventNode={addEventNode}
            addActionNode={addActionNode}
            addLogicNode={addLogicNode}
            addEventRaiserNode={addEventRaiserNode}
            addEventListenerNode={addEventListenerNode}
            addEffectRaiserNode={addEffectRaiserNode}
            addEffectListenerNode={addEffectListenerNode}
            updateSelectedNode={updateSelectedNode}
          />
        </div>
      </div>
      <div className="text-xs text-gray-500 flex justify-between">
        <span>{editorDoc?.path ?? 'Unsaved file'}</span>
        <span>{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
      </div>

      <NewFileModal
        isOpen={showNewFileModal}
        isEffectMode={isEffectMode}
        mode={mode}
        onCancel={() => setShowNewFileModal(false)}
        onSave={(metadata) => {
          handleCreateNewFile(metadata);
          setShowNewFileModal(false);
        }}
      />

      <ToastContainer toasts={toasts} onDismiss={hideToast} />
    </div>
  );
};

export default CueEditor;

