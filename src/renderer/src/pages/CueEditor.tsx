import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  Connection,
  Edge,
  Node,
  Panel,
  ReactFlowInstance
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { NodeCueFileSummary } from '../../../photonics-dmx/cues/node/loader/NodeCueLoader';
import type {
  AudioEventNode,
  AudioEventType,
  AudioNodeCueDefinition,
  AudioNodeCueFile,
  NodeCueFile,
  NodeCueGroupMeta,
  NodeCueMode,
  NodeEffectType,
  YargEventNode,
  YargNodeCueDefinition,
  YargNodeCueFile,
  ActionTiming
} from '../../../photonics-dmx/cues/types/nodeCueTypes';
import type { ActionNode } from '../../../photonics-dmx/cues/types/nodeCueTypes';
import { createDefaultActionTiming } from '../../../photonics-dmx/cues/types/nodeCueTypes';
import type { Color, Brightness, BlendMode, LightTarget, LocationGroup, WaitCondition } from '../../../photonics-dmx/types';
import { CueType } from '../../../photonics-dmx/cues/types/cueTypes';
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

type EditorNodeData = {
  kind: 'event' | 'action';
  payload: YargEventNode | AudioEventNode | ActionNode;
  label: string;
};

type EditorNode = Node<EditorNodeData>;

type EditorDocument = {
  file: NodeCueFile;
  path: string | null;
};

type EventOption<T extends string> = {
  value: T;
  label: string;
};

const LAST_FILE_STORAGE_KEY = 'photonics.nodeCueEditor.lastFilePath';

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  return window.localStorage;
};

const getStoredLastFilePath = (): string | null => {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(LAST_FILE_STORAGE_KEY);
  } catch {
    return null;
  }
};

const setStoredLastFilePath = (path: string): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(LAST_FILE_STORAGE_KEY, path);
  } catch {
    // Storage might be unavailable (e.g., privacy mode)
  }
};

const clearStoredLastFilePath = (): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(LAST_FILE_STORAGE_KEY);
  } catch {
    // Storage might be unavailable
  }
};

const withDefaultLabels = <T extends string>(values: T[]): EventOption<T>[] =>
  values.map(value => ({ value, label: value }));

const COLOR_OPTIONS: Color[] = [
  'red', 'blue', 'yellow', 'green', 'cyan', 'orange', 'purple',
  'chartreuse', 'teal', 'violet', 'magenta', 'vermilion', 'amber',
  'white', 'black', 'transparent'
];

const BRIGHTNESS_OPTIONS: Brightness[] = ['low', 'medium', 'high', 'max'];
const EASING_OPTIONS = [
  'linear',
  'ease',
  'easeIn',
  'easeOut',
  'easeInOut',
  'sinIn',
  'sinOut',
  'sinInOut',
  'quadraticIn',
  'quadraticOut',
  'quadraticInOut',
  'cubicIn',
  'cubicOut',
  'cubicInOut'
] as const;
const BLEND_MODE_OPTIONS: BlendMode[] = ['replace', 'add', 'multiply', 'overlay'];
const LOCATION_OPTIONS: LocationGroup[] = ['front', 'back', 'strobe'];
const LIGHT_TARGETS: LightTarget[] = [
  'all', 'even', 'odd', 'half-1', 'half-2', 'outter-half-major', 'outter-half-minor',
  'inner-half-major', 'inner-half-minor', 'third-1', 'third-2', 'third-3',
  'quarter-1', 'quarter-2', 'quarter-3', 'quarter-4',
  'linear', 'inverse-linear', 'random-1', 'random-2', 'random-3', 'random-4'
];

const ACTION_OPTIONS: NodeEffectType[] = [
  'single-color', 'cross-fade', 'flash', 'fade-in-out', 'sweep', 'cycle', 'blackout'
];

const YARG_WAIT_CONDITIONS: WaitCondition[] = [
  'beat', 'measure', 'half-beat', 'keyframe',
  'guitar-open', 'guitar-green', 'guitar-red', 'guitar-yellow', 'guitar-blue', 'guitar-orange',
  'bass-open', 'bass-green', 'bass-red', 'bass-yellow', 'bass-blue', 'bass-orange',
  'keys-open', 'keys-green', 'keys-red', 'keys-yellow', 'keys-blue', 'keys-orange',
  'drum-kick', 'drum-red', 'drum-yellow', 'drum-blue', 'drum-green',
  'drum-yellow-cymbal', 'drum-blue-cymbal', 'drum-green-cymbal'
] as WaitCondition[];

const YARG_EVENT_OPTIONS: EventOption<WaitCondition>[] = [
  { value: 'none', label: 'Cue Start' },
  ...withDefaultLabels(YARG_WAIT_CONDITIONS)
];

const AUDIO_EVENT_OPTIONS: EventOption<AudioEventNode['eventType']>[] = withDefaultLabels([
  'audio-beat',
  'audio-range1', 'audio-range2', 'audio-range3', 'audio-range4', 'audio-range5',
  'audio-energy'
]);

const getYargEventLabel = (eventType: WaitCondition): string =>
  YARG_EVENT_OPTIONS.find(option => option.value === eventType)?.label ?? eventType;

const getAudioEventLabel = (eventType: AudioEventNode['eventType']): string =>
  AUDIO_EVENT_OPTIONS.find(option => option.value === eventType)?.label ?? eventType;

const buildDefaultAction = (): ActionNode => ({
  id: `action-${createId()}`,
  type: 'action',
  effectType: 'single-color',
  target: {
    groups: ['front'],
    filter: 'all'
  },
  color: {
    name: 'blue',
    brightness: 'medium',
    blendMode: 'replace'
  },
  secondaryColor: {
    name: 'green',
    brightness: 'medium',
    blendMode: 'replace'
  },
  timing: createDefaultActionTiming(),
  layer: 0
});

const buildDefaultYargEvent = (): YargEventNode => ({
  id: `event-${createId()}`,
  type: 'event',
  eventType: 'beat'
});

const buildDefaultAudioEvent = (): AudioEventNode => ({
  id: `event-${createId()}`,
  type: 'event',
  eventType: 'audio-beat',
  threshold: 0.5,
  triggerMode: 'edge'
});

const createDefaultCue = (mode: NodeCueMode): YargNodeCueDefinition | AudioNodeCueDefinition => {
  const eventNode = mode === 'yarg' ? buildDefaultYargEvent() : buildDefaultAudioEvent();
  const actionNode = buildDefaultAction();
  const base = {
    id: `cue-${createId()}`,
    name: 'New Cue',
    description: '',
    nodes: {
      events: [eventNode],
      actions: [actionNode]
    },
    connections: [
      { from: eventNode.id, to: actionNode.id }
    ],
    layout: {
      nodePositions: {}
    }
  };

  if (mode === 'yarg') {
    return {
      ...base,
      cueType: 'Chorus',
      style: 'primary'
    } as YargNodeCueDefinition;
  }

  return {
    ...base,
    cueTypeId: 'custom-audio-cue'
  } as AudioNodeCueDefinition;
};

const createDefaultFile = (mode: NodeCueMode): NodeCueFile => {
  const group: NodeCueGroupMeta = {
    id: `node-group-${Date.now()}`,
    name: mode === 'yarg' ? 'New YARG Group' : 'New Audio Group',
    description: ''
  };

  if (mode === 'yarg') {
    return {
      version: 1,
      mode,
      group,
      cues: [createDefaultCue('yarg') as YargNodeCueDefinition]
    } as YargNodeCueFile;
  }

  return {
    version: 1,
    mode,
    group,
    cues: [createDefaultCue('audio') as AudioNodeCueDefinition]
  } as AudioNodeCueFile;
};

const getBasename = (value: string): string => {
  const segments = value.split(/[/\\]/);
  return segments[segments.length - 1] || value;
};

/**
 * Calculates the total duration of an action based on its timing settings.
 */
const calculateActionDuration = (action: ActionNode): number => {
  const timing = action.timing ?? createDefaultActionTiming();
  return (
    Math.max(0, timing.fadeIn) +
    Math.max(0, timing.hold) +
    Math.max(0, timing.fadeOut) +
    Math.max(0, timing.postDelay)
  );
};

/**
 * Calculates the total chain duration for a cue by traversing all action chains.
 * Returns the maximum end time across all chains.
 */
const calculateChainDuration = (
  nodes: EditorNode[],
  edges: Edge[]
): number => {
  const eventNodes = nodes.filter(n => n.data.kind === 'event');
  const actionNodes = nodes.filter(n => n.data.kind === 'action');

  if (eventNodes.length === 0 || actionNodes.length === 0) return 0;

  const actionMap = new Map(actionNodes.map(n => [n.id, n.data.payload as ActionNode]));
  const eventToActions = new Map<string, string[]>();
  const actionToActions = new Map<string, string[]>();

  for (const edge of edges) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) continue;

    if (sourceNode.data.kind === 'event' && targetNode.data.kind === 'action') {
      const list = eventToActions.get(edge.source) ?? [];
      list.push(edge.target);
      eventToActions.set(edge.source, list);
    } else if (sourceNode.data.kind === 'action' && targetNode.data.kind === 'action') {
      const list = actionToActions.get(edge.source) ?? [];
      list.push(edge.target);
      actionToActions.set(edge.source, list);
    }
  }

  let maxEndTime = 0;

  const traverse = (actionId: string, cumulativeDelay: number, visited: Set<string>): void => {
    if (visited.has(actionId)) return;
    visited.add(actionId);

    const action = actionMap.get(actionId);
    if (!action) return;

    const duration = calculateActionDuration(action);
    const endTime = cumulativeDelay + duration;
    if (endTime > maxEndTime) maxEndTime = endTime;

    const chainedActions = actionToActions.get(actionId) ?? [];
    for (const nextId of chainedActions) {
      traverse(nextId, endTime, visited);
    }
  };

  for (const eventNode of eventNodes) {
    const rootActions = eventToActions.get(eventNode.id) ?? [];
    for (const actionId of rootActions) {
      traverse(actionId, 0, new Set());
    }
  }

  return maxEndTime;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `node-${Math.random().toString(36).slice(2, 10)}`;
};

const CueEditor: React.FC = () => {
  const initialDocRef = useRef<EditorDocument | null>(null);
  if (!initialDocRef.current) {
    const file = createDefaultFile('yarg');
    initialDocRef.current = { file, path: null };
  }

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
    const newCue = createDefaultCue(mode);
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
    setEdges(eds => addEdge({ ...connection, type: 'default' }, eds));
    setIsDirty(true);
  }, [isValidNodeConnection, setEdges]);

  const isValidConnection = useCallback((connection: Connection) => {
    return isValidNodeConnection(connection.source, connection.target);
  }, [isValidNodeConnection]);

  const handleNodeSelection = useCallback(({ nodes: selected }: { nodes: EditorNode[] }) => {
    setSelectedNodeId(selected[0]?.id ?? null);
  }, []);

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
        <aside className="bg-white dark:bg-gray-900 rounded-lg shadow-inner p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Files ({mode.toUpperCase()})</h3>
            <button className="text-xs text-blue-500 hover:underline" onClick={reloadNodeCueFiles}>Reload</button>
          </div>
          <div className="space-y-2">
            {fileList.length === 0 && (
              <p className="text-xs text-gray-500">No files found. Create one to get started.</p>
            )}
            {fileList.map(file => (
              <button
                key={file.path}
                className={`w-full text-left border rounded px-2 py-1 text-xs ${editorDoc?.path === file.path ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
                onClick={() => selectFile(file)}
              >
                <div className="font-semibold truncate">{file.groupName}</div>
                <div className="text-[10px] text-gray-500 truncate">{file.path}</div>
                <div className="text-[10px] text-gray-500">{file.cueCount} cue(s)</div>
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-4">
            <h3 className="font-semibold text-sm mb-2">Selected Node</h3>
            {!selectedNode ? (
              <p className="text-xs text-gray-500">Select a node on the canvas to edit its properties.</p>
            ) : selectedNode.data.kind === 'event' ? (
              <div className="space-y-2 text-xs">
                <label className="flex flex-col font-medium">
                  Event Type
                  <select
                    className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                    value={
                      activeMode === 'yarg'
                        ? (selectedNode.data.payload as YargEventNode).eventType
                        : (selectedNode.data.payload as AudioEventNode).eventType
                    }
                    onChange={event => {
                      if (activeMode === 'yarg') {
                        updateSelectedNode<YargEventNode>({ eventType: event.target.value as WaitCondition });
                      } else {
                        updateSelectedNode<AudioEventNode>({ eventType: event.target.value as AudioEventType });
                      }
                    }}
                  >
                    {(activeMode === 'yarg' ? YARG_EVENT_OPTIONS : AUDIO_EVENT_OPTIONS).map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {activeMode === 'audio' && (
                  <>
                    <label className="flex flex-col font-medium">
                      Threshold
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={(selectedNode.data.payload as AudioEventNode).threshold ?? 0.5}
                        onChange={event => updateSelectedNode<AudioEventNode>({ threshold: Number(event.target.value) })}
                      />
                    </label>
                    <label className="flex flex-col font-medium">
                      Trigger Mode
                      <select
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={(selectedNode.data.payload as AudioEventNode).triggerMode}
                        onChange={event => updateSelectedNode<AudioEventNode>({
                          triggerMode: event.target.value as 'edge' | 'level'
                        })}
                      >
                        <option value="edge">Edge</option>
                        <option value="level">Level</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <label className="flex flex-col font-medium">
                  Effect Type
                  <select
                    className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                    value={(selectedNode.data.payload as ActionNode).effectType}
                    onChange={event => updateSelectedNode({ effectType: event.target.value as NodeEffectType })}
                  >
                    {ACTION_OPTIONS.map(effect => (
                      <option key={effect} value={effect}>{effect}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col font-medium">
                    Target Groups
                    <select
                      multiple
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={(selectedNode.data.payload as ActionNode).target.groups}
                      onChange={event => {
                        const selected = Array.from(event.target.selectedOptions).map(option => option.value as LocationGroup);
                        updateSelectedNode({
                          target: {
                            ...(selectedNode.data.payload as ActionNode).target,
                            groups: selected
                          }
                        } as ActionNode);
                      }}
                    >
                      {LOCATION_OPTIONS.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col font-medium">
                    Target Filter
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={(selectedNode.data.payload as ActionNode).target.filter}
                      onChange={event => updateSelectedNode({
                        target: {
                          ...(selectedNode.data.payload as ActionNode).target,
                          filter: event.target.value as LightTarget
                        }
                      } as ActionNode)}
                    >
                      {LIGHT_TARGETS.map(target => (
                        <option key={target} value={target}>{target}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col font-medium">
                    Primary Colour
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={(selectedNode.data.payload as ActionNode).color.name}
                      onChange={event => updateSelectedNode({
                        color: {
                          ...(selectedNode.data.payload as ActionNode).color,
                          name: event.target.value as Color
                        }
                      } as ActionNode)}
                    >
                      {COLOR_OPTIONS.map(color => (
                        <option key={color} value={color}>{color}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col font-medium">
                    Brightness
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={(selectedNode.data.payload as ActionNode).color.brightness}
                      onChange={event => updateSelectedNode({
                        color: {
                          ...(selectedNode.data.payload as ActionNode).color,
                          brightness: event.target.value as Brightness
                        }
                      } as ActionNode)}
                    >
                      {BRIGHTNESS_OPTIONS.map(brightness => (
                        <option key={brightness} value={brightness}>{brightness}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col font-medium">
                    Blend Mode
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={(selectedNode.data.payload as ActionNode).color.blendMode ?? 'replace'}
                      onChange={event => updateSelectedNode({
                        color: {
                          ...(selectedNode.data.payload as ActionNode).color,
                          blendMode: event.target.value as BlendMode
                        }
                      } as ActionNode)}
                    >
                      {BLEND_MODE_OPTIONS.map(mode => (
                        <option key={mode} value={mode}>{mode}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex flex-col font-medium">
                  Layer
                  <input
                    type="number"
                    min={0}
                    className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                    value={(selectedNode.data.payload as ActionNode).layer ?? 0}
                    onChange={event => updateSelectedNode({ layer: Number(event.target.value) })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(() => {
                    const actionPayload = selectedNode.data.payload as ActionNode;
                    const currentTiming = actionPayload.timing ?? createDefaultActionTiming();
                    const updateTiming = (partial: Partial<ActionTiming>) =>
                      updateSelectedNode({
                        timing: {
                          ...currentTiming,
                          ...partial
                        }
                      } as ActionNode);

                    return (
                      <>
                        <label className="flex flex-col font-medium">
                          Fade In (ms)
                      <input
                        type="number"
                        min={0}
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                            value={currentTiming.fadeIn}
                            onChange={event => updateTiming({ fadeIn: Number(event.target.value) })}
                      />
                    </label>
                  <label className="flex flex-col font-medium">
                          Hold (ms)
                          <input
                            type="number"
                            min={0}
                            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                            value={currentTiming.hold}
                            onChange={event => updateTiming({ hold: Number(event.target.value) })}
                          />
                        </label>
                        <label className="flex flex-col font-medium">
                          Fade Out (ms)
                          <input
                            type="number"
                            min={0}
                            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                            value={currentTiming.fadeOut}
                            onChange={event => updateTiming({ fadeOut: Number(event.target.value) })}
                          />
                        </label>
                        <label className="flex flex-col font-medium">
                          Post Delay (ms)
                          <input
                            type="number"
                            min={0}
                            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                            value={currentTiming.postDelay}
                            onChange={event => updateTiming({ postDelay: Number(event.target.value) })}
                          />
                        </label>
                        <label className="flex flex-col font-medium">
                          Level
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                            value={currentTiming.level ?? 1}
                            onChange={event => updateTiming({ level: Number(event.target.value) })}
                    />
                  </label>
                        <label className="flex flex-col font-medium">
                          Ease In
                          <select
                            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                            value={currentTiming.easeIn ?? 'sinInOut'}
                            onChange={event => updateTiming({ easeIn: event.target.value })}
                          >
                            {EASING_OPTIONS.map(ease => (
                              <option key={ease} value={ease}>{ease}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col font-medium">
                          Ease Out
                          <select
                            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                            value={currentTiming.easeOut ?? currentTiming.easeIn ?? 'sinInOut'}
                            onChange={event => updateTiming({ easeOut: event.target.value })}
                          >
                            {EASING_OPTIONS.map(ease => (
                              <option key={ease} value={ease}>{ease}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </aside>

        <section className="flex flex-col bg-white dark:bg-gray-900 rounded-lg shadow-inner">
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col text-xs font-medium">
                Filename
                <input
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={filename}
                  onChange={event => {
                    setFilename(event.target.value);
                    setIsDirty(true);
                  }}
                />
              </label>
              <label className="flex flex-col text-xs font-medium">
                Group ID
                <input
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={editorDoc?.file.group.id ?? ''}
                  onChange={event => updateGroupMeta({ id: event.target.value })}
                />
              </label>
              <label className="flex flex-col text-xs font-medium">
                Group Name
                <input
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={editorDoc?.file.group.name ?? ''}
                  onChange={event => updateGroupMeta({ name: event.target.value })}
                />
              </label>
              <label className="flex flex-col text-xs font-medium">
                Group Description
                <input
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={editorDoc?.file.group.description ?? ''}
                  onChange={event => updateGroupMeta({ description: event.target.value })}
                />
              </label>
            </div>

            {currentCueDefinition && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="flex flex-col font-medium">
                  Cue Name
                  <input
                    className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                    value={currentCueDefinition.name}
                    onChange={event => updateCueMetadata({ name: event.target.value })}
                  />
                </label>
                <label className="flex flex-col font-medium">
                  Cue Description
                  <input
                    className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                    value={currentCueDefinition.description ?? ''}
                    onChange={event => updateCueMetadata({ description: event.target.value })}
                  />
                </label>
                {activeMode === 'yarg' ? (
                  <>
                    <label className="flex flex-col font-medium">
                      Cue Type
                      <select
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={(currentCueDefinition as YargNodeCueDefinition).cueType}
                        onChange={event => updateCueMetadata({ cueType: event.target.value as CueType })}
                      >
                        {availableCueTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col font-medium">
                      Cue Style
                      <select
                        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                        value={(currentCueDefinition as YargNodeCueDefinition).style}
                        onChange={event => updateCueMetadata({ style: event.target.value as 'primary' | 'secondary' })}
                      >
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                      </select>
                    </label>
                  </>
                ) : (
                  <label className="flex flex-col font-medium">
                    Cue Identifier
                    <input
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                      value={(currentCueDefinition as AudioNodeCueDefinition).cueTypeId}
                      onChange={event => updateCueMetadata({ cueTypeId: event.target.value })}
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 relative">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={handleNodeSelection}
              onInit={setReactFlowInstance}
              isValidConnection={isValidConnection}
              fitView
              className="rounded-b-lg"
            >
              <Panel position="top-left" className="bg-white/80 dark:bg-gray-900/80 px-2 py-1 text-[11px] rounded shadow">
                <div>{selectedCueId ? `Cue: ${currentCueDefinition?.name}` : 'Select or add a cue'}</div>
                {chainDuration > 0 && (
                  <div className="text-gray-600 dark:text-gray-400">
                    Chain duration: {formatDuration(chainDuration)}
                  </div>
                )}
              </Panel>
              <MiniMap pannable zoomable />
              <Controls />
              <Background gap={16} size={0.5} />
            </ReactFlow>
          </div>
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

        <aside className="bg-white dark:bg-gray-900 rounded-lg shadow-inner p-3 overflow-y-auto space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-sm">Cue List</h3>
              <button
                className="text-blue-500 text-xs hover:underline"
                onClick={handleAddCue}
              >
                + Add Cue
              </button>
            </div>
            <div className="space-y-1 text-xs">
              {editorDoc?.file.cues.map(cue => (
                <div key={cue.id} className="flex items-center gap-2">
                  <button
                    className={`flex-1 text-left px-2 py-1 rounded border ${selectedCueId === cue.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
                    onClick={() => {
                      setSelectedCueId(cue.id);
                      loadCueIntoFlow(cue as any);
                    }}
                  >
                    {cue.name}
                  </button>
                  <button
                    className="text-[11px] text-red-500 hover:underline disabled:text-gray-400"
                    onClick={() => removeCue(cue.id)}
                    disabled={(editorDoc?.file.cues.length ?? 0) <= 1}
                    title={(editorDoc?.file.cues.length ?? 0) <= 1 ? 'At least one cue is required' : 'Remove cue'}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-2">Event Nodes</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(activeMode === 'yarg' ? YARG_EVENT_OPTIONS : AUDIO_EVENT_OPTIONS).map(option => (
                <button
                  key={option.value}
                  className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => addEventNode(option)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-2">Action Nodes</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {ACTION_OPTIONS.map(effect => (
                <button
                  key={effect}
                  className="border rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => addActionNode(effect)}
                >
                  {effect}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <div className="text-xs text-gray-500 flex justify-between">
        <span>{editorDoc?.path ?? 'Unsaved file'}</span>
        <span>{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
      </div>
    </div>
  );
};

export default CueEditor;

