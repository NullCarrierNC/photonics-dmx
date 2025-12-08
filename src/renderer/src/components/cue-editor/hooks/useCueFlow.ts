import { useCallback, useMemo, useState } from 'react';
import { addEdge, useEdgesState, useNodesState, type Connection, type Edge, type ReactFlowInstance } from 'reactflow';
import {
  createDefaultActionTiming,
  type ActionNode,
  type AudioEventNode,
  type NodeCueMode,
  type NodeEffectType,
  type YargEventNode
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { createId, buildDefaultAction } from '../lib/cueDefaults';
import { calculateChainDuration } from '../lib/cueUtils';
import { cueToFlow } from '../lib/cueTransforms';
import type { EditorNode, EditorNodeData, EventOption } from '../lib/types';
import { getDefaultEventOption } from '../lib/options';

type UseCueFlowParams = {
  activeMode: NodeCueMode;
  setIsDirty: (dirty: boolean) => void;
};

const useCueFlow = ({ activeMode, setIsDirty }: UseCueFlowParams) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<EditorNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

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
  }, [setEdges, setIsDirty]);

  const chainDuration = useMemo(() => calculateChainDuration(nodes, edges), [nodes, edges]);

  const loadCueIntoFlow = useCallback((cue: any) => {
    const { nodes: flowNodes, edges: flowEdges } = cueToFlow(cue);
    setNodes(flowNodes);
    setEdges(flowEdges);
    setSelectedNodeId(null);
  }, [setEdges, setNodes]);

  const addEventNode = useCallback((option?: EventOption<YargEventNode['eventType'] | AudioEventNode['eventType']>) => {
    const nodeMode = activeMode;
    const newEventId = `event-${createId()}`;
    const defaultOption = option ?? getDefaultEventOption(nodeMode);
    const newNode: EditorNode = {
      id: newEventId,
      type: 'event',
      position: {
        x: 120,
        y: 80 + nodes.length * 40
      },
      data: {
        kind: 'event',
        label: defaultOption.label,
        payload: nodeMode === 'yarg'
          ? { id: newEventId, type: 'event', eventType: defaultOption.value as YargEventNode['eventType'] }
          : { id: newEventId, type: 'event', eventType: defaultOption.value as AudioEventNode['eventType'], threshold: 0.5, triggerMode: 'edge' }
      }
    };
    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [activeMode, nodes.length, setIsDirty, setNodes]);

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
  }, [nodes.length, setIsDirty, setNodes]);

  const isValidNodeConnection = useCallback((sourceId?: string | null, targetId?: string | null) => {
    if (!sourceId || !targetId || sourceId === targetId) {
      return false;
    }
    const sourceNode = nodes.find(node => node.id === sourceId);
    const targetNode = nodes.find(node => node.id === targetId);
    if (!sourceNode || !targetNode) {
      return false;
    }
    if (sourceNode.data.kind === 'event' && targetNode.data.kind === 'action') {
      return true;
    }
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
  }, [isValidNodeConnection, setEdges, setIsDirty, setNodes]);

  const isValidConnection = useCallback((connection: Connection) => {
    return isValidNodeConnection(connection.source, connection.target);
  }, [isValidNodeConnection]);

  const handleNodeSelection = useCallback(({ nodes: selected }: { nodes: EditorNode[] }) => {
    setSelectedNodeId(selected[0]?.id ?? null);
    setContextMenu(null);
  }, []);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: EditorNode) => {
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement)?.getBoundingClientRect?.();
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
  }, [setEdges, setIsDirty, setNodes]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const updateSelectedNode = useCallback(<T extends YargEventNode | AudioEventNode | ActionNode>(updates: Partial<T>) => {
    if (!selectedNodeId) return;
    const nodeMode = activeMode;
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
              ? (nextPayload as YargEventNode).eventType
              : (nextPayload as AudioEventNode).eventType
            : node.data.kind === 'action'
              ? (nextPayload as ActionNode).effectType
              : node.data.label
        }
      };
    }));
    setIsDirty(true);
  }, [activeMode, selectedNodeId, setNodes, setIsDirty]);

  return {
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
    updateSelectedNode,
    loadCueIntoFlow,
    setReactFlowInstance,
    reactFlowInstance,
    closeContextMenu
  };
};

export { useCueFlow };

