import type { Edge, ReactFlowInstance } from 'reactflow';
import type {
  AudioEventNode,
  AudioNodeCueDefinition,
  NodeCueFile,
  NodeCueMode,
  LogicNode,
  YargEventNode,
  YargNodeCueDefinition
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EditorDocument, EditorNode } from './types';
import { getAudioEventLabel, getYargEventLabel } from './cueUtils';

type CueDefinition = YargNodeCueDefinition | AudioNodeCueDefinition;

const cueModeOf = (cue: CueDefinition): NodeCueMode =>
  'cueType' in cue ? 'yarg' : 'audio';

const cueToFlow = (cue: CueDefinition | null): { nodes: EditorNode[]; edges: Edge[] } => {
  if (!cue) return { nodes: [], edges: [] };

  const cueMode = cueModeOf(cue);
  const nodePositions = cue.layout?.nodePositions ?? {};
  const nodes: EditorNode[] = [
    ...cue.nodes.events.map(event => ({
      id: event.id,
      type: 'event' as const,
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
      type: 'action' as const,
      position: nodePositions[action.id] ?? { x: 400, y: 100 },
      data: {
        kind: 'action' as const,
        label: `${action.effectType}`,
        payload: action
      }
    })),
    ...(cue.nodes.logic ?? []).map((logic: LogicNode) => ({
      id: logic.id,
      type: 'logic' as const,
      position: nodePositions[logic.id] ?? { x: 260, y: 120 },
      data: {
        kind: 'logic' as const,
        label: logic.logicType,
        payload: logic
      }
    }))
  ];

  const edges: Edge[] = cue.connections.map(connection => ({
    id: `${connection.from}-${connection.to}-${connection.fromPort ?? 'any'}`,
    source: connection.from,
    sourceHandle: connection.fromPort ?? undefined,
    target: connection.to,
    data: {
      fromPort: connection.fromPort ?? null,
      toPort: connection.toPort ?? null
    }
  }));

  return { nodes, edges };
};

const updateDocumentFromFlow = (
  editorDoc: EditorDocument | null,
  currentCueDefinition: CueDefinition | null,
  nodes: EditorNode[],
  edges: Edge[],
  reactFlowInstance: ReactFlowInstance | null
): NodeCueFile | null => {
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
  const logicNodes = nodes.filter(node => node.data.kind === 'logic');
  const validEdges = edges.filter(edge => {
    const sourceNode = nodes.find(node => node.id === edge.source);
    const targetNode = nodes.find(node => node.id === edge.target);
    if (!sourceNode || !targetNode) return false;

    if (sourceNode.data.kind === 'event' && (targetNode.data.kind === 'action' || targetNode.data.kind === 'logic')) {
      return true;
    }
    if (sourceNode.data.kind === 'action' && (targetNode.data.kind === 'action' || targetNode.data.kind === 'logic')) {
      return true;
    }
    if (sourceNode.data.kind === 'logic' && (targetNode.data.kind === 'logic' || targetNode.data.kind === 'action')) {
      return true;
    }
    return false;
  });

  const updatedCue = {
    ...currentCueDefinition,
    nodes: {
      events: eventNodes.map(node => node.data.payload) as (YargEventNode[] | AudioEventNode[]),
      actions: actionNodes.map(node => node.data.payload),
      logic: logicNodes.map(node => node.data.payload as LogicNode)
    },
    connections: validEdges.map(edge => ({
      from: edge.source,
      to: edge.target,
      fromPort: (edge.data as any)?.fromPort ?? undefined,
      toPort: (edge.data as any)?.toPort ?? undefined
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
};

export { cueToFlow, updateDocumentFromFlow };

