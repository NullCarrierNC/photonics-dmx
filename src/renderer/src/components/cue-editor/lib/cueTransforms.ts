import type { Edge, ReactFlowInstance } from 'reactflow';
import type {
  AudioEventNode,
  AudioNodeCueDefinition,
  NodeCueFile,
  NodeCueMode,
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
    }))
  ];

  const edges: Edge[] = cue.connections.map(connection => ({
    id: `${connection.from}-${connection.to}`,
    source: connection.from,
    target: connection.to
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
  const validEdges = edges.filter(edge => {
    const sourceNode = nodes.find(node => node.id === edge.source);
    const targetNode = nodes.find(node => node.id === edge.target);
    if (!sourceNode || !targetNode) return false;

    if (sourceNode.data.kind === 'event' && targetNode.data.kind === 'action') {
      return true;
    }
    if (sourceNode.data.kind === 'action' && targetNode.data.kind === 'action') {
      return true;
    }
    return false;
  });

  const updatedCue = {
    ...currentCueDefinition,
    nodes: {
      events: eventNodes.map(node => node.data.payload) as (YargEventNode[] | AudioEventNode[]),
      actions: actionNodes.map(node => node.data.payload)
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
};

export { cueToFlow, updateDocumentFromFlow };

