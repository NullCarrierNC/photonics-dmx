import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addEdge, useEdgesState, useNodesState, type Connection, type Edge, type ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';
import type { NodeCueFileSummary } from '../../../photonics-dmx/cues/node/loader/NodeCueLoader';
import type {
  AudioEventNode,
  ActionNode,
  AudioNodeCueDefinition,
  AudioNodeCueFile,
  NodeCueGroupMeta,
  NodeCueFile,
  NodeCueMode,
  NodeEffectType,
  YargEventNode,
  YargNodeCueDefinition,
  YargNodeCueFile
} from '../../../photonics-dmx/cues/types/nodeCueTypes';
import { createDefaultActionTiming } from '../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition } from '../../../photonics-dmx/types';
import {
  deleteNodeCueFile,
  exportNodeCueFile,
  getNodeCueTypes,
  importNodeCueFile,
  listNodeCueFiles,
  readNodeCueFile,
  reloadNodeCueFiles,
  saveNodeCueFile,
  validateNodeCue
} from '../ipcApi';
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers';
import CueFlowCanvas from '../components/cue-editor/components/CueFlowCanvas';
import CueFileSidebar from '../components/cue-editor/components/CueFileSidebar';
import CueMetadataForm from '../components/cue-editor/components/CueMetadataForm';
import NodeSidebar from '../components/cue-editor/components/NodeSidebar';
import ActionNodeComponent from '../components/cue-editor/components/flow/ActionNode';
import EventNodeComponent from '../components/cue-editor/components/flow/EventNode';
import {
  calculateChainDuration,
  getAudioEventLabel,
  getYargEventLabel
} from '../components/cue-editor/lib/cueUtils';
import {
  createBlankCue,
  buildDefaultAction,
  createDefaultFile,
  createId
} from '../components/cue-editor/lib/cueDefaults';
import type { EditorDocument, EditorNode, EditorNodeData, EventOption } from '../components/cue-editor/lib/types';
import {
  clearStoredLastFilePath,
  getStoredLastFilePath,
  setStoredLastFilePath
} from '../components/cue-editor/hooks/useLastCueFilePath';

const getBasename = (value: string): string => {
  const segments = value.split(/[/\\]/);
  return segments[segments.length - 1] || value;
};

const CueEditor: React.FC = () => {
  const initialDocRef = useRef<EditorDocument | null>(null);
  if (!initialDocRef.current) {
    const file = createDefaultFile('yarg');
    initialDocRef.current = { file, path: null };
  }

  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const [files, setFiles] = useState<NodeCueFileSummary[]>([]);
  const [mode, setMode] = useState<NodeCueMode>('yarg');
  const [editorDoc, setEditorDoc] = useState<EditorDocument | null>(initialDocRef.current);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(initialDocRef.current?.file.cues[0]?.id ?? null);
  const [filename, setFilename] = useState<string>(`${initialDocRef.current?.file.group.id ?? 'untitled'}.json`);
  const [nodes, setNodes, onNodesChange] = useNodesState<EditorNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [availableCueTypes, setAvailableCueTypes] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const restoredLastFileRef = useRef<boolean>(false);
  const lastStoredFilePathRef = useRef<string | null>(getStoredLastFilePath());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  const activeMode: NodeCueMode = editorDoc?.file.mode ?? mode;

  const rememberLastFilePath = useCallback((path: string | null) => {
    if (!path) {
      return;
    }
    setStoredLastFilePath(path);
    lastStoredFilePathRef.current = path;
  }, []);

  const clearLastFilePath = useCallback(() => {
    clearStoredLastFilePath();
    lastStoredFilePathRef.current = null;
  }, []);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(node => node.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  const selectedActionHasEventParent = useMemo(() => {
    if (!selectedNode || selectedNode.data.kind !== 'action') return false;
    return edges.some(edge => edge.target === selectedNode.id && nodes.find(n => n.id === edge.source)?.data.kind === 'event');
  }, [edges, nodes, selectedNode]);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setEdges(prev => prev.filter(e => e.id !== edge.id));
    setIsDirty(true);
  }, [setEdges]);

  const nodeTypes = useMemo(() => ({
    event: EventNodeComponent,
    action: ActionNodeComponent
  }), []);

  const currentCueDefinition = useMemo(() => {
    if (!editorDoc || !selectedCueId) return null;
    return editorDoc.file.cues.find(cue => cue.id === selectedCueId) ?? null;
  }, [editorDoc, selectedCueId]);

  const chainDuration = useMemo(() => {
    return calculateChainDuration(nodes, edges);
  }, [nodes, edges]);

  const groupedFiles = useMemo(() => ({
    yarg: files.filter(file => file.mode === 'yarg'),
    audio: files.filter(file => file.mode === 'audio')
  }), [files]);

  useEffect(() => {
    refreshFiles();
    const handler = (_: unknown, payload: { yarg: NodeCueFileSummary[]; audio: NodeCueFileSummary[] }) => {
      setFiles([...payload.yarg, ...payload.audio]);
    };
    addIpcListener('node-cues:changed', handler);
    return () => removeIpcListener('node-cues:changed', handler);
  }, []);

  useEffect(() => {
    getNodeCueTypes(mode).then((types: string[]) => setAvailableCueTypes(types)).catch(() => setAvailableCueTypes([]));
  }, [mode]);

  const refreshFiles = useCallback(async () => {
    try {
      const summary = await listNodeCueFiles();
      setFiles([...summary.yarg, ...summary.audio]);
    } catch (error) {
      console.error('Failed to list node cue files', error);
    }
  }, []);

  const loadCueIntoFlow = useCallback((cue: YargNodeCueDefinition | AudioNodeCueDefinition | null) => {
    if (!cue) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const cueMode: NodeCueMode = 'cueType' in cue ? 'yarg' : 'audio';
    const nodePositions = cue.layout?.nodePositions ?? {};
    const flowNodes: EditorNode[] = [
      ...cue.nodes.events.map(event => ({
        id: event.id,
        type: 'event',
        position: nodePositions[event.id] ?? { x: 100, y: 100 },
        data: {
          kind: 'event' as const,
          label: cueMode === 'yarg'
            ? getYargEventLabel((event as YargEventNode).eventType)
            : getAudioEventLabel((event as AudioEventNode).eventType),
          payload: event
        }
      })),
      ...cue.nodes.actions.map(action => ({
        id: action.id,
        type: 'action',
        position: nodePositions[action.id] ?? { x: 400, y: 100 },
        data: {
          kind: 'action' as const,
          label: `${action.effectType}`,
          payload: action
        }
      }))
    ];

    const flowEdges: Edge[] = cue.connections.map(connection => ({
      id: `${connection.from}-${connection.to}`,
      source: connection.from,
      target: connection.to
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
    setSelectedNodeId(null);
  }, [setEdges, setNodes]);

  const selectFile = useCallback(async (fileSummary: NodeCueFileSummary) => {
    try {
      const file = await readNodeCueFile(fileSummary.path);
      setEditorDoc({ file, path: fileSummary.path });
      setMode(file.mode);
      setFilename(getBasename(fileSummary.path));
      const cueId = file.cues[0]?.id ?? null;
      setSelectedCueId(cueId);
      setIsDirty(false);
      loadCueIntoFlow(file.cues[0] ?? null);
      rememberLastFilePath(fileSummary.path);
    } catch (error) {
      console.error('Failed to open node cue file', error);
    }
  }, [loadCueIntoFlow, rememberLastFilePath]);

  useEffect(() => {
    if (restoredLastFileRef.current) {
      return;
    }
    if (files.length === 0) {
      return;
    }

    const storedPath = lastStoredFilePathRef.current;
    if (!storedPath) {
      restoredLastFileRef.current = true;
      return;
    }

    const summary = files.find(file => file.path === storedPath);
    restoredLastFileRef.current = true;

    if (!summary) {
      clearLastFilePath();
      return;
    }

    selectFile(summary);
  }, [clearLastFilePath, files, selectFile]);

  useEffect(() => {
    if (initialDocRef.current) {
      const initialCue = initialDocRef.current.file.cues[0] ?? null;
      loadCueIntoFlow(initialCue as YargNodeCueDefinition | AudioNodeCueDefinition | null);
    }
  }, [loadCueIntoFlow]);

  const handleModeChange = useCallback((nextMode: NodeCueMode) => {
    setMode(nextMode);
    if (!editorDoc) {
      const file = createDefaultFile(nextMode);
      setEditorDoc({ file, path: null });
      setSelectedCueId(file.cues[0]?.id ?? null);
      setFilename(`${file.group.id}.json`);
      loadCueIntoFlow(file.cues[0] ?? null);
      setIsDirty(true);
    }
  }, [editorDoc, loadCueIntoFlow]);

  const handleNewFile = useCallback(() => {
    const file = createDefaultFile(mode);
    setEditorDoc({ file, path: null });
    setSelectedCueId(file.cues[0]?.id ?? null);
    setFilename(`${file.group.id}.json`);
    loadCueIntoFlow(file.cues[0] ?? null);
    setIsDirty(true);
    setValidationErrors([]);
  }, [mode, loadCueIntoFlow]);

  const updateGroupMeta = useCallback((updates: Partial<NodeCueGroupMeta>) => {
    if (!editorDoc) return;
    const updated = {
      ...editorDoc,
      file: {
        ...editorDoc.file,
        group: { ...editorDoc.file.group, ...updates }
      }
    };
    setEditorDoc(updated);
    setIsDirty(true);
  }, [editorDoc]);

  const updateCueMetadata = useCallback((updates: Partial<YargNodeCueDefinition & AudioNodeCueDefinition>) => {
    if (!editorDoc || !selectedCueId) return;
    const updatedCues = editorDoc.file.cues.map(cue => cue.id === selectedCueId ? { ...cue, ...updates } : cue);
    const updated = {
      ...editorDoc,
      file: {
        ...editorDoc.file,
        cues: updatedCues
      }
    };
    setEditorDoc(updated);
    setIsDirty(true);
  }, [editorDoc, selectedCueId]);

  const handleAddCue = useCallback(() => {
    const newCue = createBlankCue(mode);
    const baseDoc = editorDoc ?? { file: createDefaultFile(mode), path: null };
    const updatedCues = [...baseDoc.file.cues, newCue];
    const updatedFile = mode === 'yarg'
      ? { ...baseDoc.file, cues: updatedCues as YargNodeCueDefinition[] } as YargNodeCueFile
      : { ...baseDoc.file, cues: updatedCues as AudioNodeCueDefinition[] } as AudioNodeCueFile;
    const updatedDoc: EditorDocument = { ...baseDoc, file: updatedFile };
    setEditorDoc(updatedDoc);
    setSelectedCueId(newCue.id);
    loadCueIntoFlow(newCue as YargNodeCueDefinition | AudioNodeCueDefinition);
    setIsDirty(true);
  }, [editorDoc, mode, loadCueIntoFlow]);

  const removeCue = useCallback((cueId: string) => {
    if (!editorDoc) {
      return;
    }
    if (editorDoc.file.cues.length <= 1) {
      return;
    }

    const updatedCues = editorDoc.file.cues.filter(cue => cue.id !== cueId);
    const updatedFile = editorDoc.file.mode === 'yarg'
      ? { ...editorDoc.file, cues: updatedCues as YargNodeCueDefinition[] } as YargNodeCueFile
      : { ...editorDoc.file, cues: updatedCues as AudioNodeCueDefinition[] } as AudioNodeCueFile;
    const updatedDoc: EditorDocument = { ...editorDoc, file: updatedFile };

    setEditorDoc(updatedDoc);

    let nextCueId = selectedCueId;
    if (cueId === selectedCueId) {
      nextCueId = updatedCues[0]?.id ?? null;
      setSelectedCueId(nextCueId);
    }

    const nextCue = updatedCues.find(cue => cue.id === nextCueId) ?? updatedCues[0] ?? null;
    loadCueIntoFlow(nextCue as YargNodeCueDefinition | AudioNodeCueDefinition | null);
    setIsDirty(true);
  }, [editorDoc, loadCueIntoFlow, selectedCueId]);

  const addEventNode = useCallback((option: EventOption<WaitCondition | AudioEventNode['eventType']>) => {
    const nodeMode = editorDoc?.file.mode ?? mode;
    const newEventId = `event-${createId()}`;
    const newNode: EditorNode = {
      id: newEventId,
      type: 'event',
      position: {
        x: 120,
        y: 80 + nodes.length * 40
      },
      data: {
        kind: 'event',
        label: option.label,
        payload: nodeMode === 'yarg'
          ? { id: newEventId, type: 'event', eventType: option.value as YargEventNode['eventType'] }
          : { id: newEventId, type: 'event', eventType: option.value as AudioEventNode['eventType'], threshold: 0.5, triggerMode: 'edge' }
      }
    };
    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [editorDoc, mode, nodes.length, setNodes]);

  const addActionNode = useCallback((effectType: NodeEffectType) => {
    const action = { ...buildDefaultAction(), id: `action-${createId()}`, effectType };
    const newNode: EditorNode = {
      id: action.id,
      type: 'action',
      position: {
        x: 480,
        y: 160 + nodes.length * 40
      },
      data: {
        kind: 'action',
        label: effectType,
        payload: action
      }
    };
    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [nodes.length, setNodes]);

  const isValidNodeConnection = useCallback((sourceId?: string | null, targetId?: string | null) => {
    if (!sourceId || !targetId || sourceId === targetId) {
      return false;
    }
    const sourceNode = nodes.find(node => node.id === sourceId);
    const targetNode = nodes.find(node => node.id === targetId);
    if (!sourceNode || !targetNode) {
      return false;
    }

    // Event → Action is always valid
    if (sourceNode.data.kind === 'event' && targetNode.data.kind === 'action') {
      return true;
    }

    // Action → Action is valid (for chaining)
    if (sourceNode.data.kind === 'action' && targetNode.data.kind === 'action') {
      return true;
    }

    return false;
  }, [nodes]);

  const onConnect = useCallback((connection: Connection) => {
    if (!isValidNodeConnection(connection.source, connection.target)) {
      return;
    }

    setNodes(prevNodes => {
      const sourceNode = prevNodes.find(n => n.id === connection.source);
      const targetNode = prevNodes.find(n => n.id === connection.target);
      if (!sourceNode || !targetNode) return prevNodes;

      // Only mutate action targets
      if (targetNode.data.kind !== 'action') return prevNodes;

      const targetAction = { ...(targetNode.data.payload as ActionNode) };

      if (sourceNode.data.kind === 'event') {
        const sourceEvent = sourceNode.data.payload as YargEventNode | AudioEventNode;
        targetAction.timing = {
          ...createDefaultActionTiming(),
          ...(targetAction.timing ?? {}),
          waitForCondition: sourceEvent.eventType as any,
          waitForTime: 0
        };
      } else if (sourceNode.data.kind === 'action') {
        const sourceAction = sourceNode.data.payload as ActionNode;
        targetAction.color = { ...sourceAction.color };
        targetAction.secondaryColor = sourceAction.secondaryColor ? { ...sourceAction.secondaryColor } : undefined;
        targetAction.target = { ...sourceAction.target };
        targetAction.layer = sourceAction.layer;
      }

      return prevNodes.map(node =>
        node.id === targetNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                payload: targetAction
              }
            }
          : node
      );
    });

    setEdges(eds => addEdge({ ...connection, type: 'default' }, eds));
    setIsDirty(true);
  }, [isValidNodeConnection, setEdges, setNodes]);

  const isValidConnection = useCallback((connection: Connection) => {
    return isValidNodeConnection(connection.source, connection.target);
  }, [isValidNodeConnection]);

  const handleNodeSelection = useCallback(({ nodes: selected }: { nodes: EditorNode[] }) => {
    setSelectedNodeId(selected[0]?.id ?? null);
    setContextMenu(null);
  }, []);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: EditorNode) => {
    event.preventDefault();
    const rect = flowWrapperRef.current?.getBoundingClientRect();
    const x = rect ? event.clientX - rect.left : event.clientX;
    const y = rect ? event.clientY - rect.top : event.clientY;
    setSelectedNodeId(node.id);
    setContextMenu({ x, y, nodeId: node.id });
  }, []);

  const handleRemoveNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(node => node.id !== nodeId));
    setEdges(eds => eds.filter(edge => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNodeId(prev => (prev === nodeId ? null : prev));
    setIsDirty(true);
    setContextMenu(null);
  }, [setEdges, setNodes]);

  const updateSelectedNode = useCallback(<T extends YargEventNode | AudioEventNode | ActionNode>(updates: Partial<T>) => {
    if (!selectedNodeId) return;
    const nodeMode = editorDoc?.file.mode ?? mode;
    setNodes(nds => nds.map(node => {
      if (node.id !== selectedNodeId) return node;
      const nextPayload = { ...node.data.payload, ...updates } as T;
      return {
        ...node,
        data: {
          ...node.data,
          payload: nextPayload,
          label: node.data.kind === 'event'
            ? nodeMode === 'yarg'
              ? getYargEventLabel((nextPayload as YargEventNode).eventType as WaitCondition)
              : getAudioEventLabel((nextPayload as AudioEventNode).eventType)
            : node.data.kind === 'action'
              ? (nextPayload as ActionNode).effectType
              : node.data.label
        }
      };
    }));
    setIsDirty(true);
  }, [editorDoc, mode, selectedNodeId, setNodes]);

  const getUpdatedDocument = useCallback((): NodeCueFile | null => {
    if (!editorDoc || !currentCueDefinition) return null;
    const layoutPositions: Record<string, { x: number; y: number }> = {};
    nodes.forEach(node => {
      layoutPositions[node.id] = {
        x: node.position.x,
        y: node.position.y
      };
    });

    const eventNodes = nodes.filter(node => node.data.kind === 'event');
    const actionNodes = nodes.filter(node => node.data.kind === 'action');
    const validEdges = edges.filter(edge => {
      const sourceNode = nodes.find(node => node.id === edge.source);
      const targetNode = nodes.find(node => node.id === edge.target);
      if (!sourceNode || !targetNode) return false;

      // Event → Action
      if (sourceNode.data.kind === 'event' && targetNode.data.kind === 'action') {
        return true;
      }
      // Action → Action (chaining)
      if (sourceNode.data.kind === 'action' && targetNode.data.kind === 'action') {
        return true;
      }
      return false;
    });

    const updatedCue = {
      ...currentCueDefinition,
      nodes: {
        events: eventNodes.map(node => node.data.payload) as (YargEventNode[] | AudioEventNode[]),
        actions: actionNodes.map(node => node.data.payload) as ActionNode[]
      },
      connections: validEdges.map(edge => ({
        from: edge.source,
        to: edge.target
      })),
      layout: {
        nodePositions: layoutPositions,
        viewport: reactFlowInstance ? reactFlowInstance.toObject().viewport : currentCueDefinition.layout?.viewport
      }
    };

    const updatedCues = editorDoc.file.cues.map(cue => (cue.id === updatedCue.id ? updatedCue : cue));
    return {
      ...editorDoc.file,
      cues: updatedCues
    };
  }, [currentCueDefinition, editorDoc, edges, nodes, reactFlowInstance]);

  const handleSave = useCallback(async () => {
    if (!editorDoc) return;
    const updatedFile = getUpdatedDocument();
    if (!updatedFile) return;

    const payload = {
      mode: updatedFile.mode,
      filename,
      content: updatedFile
    };

    const validation = await validateNodeCue({ content: updatedFile });
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    try {
      const response = await saveNodeCueFile(payload);
      setEditorDoc({ file: updatedFile, path: response.path });
      rememberLastFilePath(response.path);
      setValidationErrors([]);
      setIsDirty(false);
      refreshFiles();
    } catch (error) {
      console.error('Failed to save node cue file', error);
    }
  }, [editorDoc, filename, getUpdatedDocument, refreshFiles, rememberLastFilePath]);

  const handleDelete = useCallback(async () => {
    if (!editorDoc?.path) return;
    if (editorDoc.path === lastStoredFilePathRef.current) {
      clearLastFilePath();
    }
    await deleteNodeCueFile(editorDoc.path);
    const file = createDefaultFile(mode);
    setEditorDoc({ file, path: null });
    const cueId = file.cues[0]?.id ?? null;
    setSelectedCueId(cueId);
    setFilename(`${file.group.id}.json`);
    loadCueIntoFlow(file.cues[0] ?? null);
    setValidationErrors([]);
    setIsDirty(true);
    refreshFiles();
  }, [clearLastFilePath, editorDoc, loadCueIntoFlow, mode, refreshFiles]);

  const handleImport = useCallback(async () => {
    await importNodeCueFile(mode);
    refreshFiles();
  }, [mode, refreshFiles]);

  const handleExport = useCallback(async () => {
    if (!editorDoc?.path) return;
    await exportNodeCueFile(editorDoc.path);
  }, [editorDoc]);

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
            onChange={event => handleModeChange(event.target.value as NodeCueMode)}
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
        <CueFileSidebar
          mode={mode}
          fileList={fileList}
          editorDoc={editorDoc}
          selectedCueId={selectedCueId}
          onSelectFile={selectFile}
          onReload={reloadNodeCueFiles}
          onNewFile={handleNewFile}
          onAddCue={handleAddCue}
          onRemoveCue={removeCue}
          onSelectCue={cue => {
            setSelectedCueId(cue?.id ?? null);
            loadCueIntoFlow(cue as any);
          }}
        />

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
            onPaneClick={() => setContextMenu(null)}
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
          addEventNode={addEventNode}
          addActionNode={addActionNode}
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

