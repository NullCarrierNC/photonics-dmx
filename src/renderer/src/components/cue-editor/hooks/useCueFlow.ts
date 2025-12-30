import { useCallback, useMemo, useState } from 'react';
import { addEdge, useEdgesState, useNodesState, type Connection, type Edge, type ReactFlowInstance } from 'reactflow';
import {
  createDefaultActionTiming,
  type ActionNode,
  type AudioEventNode,
  type AudioNodeCueDefinition,
  type AudioEffectDefinition,
  type EventRaiserNode,
  type EventListenerNode,
  type LogicNode,
  type MathLogicNode,
  type NodeCueMode,
  type NodeEffectType,
  type VariableLogicNode,
  type ConditionalLogicNode,
  type CueDataLogicNode,
  type ConfigDataLogicNode,
  type LightsFromIndexLogicNode,
  type ForLoopLogicNode,
  type WhileLoopLogicNode,
  type ArrayLengthLogicNode,
  type ReverseLightsLogicNode,
  type CreatePairsLogicNode,
  type ConcatLightsLogicNode,
  type YargEventNode,
  type YargNodeCueDefinition,
  type YargEffectDefinition
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { createId, buildDefaultAction } from '../lib/cueDefaults';
import { calculateChainDuration } from '../lib/cueUtils';
import { cueToFlow, effectToFlow } from '../lib/cueTransforms';
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
    // Check if this is an effect or a cue by looking for the 'parameters' property
    const isEffect = cue && 'parameters' in cue;
    
    const { nodes: flowNodes, edges: flowEdges } = isEffect 
      ? effectToFlow(cue as YargEffectDefinition | AudioEffectDefinition)
      : cueToFlow(cue as YargNodeCueDefinition | AudioNodeCueDefinition | null);
    
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

  const addLogicNode = useCallback((logicType: LogicNode['logicType']) => {
    const id = `logic-${createId()}`;

    const payload: LogicNode =
      logicType === 'variable'
        ? ({
            id,
            type: 'logic',
            logicType: 'variable',
            label: 'variable',
            outputs: [],
            mode: 'set',
            varName: 'var1',
            valueType: 'number',
            value: { source: 'literal', value: 0 }
          } satisfies VariableLogicNode)
        : logicType === 'math'
          ? ({
              id,
              type: 'logic',
              logicType: 'math',
              label: 'math',
              outputs: [],
              operator: 'add',
              left: { source: 'literal', value: 0 },
              right: { source: 'literal', value: 0 },
              assignTo: 'result'
            } satisfies MathLogicNode)
          : logicType === 'cue-data'
            ? ({
                id,
                type: 'logic',
                logicType: 'cue-data',
                label: 'cue-data',
                outputs: [],
                dataProperty: 'execution-count',
                assignTo: undefined
              } satisfies CueDataLogicNode as LogicNode)
            : logicType === 'config-data'
              ? ({
                  id,
                  type: 'logic',
                  logicType: 'config-data',
                  label: 'config-data',
                  outputs: [],
                  dataProperty: 'total-lights',
                  assignTo: undefined
                } satisfies ConfigDataLogicNode as LogicNode)
              : logicType === 'lights-from-index'
                ? ({
                    id,
                    type: 'logic',
                    logicType: 'lights-from-index',
                    label: 'lights-from-index',
                    outputs: [],
                    sourceVariable: '',
                    index: { source: 'literal', value: 0 },
                    assignTo: ''
                  } satisfies LightsFromIndexLogicNode as LogicNode)
                : logicType === 'for-loop'
                  ? ({
                      id,
                      type: 'logic',
                      logicType: 'for-loop',
                      label: 'for-loop',
                      outputs: [],
                      start: { source: 'literal', value: 0 },
                      end: { source: 'literal', value: 10 },
                      step: { source: 'literal', value: 1 },
                      counterVariable: ''
                    } satisfies ForLoopLogicNode as LogicNode)
                  : logicType === 'while-loop'
                    ? ({
                        id,
                        type: 'logic',
                        logicType: 'while-loop',
                        label: 'while-loop',
                        outputs: [],
                        comparator: '<',
                        left: { source: 'literal', value: 0 },
                        right: { source: 'literal', value: 10 },
                        maxIterations: { source: 'literal', value: 1000 }
                      } satisfies WhileLoopLogicNode as LogicNode)
                    : logicType === 'array-length'
                      ? ({
                          id,
                          type: 'logic',
                          logicType: 'array-length',
                          label: 'array-length',
                          outputs: [],
                          sourceVariable: '',
                          assignTo: ''
                        } satisfies ArrayLengthLogicNode as LogicNode)
                      : logicType === 'reverse-lights'
                        ? ({
                            id,
                            type: 'logic',
                            logicType: 'reverse-lights',
                            label: 'reverse-lights',
                            outputs: [],
                            sourceVariable: '',
                            assignTo: ''
                          } satisfies ReverseLightsLogicNode as LogicNode)
                        : logicType === 'create-pairs'
                          ? ({
                              id,
                              type: 'logic',
                              logicType: 'create-pairs',
                              label: 'create-pairs',
                              outputs: [],
                              pairType: 'opposite',
                              sourceVariable: '',
                              assignTo: ''
                            } satisfies CreatePairsLogicNode as LogicNode)
                          : logicType === 'concat-lights'
                            ? ({
                                id,
                                type: 'logic',
                                logicType: 'concat-lights',
                                label: 'concat-lights',
                                outputs: [],
                                sourceVariables: [],
                                assignTo: ''
                              } satisfies ConcatLightsLogicNode as LogicNode)
                            : ({
                                id,
                                type: 'logic',
                                logicType: 'conditional',
                                label: 'conditional',
                                outputs: [],
                                comparator: '>',
                                left: { source: 'literal', value: 0 },
                                right: { source: 'literal', value: 0 }
                              } satisfies ConditionalLogicNode);

    const newNode: EditorNode = {
      id,
      type: 'logic',
      position: {
        x: 320,
        y: 120 + nodes.length * 40
      },
      data: {
        kind: 'logic',
        label: logicType,
        payload
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [nodes.length, setIsDirty, setNodes]);

  const addEventRaiserNode = useCallback(() => {
    const id = `event-raiser-${createId()}`;
    const payload: EventRaiserNode = {
      id,
      type: 'event-raiser',
      eventName: '', // Empty by default, user selects in property inspector
      label: 'Raise Event',
      inputs: [],
      outputs: []
    };

    const newNode: EditorNode = {
      id,
      type: 'event-raiser',
      position: {
        x: 320,
        y: 200 + nodes.length * 40
      },
      data: {
        kind: 'event-raiser',
        label: 'Raise Event',
        payload
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [nodes.length, setIsDirty, setNodes]);

  const addEventListenerNode = useCallback(() => {
    const id = `event-listener-${createId()}`;
    const payload: EventListenerNode = {
      id,
      type: 'event-listener',
      eventName: '', // Empty by default, user selects in property inspector
      label: 'Listen Event',
      outputs: []
    };

    const newNode: EditorNode = {
      id,
      type: 'event-listener',
      position: {
        x: 120,
        y: 280 + nodes.length * 40
      },
      data: {
        kind: 'event-listener',
        label: 'Listen Event',
        payload
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [nodes.length, setIsDirty, setNodes]);

  const addEffectRaiserNode = useCallback(() => {
    const id = `effect-raiser-${createId()}`;
    const payload: import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectRaiserNode = {
      id,
      type: 'effect-raiser',
      effectId: '',
      label: 'Raise Effect',
      outputs: []
    };

    const newNode: EditorNode = {
      id,
      type: 'effect-raiser',
      position: {
        x: 120,
        y: 280 + nodes.length * 40
      },
      data: {
        kind: 'effect-raiser',
        label: 'Raise Effect',
        payload
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [nodes.length, setIsDirty, setNodes]);

  const addEffectListenerNode = useCallback(() => {
    const id = `effect-listener-${createId()}`;
    const payload: import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectEventListenerNode = {
      id,
      type: 'effect-listener',
      label: 'Effect Entry',
      outputs: []
    };

    const newNode: EditorNode = {
      id,
      type: 'effect-listener',
      position: {
        x: 120,
        y: 80
      },
      data: {
        kind: 'effect-listener',
        label: 'Effect Entry',
        payload
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

    // Event listeners and Effect listeners can only be sources (no inputs allowed)
    if (targetNode.data.kind === 'event-listener' || targetNode.data.kind === 'effect-listener') {
      return false;
    }

    // Valid target types for all nodes
    const validTargets = ['action', 'logic', 'event-raiser', 'effect-raiser'];
    
    // Event nodes can connect to actions, logic, event raisers, and effect raisers
    if (sourceNode.data.kind === 'event' && validTargets.includes(targetNode.data.kind)) {
      return true;
    }
    
    // Logic nodes can connect to actions, logic, event raisers, and effect raisers
    if (sourceNode.data.kind === 'logic' && validTargets.includes(targetNode.data.kind)) {
      return true;
    }
    
    // Action nodes can connect to actions, logic, event raisers, and effect raisers
    if (sourceNode.data.kind === 'action' && validTargets.includes(targetNode.data.kind)) {
      return true;
    }
    
    // Event raiser nodes can connect to actions, logic, event raisers, and effect raisers
    if (sourceNode.data.kind === 'event-raiser' && validTargets.includes(targetNode.data.kind)) {
      return true;
    }
    
    // Effect raiser nodes can connect to actions, logic, event raisers, and effect raisers
    if (sourceNode.data.kind === 'effect-raiser' && validTargets.includes(targetNode.data.kind)) {
      return true;
    }
    
    // Event listener nodes can connect to actions, logic, event raisers, and effect raisers
    if (sourceNode.data.kind === 'event-listener' && validTargets.includes(targetNode.data.kind)) {
      return true;
    }
    
    // Effect listener nodes can connect to actions, logic, event raisers, and effect raisers (for internal effect communication)
    if (sourceNode.data.kind === 'effect-listener' && validTargets.includes(targetNode.data.kind)) {
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

      if (targetNode.data.kind === 'action') {
        const targetAction = { ...(targetNode.data.payload as ActionNode) };

        if (sourceNode.data.kind === 'event') {
          const sourceEvent = sourceNode.data.payload as YargEventNode | AudioEventNode;
          targetAction.timing = {
            ...createDefaultActionTiming(),
            ...(targetAction.timing ?? {}),
            waitForCondition: sourceEvent.eventType as any,
            waitForTime: { source: 'literal', value: 0 }
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
      }

      return prevNodes;
    });

    const sourceNode = nodes.find(n => n.id === connection.source);
    let fromPort: string | null = null;
    if (connection.sourceHandle) {
      fromPort = connection.sourceHandle;
    } else if (sourceNode?.data.kind === 'logic') {
      const logicPayload = sourceNode.data.payload as LogicNode;
      if (logicPayload.logicType === 'conditional') {
        const existingEdges = edges.filter(e => e.source === sourceNode.id);
        if (existingEdges.length === 0) {
          fromPort = 'true';
        } else if (existingEdges.length === 1) {
          fromPort = 'false';
        }
      }
    }

    setEdges(eds => addEdge({ ...connection, type: 'default', data: { fromPort } }, eds));
    setIsDirty(true);
  }, [edges, isValidNodeConnection, nodes, setEdges, setIsDirty, setNodes]);

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

  const updateSelectedNode = useCallback(<T extends YargEventNode | AudioEventNode | ActionNode | LogicNode | EventRaiserNode | EventListenerNode | import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectRaiserNode | import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectEventListenerNode>(updates: Partial<T>) => {
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
              : node.data.kind === 'logic'
                ? (nextPayload as LogicNode).logicType
                : node.data.kind === 'event-raiser'
                  ? (nextPayload as EventRaiserNode).eventName ? `Raise: ${(nextPayload as EventRaiserNode).eventName}` : 'Raise Event'
                  : (nextPayload as EventListenerNode).eventName ? `Listen: ${(nextPayload as EventListenerNode).eventName}` : 'Listen Event'
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
  };
};

export { useCueFlow };

