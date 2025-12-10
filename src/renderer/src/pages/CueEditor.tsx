import React, { useCallback, useMemo, useRef } from 'react';
import 'reactflow/dist/style.css';
import CueFlowCanvas from '../components/cue-editor/components/CueFlowCanvas';
import CueFileSidebar from '../components/cue-editor/components/CueFileSidebar';
import CueMetadataForm from '../components/cue-editor/components/CueMetadataForm';
import NodeSidebar from '../components/cue-editor/components/NodeSidebar';
import VariableRegistry from '../components/cue-editor/components/VariableRegistry';
import ActionNodeComponent from '../components/cue-editor/components/flow/ActionNode';
import EventNodeComponent from '../components/cue-editor/components/flow/EventNode';
import LogicNodeComponent from '../components/cue-editor/components/flow/LogicNode';
import { useCueFiles } from '../components/cue-editor/hooks/useCueFiles';
import { useCueFlow } from '../components/cue-editor/hooks/useCueFlow';
import { updateDocumentFromFlow } from '../components/cue-editor/lib/cueTransforms';
import type { NodeCueFile, VariableDefinition } from '../../../photonics-dmx/cues/types/nodeCueTypes';

const CueEditor: React.FC = () => {
  const loadCueIntoFlowRef = useRef<(cue: any) => void>(() => {});
  const getUpdatedDocumentRef = useRef<() => NodeCueFile | null>(() => null);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);

  const loadCueIntoFlowProxy = useCallback((cue: any) => loadCueIntoFlowRef.current(cue), []);
  const getUpdatedDocumentProxy = useCallback(() => getUpdatedDocumentRef.current(), []);

  const {
    mode,
    activeMode,
    groupedFiles,
    editorDoc,
    selectedCueId,
    filename,
    availableCueTypes,
    validationErrors,
    isDirty,
    currentCueDefinition,
    setFilename,
    setSelectedCueId,
    setIsDirty,
    handleModeChange,
    handleNewFile,
    updateGroupMeta,
    updateCueMetadata,
    handleAddCue,
    removeCue,
    selectFile,
    handleSave,
    handleDelete,
    handleImport,
    handleExport,
    refreshFiles
  } = useCueFiles({ loadCueIntoFlow: loadCueIntoFlowProxy, getUpdatedDocument: getUpdatedDocumentProxy });

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
    updateSelectedNode,
    loadCueIntoFlow,
    setReactFlowInstance,
    reactFlowInstance,
    closeContextMenu
  } = useCueFlow({ activeMode, setIsDirty });

  loadCueIntoFlowRef.current = loadCueIntoFlow;

  const getUpdatedDocument = useCallback(() => updateDocumentFromFlow(
    editorDoc,
    currentCueDefinition,
    nodes,
    edges,
    reactFlowInstance
  ), [editorDoc, currentCueDefinition, nodes, edges, reactFlowInstance]);

  getUpdatedDocumentRef.current = getUpdatedDocument;

  const nodeTypes = useMemo(() => ({
    event: EventNodeComponent,
    action: ActionNodeComponent,
    logic: LogicNodeComponent
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

  const getVariableReferences = useCallback((varName: string, scope: 'cue' | 'cue-group'): string[] => {
    if (!editorDoc) return [];
    
    const references: string[] = [];
    const cuesToCheck = scope === 'cue' && selectedCueId 
      ? editorDoc.file.cues.filter(c => c.id === selectedCueId)
      : editorDoc.file.cues;

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

  const availableVariables = useMemo(() => {
    if (!editorDoc) return [];
    
    const groupVars = (editorDoc.file.group.variables ?? []).map(v => ({
      name: v.name,
      type: v.type,
      scope: 'cue-group' as const
    }));
    
    const cueVars = selectedCueId
      ? (editorDoc.file.cues.find(c => c.id === selectedCueId)?.variables ?? []).map(v => ({
          name: v.name,
          type: v.type,
          scope: 'cue' as const
        }))
      : [];
    
    return [...groupVars, ...cueVars];
  }, [editorDoc, selectedCueId]);

  const fileList = mode === 'yarg' ? groupedFiles.yarg : groupedFiles.audio;
  const primaryButton = 'px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500';
  const secondaryButton = 'px-3 py-1 text-xs rounded bg-gray-200 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-700';
  const dangerButton = 'px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-500';

  return (
    <div className="p-4 space-y-4 text-sm h-full">
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="font-semibold text-base">Mode</label>
          <select
            value={mode}
            onChange={event => handleModeChange(event.target.value as any)}
            className="rounded border border-gray-300 px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="yarg">YARG Node Cues</option>
            <option value="audio">Audio Node Cues</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className={secondaryButton} onClick={handleNewFile}>New File</button>
          <button className={`${primaryButton} ${!editorDoc ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={handleSave} disabled={!editorDoc}>Save</button>
          <button className={secondaryButton} onClick={handleImport}>Import</button>
          <button className={`${secondaryButton} ${!editorDoc?.path ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={handleExport} disabled={!editorDoc?.path}>Export</button>
          <button className={`${dangerButton} ${!editorDoc?.path ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={handleDelete} disabled={!editorDoc?.path}>Delete</button>
        </div>
      </div>

      <div className="grid grid-cols-[260px_1fr_320px] gap-4 h-[calc(100vh-220px)]">
        <div className="flex flex-col gap-4 overflow-hidden">
          <CueFileSidebar
            mode={mode}
            fileList={fileList}
            editorDoc={editorDoc}
            selectedCueId={selectedCueId}
            onSelectFile={selectFile}
            onReload={refreshFiles}
            onNewFile={handleNewFile}
            onAddCue={handleAddCue}
            onRemoveCue={removeCue}
            onSelectCue={cue => {
              setSelectedCueId(cue?.id ?? null);
              loadCueIntoFlow(cue as any);
            }}
          />
          
          <VariableRegistry
            editorDoc={editorDoc}
            selectedCueId={selectedCueId}
            onVariablesChange={handleVariablesChange}
            getVariableReferences={getVariableReferences}
          />
        </div>

        <section className="flex flex-col bg-white dark:bg-gray-900 rounded-lg shadow-inner">
          <CueMetadataForm
            filename={filename}
            group={editorDoc?.file.group ?? null}
            currentCue={currentCueDefinition}
            availableCueTypes={availableCueTypes}
            activeMode={activeMode}
            onFilenameChange={value => {
              setFilename(value);
              setIsDirty(true);
            }}
            onGroupChange={updateGroupMeta}
            onCueMetadataChange={updateCueMetadata}
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

        <NodeSidebar
          activeMode={activeMode}
          selectedNode={selectedNode}
          selectedActionHasEventParent={selectedActionHasEventParent}
          availableVariables={availableVariables}
          addEventNode={addEventNode}
          addActionNode={addActionNode}
          addLogicNode={addLogicNode}
          updateSelectedNode={updateSelectedNode}
        />
      </div>
      <div className="text-xs text-gray-500 flex justify-between">
        <span>{editorDoc?.path ?? 'Unsaved file'}</span>
        <span>{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
      </div>
    </div>
  );
};

export default CueEditor;

