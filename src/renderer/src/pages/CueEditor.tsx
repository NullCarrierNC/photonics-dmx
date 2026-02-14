import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import 'reactflow/dist/style.css';
import CueFlowCanvas from '../components/cue-editor/components/CueFlowCanvas';
import CueFileSidebar from '../components/cue-editor/components/CueFileSidebar';
import CueMetadataForm from '../components/cue-editor/components/CueMetadataForm';
import NodeSidebar from '../components/cue-editor/components/NodeSidebar';
import VariableRegistry from '../components/cue-editor/components/VariableRegistry';
import EventRegistry from '../components/cue-editor/components/EventRegistry';
import EffectRegistry from '../components/cue-editor/components/EffectRegistry';
import ActionNodeComponent from '../components/cue-editor/components/flow/ActionNode';
import EventNodeComponent from '../components/cue-editor/components/flow/EventNode';
import LogicNodeComponent from '../components/cue-editor/components/flow/LogicNode';
import EventRaiserNodeComponent from '../components/cue-editor/components/flow/EventRaiserNode';
import EventListenerNodeComponent from '../components/cue-editor/components/flow/EventListenerNode';
import EffectRaiserNodeComponent from '../components/cue-editor/components/flow/EffectRaiserNode';
import EffectListenerNodeComponent from '../components/cue-editor/components/flow/EffectListenerNode';
import NotesNodeComponent from '../components/cue-editor/components/flow/NotesNode';
import NewFileModal from '../components/cue-editor/components/NewFileModal';
import ToastContainer from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useCueFiles } from '../components/cue-editor/hooks/useCueFiles';
import { useCueFlow } from '../components/cue-editor/hooks/useCueFlow';
import { updateDocumentFromFlow, updateEffectDocumentFromFlow } from '../components/cue-editor/lib/cueTransforms';
import type { NodeCueFile, EffectFile, VariableDefinition, EventDefinition, EffectReference, YargEffectDefinition, AudioEffectDefinition, EffectDefinition, ActionNode, LogicNode, EffectRaiserNode, ValueSource } from '../../../photonics-dmx/cues/types/nodeCueTypes';

const CueEditor: React.FC = () => {
  const [registryTab, setRegistryTab] = useState<'variables' | 'events' | 'effects'>('variables');
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [loadedEffectDefinitions, setLoadedEffectDefinitions] = useState<Map<string, EffectDefinition>>(new Map());
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
    handleReload
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
    paneContextMenu,
    chainDuration,
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
    handlePaneContextMenu
  } = useCueFlow({ activeMode, setIsDirty, flowWrapperRef, effectDefinitions: loadedEffectDefinitions });

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
    'effect-listener': EffectListenerNodeComponent,
    notes: NotesNodeComponent
  }), []);

  const handleVariablesChange = useCallback((groupVars: VariableDefinition[], cueVars: VariableDefinition[]) => {
    if (!editorDoc) return;
    
    if (editorDoc.mode === 'effect') {
      // In effect mode, cueVars are actually effect variables
      updateEffectMetadata({ variables: cueVars });
    } else {
      // In cue mode, update both group and cue variables
      updateGroupMeta({ variables: groupVars });
      
      if (selectedCueId) {
        updateCueMetadata({ variables: cueVars });
      }
    }
  }, [editorDoc, selectedCueId, updateGroupMeta, updateCueMetadata, updateEffectMetadata]);

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

  const getVariableReferences = useCallback((varName: string, _scope: 'cue' | 'cue-group'): string[] => {
    if (!editorDoc) return [];

    const references: string[] = [];
    const addReference = (nodeType: string, nodeId: string, label?: string, detail?: string) => {
      const labelSuffix = label ? ` "${label}"` : '';
      const detailSuffix = detail ? ` (${detail})` : '';
      references.push(`${nodeType} ${nodeId}${labelSuffix}${detailSuffix}`);
    };
    const checkValueSource = (
      source: ValueSource | undefined,
      nodeType: string,
      nodeId: string,
      nodeLabel: string | undefined,
      detail: string
    ) => {
      if (source?.source === 'variable' && source.name === varName) {
        addReference(nodeType, nodeId, nodeLabel, detail);
      }
    };
    const checkVarName = (
      name: string | undefined,
      nodeType: string,
      nodeId: string,
      nodeLabel: string | undefined,
      detail: string
    ) => {
      if (name === varName) {
        addReference(nodeType, nodeId, nodeLabel, detail);
      }
    };

    for (const node of nodes) {
      const nodeId = node.id;
      const nodeLabel = typeof node.data.label === 'string' ? node.data.label : undefined;
      if (node.data.kind === 'action') {
        const action = node.data.payload as ActionNode;
        const nodeType = 'Action Node';
        checkValueSource(action.target?.groups, nodeType, nodeId, nodeLabel, 'target.groups');
        checkValueSource(action.target?.filter, nodeType, nodeId, nodeLabel, 'target.filter');
        checkValueSource(action.color?.name, nodeType, nodeId, nodeLabel, 'color.name');
        checkValueSource(action.color?.brightness, nodeType, nodeId, nodeLabel, 'color.brightness');
        checkValueSource(action.color?.blendMode, nodeType, nodeId, nodeLabel, 'color.blendMode');
        checkValueSource(action.color?.opacity, nodeType, nodeId, nodeLabel, 'color.opacity');
        checkValueSource(action.layer, nodeType, nodeId, nodeLabel, 'layer');
        if (action.timing) {
          checkValueSource(action.timing.waitForTime, nodeType, nodeId, nodeLabel, 'timing.waitForTime');
          checkValueSource(action.timing.waitForConditionCount, nodeType, nodeId, nodeLabel, 'timing.waitForConditionCount');
          checkValueSource(action.timing.duration, nodeType, nodeId, nodeLabel, 'timing.duration');
          checkValueSource(action.timing.waitUntilTime, nodeType, nodeId, nodeLabel, 'timing.waitUntilTime');
          checkValueSource(action.timing.waitUntilConditionCount, nodeType, nodeId, nodeLabel, 'timing.waitUntilConditionCount');
          checkValueSource(action.timing.level, nodeType, nodeId, nodeLabel, 'timing.level');
        }
      }

      if (node.data.kind === 'logic') {
        const logicNode = node.data.payload as LogicNode;
        const nodeType = `Logic Node (${logicNode.logicType})`;
        switch (logicNode.logicType) {
          case 'variable':
            checkVarName(logicNode.varName, nodeType, nodeId, nodeLabel, 'varName');
            checkValueSource(logicNode.value, nodeType, nodeId, nodeLabel, 'value');
            break;
          case 'math':
            checkValueSource(logicNode.left, nodeType, nodeId, nodeLabel, 'left');
            checkValueSource(logicNode.right, nodeType, nodeId, nodeLabel, 'right');
            checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo');
            break;
          case 'conditional':
            checkValueSource(logicNode.left, nodeType, nodeId, nodeLabel, 'left');
            checkValueSource(logicNode.right, nodeType, nodeId, nodeLabel, 'right');
            break;
          case 'cue-data':
          case 'config-data':
            checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo');
            break;
          case 'lights-from-index':
            checkVarName(logicNode.sourceVariable, nodeType, nodeId, nodeLabel, 'sourceVariable');
            checkValueSource(logicNode.index, nodeType, nodeId, nodeLabel, 'index');
            checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo');
            break;
          case 'array-length':
          case 'reverse-lights':
          case 'create-pairs':
            checkVarName(logicNode.sourceVariable, nodeType, nodeId, nodeLabel, 'sourceVariable');
            checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo');
            break;
          case 'concat-lights':
            for (const sourceVar of logicNode.sourceVariables ?? []) {
              checkVarName(sourceVar, nodeType, nodeId, nodeLabel, 'sourceVariables');
            }
            checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo');
            break;
          case 'delay':
            checkValueSource(logicNode.delayTime, nodeType, nodeId, nodeLabel, 'delayTime');
            break;
          case 'debugger':
            checkValueSource(logicNode.message, nodeType, nodeId, nodeLabel, 'message');
            for (const loggedVar of logicNode.variablesToLog ?? []) {
              checkVarName(loggedVar, nodeType, nodeId, nodeLabel, 'variablesToLog');
            }
            break;
        }
      }

      if (node.data.kind === 'effect-raiser') {
        const raiser = node.data.payload as EffectRaiserNode;
        const nodeType = 'Effect Raiser Node';
        const parameterValues = raiser.parameterValues ?? {};
        for (const [paramName, value] of Object.entries(parameterValues)) {
          checkValueSource(value, nodeType, nodeId, nodeLabel, `parameterValues.${paramName}`);
        }
      }
    }

    return references;
  }, [editorDoc, nodes]);

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
    if (!editorDoc) return [];
    
    // Effect mode: use effect's variables
    if (editorDoc.mode === 'effect') {
      const effectVars = (currentEffectDefinition?.variables ?? []).map(v => ({
        name: v.name,
        type: v.type,
        scope: 'cue' as const  // Effect variables are cue-scoped
      }));
      return effectVars;
    }
    
    // Cue mode: combine group and cue variables
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
  }, [editorDoc, selectedCueId, currentEffectDefinition]);

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
    return (currentCue?.effects ?? []).map(e => ({ 
      id: e.effectId, 
      name: e.name,
      definition: loadedEffectDefinitions.get(e.effectId)
    }));
  }, [editorDoc, selectedCueId, loadedEffectDefinitions]);

  // Load effect definitions when effect references change
  useEffect(() => {
    if (!editorDoc || editorDoc.mode !== 'cue' || !selectedCueId) return;
    
    const cueFile = editorDoc.file as NodeCueFile;
    const currentCue = cueFile.cues.find(c => c.id === selectedCueId);
    const effectRefs = currentCue?.effects ?? [];
    
    // Load each effect definition
    const loadEffects = async () => {
      const newDefinitions = new Map<string, EffectDefinition>();
      
      for (const effectRef of effectRefs) {
        try {
          // Find the effect file
          const effectFile = mode === 'yarg' ? groupedEffectFiles.yarg : groupedEffectFiles.audio;
          const fileEntry = effectFile.find(f => f.groupId === effectRef.effectFileId);
          
          if (fileEntry) {
            const effectFileData = await window.electron.ipcRenderer.invoke('effects:read', fileEntry.path) as EffectFile;
            const effectDef = effectFileData.effects.find(e => e.id === effectRef.effectId);
            if (effectDef) {
              newDefinitions.set(effectRef.effectId, effectDef);
            }
          }
        } catch (error) {
          console.warn(`Failed to load effect ${effectRef.effectId}:`, error);
        }
      }
      
      setLoadedEffectDefinitions(newDefinitions);
    };
    
    loadEffects();
  }, [editorDoc, selectedCueId, mode, groupedEffectFiles]);

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
    <div className="p-4 space-y-4 text-sm h-full flex flex-col">
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

      <div className="grid gap-4 flex-1 min-h-0" style={{ gridTemplateColumns: 'minmax(260px, 300px) minmax(50%, 2fr) minmax(260px, 400px)' }}>
        <div className="flex flex-col gap-4 overflow-hidden">
          <CueFileSidebar
            mode={mode}
            fileList={fileList}
            effectFileList={effectFiles}
            editorDoc={editorDoc}
            selectedCueId={selectedCueId}
            onSelectFile={selectFile}
            onSelectEffectFile={selectEffectFile}
            onReload={handleReload}
            onAddCue={handleAddCue}
            onAddEffect={handleAddEffect}
            onRemoveCue={removeCue}
            onRemoveEffect={removeEffect}
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
                {editorDoc?.mode === 'effect' ? 'Effect Variables' : 'Variables'}
              </button>
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium ${
                  registryTab === 'events'
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 border-b-2 border-purple-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => setRegistryTab('events')}
              >
                {editorDoc?.mode === 'effect' ? 'Effect Events' : 'Events'}
              </button>
              {editorDoc?.mode === 'cue' && (
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
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {registryTab === 'variables' ? (
                <VariableRegistry
                  editorDoc={editorDoc}
                  selectedCueId={selectedCueId}
                  currentEffect={currentEffectDefinition}
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
              ) : (
                <EffectRegistry
                  editorDoc={editorDoc}
                  selectedCueId={selectedCueId}
                  onEffectsChange={handleEffectsChange}
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
            editorMode={editorDoc?.mode ?? 'cue'}
            addEventNode={addEventNode}
            addActionNode={addActionNode}
            addLogicNode={addLogicNode}
            addEventRaiserNode={addEventRaiserNode}
            addEventListenerNode={addEventListenerNode}
            addEffectRaiserNode={addEffectRaiserNode}
            addEffectListenerNode={addEffectListenerNode}
            addNotesNode={addNotesNode}
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

        <div className={`overflow-hidden ${!hasFile ? 'opacity-50 pointer-events-none' : ''}`}>
          <NodeSidebar
            activeMode={activeMode}
            editorMode={editorDoc?.mode ?? 'cue'}
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
      </div>
      <div className="text-xs text-gray-500 flex justify-between">
        {editorDoc?.path ? (
          <button
            className="hover:text-blue-600 hover:underline text-left"
            onClick={() => window.electron.ipcRenderer.invoke('shell:showItemInFolder', editorDoc.path)}
            title="Click to reveal in file explorer"
          >
            {editorDoc.path}
          </button>
        ) : (
          <span>Unsaved file</span>
        )}
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

