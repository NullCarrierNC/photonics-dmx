import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  type DebuggerLogicNode,
  type DelayLogicNode,
  type YargEventNode,
  type YargNodeCueDefinition,
  type YargEffectDefinition,
  type NotesNode,
  type EffectDefinition,
  type VariableDefinition,
  type ValueSource
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { createId, buildDefaultAction } from '../lib/cueDefaults';
import { calculateChainDuration } from '../lib/cueUtils';
import { cueToFlow, effectToFlow } from '../lib/cueTransforms';
import type { EditorNode, EditorNodeData, EventOption, NotesVariant } from '../lib/types';
import { getDefaultEventOption } from '../lib/options';

type UseCueFlowParams = {
  activeMode: NodeCueMode;
  setIsDirty: (dirty: boolean) => void;
  flowWrapperRef?: React.RefObject<HTMLDivElement>;
  effectDefinitions?: Map<string, EffectDefinition>;
};

const useCueFlow = ({ activeMode, setIsDirty, flowWrapperRef, effectDefinitions }: UseCueFlowParams) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<EditorNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [paneContextMenu, setPaneContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(node => node.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  const selectedActionHasEventParent = useMemo(() => {
    if (!selectedNode || selectedNode.data.kind !== 'action') return false;
    return edges.some(edge => edge.target === selectedNode.id && nodes.find(n => n.id === edge.source)?.data.kind === 'event');
  }, [edges, nodes, selectedNode]);

  const areParameterDefinitionsEqual = (
    left?: VariableDefinition[],
    right?: VariableDefinition[]
  ): boolean => {
    if (left === right) return true;
    if (!left || !right) return false;
    if (left.length !== right.length) return false;
    return left.every((leftDef, index) => {
      const rightDef = right[index];
      if (!rightDef) return false;
      return (
        leftDef.name === rightDef.name &&
        leftDef.type === rightDef.type &&
        leftDef.scope === rightDef.scope &&
        leftDef.isParameter === rightDef.isParameter &&
        leftDef.description === rightDef.description &&
        leftDef.initialValue === rightDef.initialValue
      );
    });
  };

  const buildDefaultValueSource = (def: VariableDefinition): ValueSource => ({
    source: 'literal',
    value: def.initialValue
  });

  useEffect(() => {
    if (!effectDefinitions || effectDefinitions.size === 0) return;

    setNodes(prevNodes => {
      let didChange = false;
      const nextNodes = prevNodes.map(node => {
        if (node.data.kind !== 'effect-raiser') return node;
        const raiser = node.data.payload as import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectRaiserNode;
        if (!raiser.effectId) return node;

        const effectDef = effectDefinitions.get(raiser.effectId);
        if (!effectDef) return node;

        const parameterDefinitions = effectDef.variables?.filter(v => v.isParameter) ?? [];
        const existingDefinitions = (node.data as any).parameterDefinitions as VariableDefinition[] | undefined;
        const definitionsChanged = !areParameterDefinitionsEqual(existingDefinitions, parameterDefinitions);

        const nextParameterValues: Record<string, ValueSource> = { ...(raiser.parameterValues ?? {}) };
        let valuesChanged = false;
        for (const paramDef of parameterDefinitions) {
          if (nextParameterValues[paramDef.name] === undefined) {
            nextParameterValues[paramDef.name] = buildDefaultValueSource(paramDef);
            valuesChanged = true;
          }
        }

        const nextEffectName = effectDef.name || (node.data as any).effectName || raiser.effectId || 'none';
        const effectNameChanged = nextEffectName !== (node.data as any).effectName;

        if (!definitionsChanged && !valuesChanged && !effectNameChanged) {
          return node;
        }

        didChange = true;
        return {
          ...node,
          data: {
            ...node.data,
            label: `Effect: ${nextEffectName}`,
            payload: valuesChanged ? { ...raiser, parameterValues: nextParameterValues } : raiser,
            effectName: nextEffectName,
            parameterDefinitions
          }
        };
      });

      return didChange ? nextNodes : prevNodes;
    });
  }, [effectDefinitions, setNodes]);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setEdges(prev => prev.filter(e => e.id !== edge.id));
    setIsDirty(true);
  }, [setEdges, setIsDirty]);

  const chainDuration = useMemo(() => calculateChainDuration(nodes, edges), [nodes, edges]);

  const loadCueIntoFlow = useCallback((cue: any) => {
    // Check if this is an effect or a cue by looking for effectListeners in nodes
    // Effects have effectListeners property, cues don't (cues use effectRaisers instead)
    // Also check for 'parameters' property as a fallback for backward compatibility
    const isEffect = cue && cue.nodes && (
      'effectListeners' in cue.nodes || 
      'parameters' in cue
    );
    
    const { nodes: flowNodes, edges: flowEdges } = isEffect 
      ? effectToFlow(cue as YargEffectDefinition | AudioEffectDefinition)
      : cueToFlow(cue as YargNodeCueDefinition | AudioNodeCueDefinition | null, effectDefinitions);
    
    setNodes(flowNodes);
    setEdges(flowEdges);
    setSelectedNodeId(null);
  }, [setEdges, setNodes, effectDefinitions]);

  // Helper function to find a good position for a new node, avoiding overlaps
  const findAvailablePosition = useCallback((preferredX: number, preferredY: number, nodeWidth: number = 150, nodeHeight: number = 80, useExactPosition: boolean = false): { x: number; y: number } => {
    const padding = 20;
    const gridSize = 50;
    
    // Check for overlaps with existing nodes
    const checkOverlap = (posX: number, posY: number): boolean => {
      return nodes.some(node => {
        const nodeRight = node.position.x + nodeWidth;
        const nodeBottom = node.position.y + nodeHeight;
        const newRight = posX + nodeWidth;
        const newBottom = posY + nodeHeight;
        
        return !(
          posX >= nodeRight + padding ||
          newRight <= node.position.x - padding ||
          posY >= nodeBottom + padding ||
          newBottom <= node.position.y - padding
        );
      });
    };
    
    // If exact position is requested (e.g., from context menu), try to use it as-is first
    if (useExactPosition) {
      // Try exact position first
      if (!checkOverlap(preferredX, preferredY)) {
        return { x: preferredX, y: preferredY };
      }
      
      // If exact position overlaps, try small offsets around it
      const smallOffsets = [
        { x: 0, y: 0 },
        { x: nodeWidth + padding, y: 0 },
        { x: -(nodeWidth + padding), y: 0 },
        { x: 0, y: nodeHeight + padding },
        { x: 0, y: -(nodeHeight + padding) },
      ];
      
      for (const offset of smallOffsets) {
        const testX = preferredX + offset.x;
        const testY = preferredY + offset.y;
        if (!checkOverlap(testX, testY)) {
          return { x: testX, y: testY };
        }
      }
    }
    
    // Default behavior: snap to grid
    let x = Math.round(preferredX / gridSize) * gridSize;
    let y = Math.round(preferredY / gridSize) * gridSize;
    
    // If preferred position is available, use it
    if (!checkOverlap(x, y)) {
      return { x, y };
    }
    
    // Try positions in a spiral pattern
    const maxAttempts = 50;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const radius = attempt * gridSize;
      const positions = [
        { x: preferredX + radius, y: preferredY },
        { x: preferredX - radius, y: preferredY },
        { x: preferredX, y: preferredY + radius },
        { x: preferredX, y: preferredY - radius },
        { x: preferredX + radius, y: preferredY + radius },
        { x: preferredX - radius, y: preferredY - radius },
        { x: preferredX + radius, y: preferredY - radius },
        { x: preferredX - radius, y: preferredY + radius },
      ];
      
      for (const pos of positions) {
        const gridX = Math.round(pos.x / gridSize) * gridSize;
        const gridY = Math.round(pos.y / gridSize) * gridSize;
        if (!checkOverlap(gridX, gridY)) {
          return { x: gridX, y: gridY };
        }
      }
    }
    
    // Fallback: find the rightmost node and place to its right
    if (nodes.length > 0) {
      const rightmostNode = nodes.reduce((prev, curr) => 
        curr.position.x > prev.position.x ? curr : prev
      );
      return { x: rightmostNode.position.x + nodeWidth + padding, y: rightmostNode.position.y };
    }
    
    return { x, y };
  }, [nodes]);

  const addEventNode = useCallback((option?: EventOption<YargEventNode['eventType'] | AudioEventNode['eventType']>, position?: { x: number; y: number }) => {
    const nodeMode = activeMode;
    const newEventId = `event-${createId()}`;
    const defaultOption = option ?? getDefaultEventOption(nodeMode);
    // Center the node on the cursor position if provided
    const nodeWidth = 150;
    const nodeHeight = 80;
    const centeredPosition = position ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 } : undefined;
    const pos = centeredPosition ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true) : findAvailablePosition(120, 80);
    const newNode: EditorNode = {
      id: newEventId,
      type: 'event',
      position: pos,
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
  }, [activeMode, findAvailablePosition, setIsDirty, setNodes]);

  const addActionNode = useCallback((effectType: NodeEffectType, position?: { x: number; y: number }) => {
    const action = { ...buildDefaultAction(), id: `action-${createId()}`, effectType };
    if (effectType === 'chase') {
      action.config = { ...action.config, perLightOffsetMs: 50, order: 'linear' };
    }
    // Center the node on the cursor position if provided
    const nodeWidth = 150;
    const nodeHeight = 80;
    const centeredPosition = position ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 } : undefined;
    const pos = centeredPosition ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true) : findAvailablePosition(480, 160);
    const newNode: EditorNode = {
      id: action.id,
      type: 'action',
      position: pos,
      data: {
        kind: 'action',
        label: effectType,
        payload: action
      }
    };
    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [nodes.length, setIsDirty, setNodes]);

  const logicNodeFactories: Record<LogicNode['logicType'], (id: string) => LogicNode> = {
    variable: id => ({
      id,
      type: 'logic',
      logicType: 'variable',
      label: 'variable',
      outputs: [],
      mode: 'set',
      varName: 'var1',
      valueType: 'number',
      value: { source: 'literal', value: 0 }
    } satisfies VariableLogicNode),
    math: id => ({
      id,
      type: 'logic',
      logicType: 'math',
      label: 'math',
      outputs: [],
      operator: 'add',
      left: { source: 'literal', value: 0 },
      right: { source: 'literal', value: 0 },
      assignTo: 'result'
    } satisfies MathLogicNode),
    'cue-data': id => ({
      id,
      type: 'logic',
      logicType: 'cue-data',
      label: 'cue-data',
      outputs: [],
      dataProperty: 'execution-count',
      assignTo: undefined
    } satisfies CueDataLogicNode as LogicNode),
    'config-data': id => ({
      id,
      type: 'logic',
      logicType: 'config-data',
      label: 'config-data',
      outputs: [],
      dataProperty: 'total-lights',
      assignTo: undefined
    } satisfies ConfigDataLogicNode as LogicNode),
    'lights-from-index': id => ({
      id,
      type: 'logic',
      logicType: 'lights-from-index',
      label: 'lights-from-index',
      outputs: [],
      sourceVariable: '',
      index: { source: 'literal', value: 0 },
      assignTo: ''
    } satisfies LightsFromIndexLogicNode as LogicNode),
    'for-loop': id => ({
      id,
      type: 'logic',
      logicType: 'for-loop',
      label: 'for-loop',
      outputs: [],
      start: { source: 'literal', value: 0 },
      end: { source: 'literal', value: 10 },
      step: { source: 'literal', value: 1 },
      counterVariable: ''
    } satisfies ForLoopLogicNode as LogicNode),
    'while-loop': id => ({
      id,
      type: 'logic',
      logicType: 'while-loop',
      label: 'while-loop',
      outputs: [],
      comparator: '<',
      left: { source: 'literal', value: 0 },
      right: { source: 'literal', value: 10 },
      maxIterations: { source: 'literal', value: 1000 }
    } satisfies WhileLoopLogicNode as LogicNode),
    'array-length': id => ({
      id,
      type: 'logic',
      logicType: 'array-length',
      label: 'array-length',
      outputs: [],
      sourceVariable: '',
      assignTo: ''
    } satisfies ArrayLengthLogicNode as LogicNode),
    'reverse-lights': id => ({
      id,
      type: 'logic',
      logicType: 'reverse-lights',
      label: 'reverse-lights',
      outputs: [],
      sourceVariable: '',
      assignTo: ''
    } satisfies ReverseLightsLogicNode as LogicNode),
    'create-pairs': id => ({
      id,
      type: 'logic',
      logicType: 'create-pairs',
      label: 'create-pairs',
      outputs: [],
      pairType: 'opposite',
      sourceVariable: '',
      assignTo: ''
    } satisfies CreatePairsLogicNode as LogicNode),
    'concat-lights': id => ({
      id,
      type: 'logic',
      logicType: 'concat-lights',
      label: 'concat-lights',
      outputs: [],
      sourceVariables: [],
      assignTo: ''
    } satisfies ConcatLightsLogicNode as LogicNode),
    delay: id => ({
      id,
      type: 'logic',
      logicType: 'delay',
      label: 'delay',
      outputs: [],
      delayTime: { source: 'literal', value: 1000 }
    } satisfies DelayLogicNode as LogicNode),
    debugger: id => ({
      id,
      type: 'logic',
      logicType: 'debugger',
      label: 'debugger',
      outputs: [],
      message: { source: 'literal', value: 'Debug message' },
      variablesToLog: []
    } satisfies DebuggerLogicNode as LogicNode),
    conditional: id => ({
      id,
      type: 'logic',
      logicType: 'conditional',
      label: 'conditional',
      outputs: [],
      comparator: '>',
      left: { source: 'literal', value: 0 },
      right: { source: 'literal', value: 0 }
    } satisfies ConditionalLogicNode)
  };

  const addLogicNode = useCallback((logicType: LogicNode['logicType'], position?: { x: number; y: number }) => {
    const id = `logic-${createId()}`;
    const payload = logicNodeFactories[logicType](id);

    // Center the node on the cursor position if provided
    const nodeWidth = 150;
    const nodeHeight = 80;
    const centeredPosition = position ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 } : undefined;
    const pos = centeredPosition ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true) : findAvailablePosition(320, 120);
    const newNode: EditorNode = {
      id,
      type: 'logic',
      position: pos,
      data: {
        kind: 'logic',
        label: logicType,
        payload
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [findAvailablePosition, setIsDirty, setNodes]);

  const addEventRaiserNode = useCallback((position?: { x: number; y: number }) => {
    const id = `event-raiser-${createId()}`;
    const payload: EventRaiserNode = {
      id,
      type: 'event-raiser',
      eventName: '', // Empty by default, user selects in property inspector
      label: 'Raise Event',
      inputs: [],
      outputs: []
    };

    // Center the node on the cursor position if provided
    const nodeWidth = 150;
    const nodeHeight = 80;
    const centeredPosition = position ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 } : undefined;
    const pos = centeredPosition ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true) : findAvailablePosition(320, 200);
    const newNode: EditorNode = {
      id,
      type: 'event-raiser',
      position: pos,
      data: {
        kind: 'event-raiser',
        label: 'Raise Event',
        payload
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [findAvailablePosition, setIsDirty, setNodes]);

  const addEventListenerNode = useCallback((position?: { x: number; y: number }) => {
    const id = `event-listener-${createId()}`;
    const payload: EventListenerNode = {
      id,
      type: 'event-listener',
      eventName: '', // Empty by default, user selects in property inspector
      label: 'Listen Event',
      outputs: []
    };

    // Center the node on the cursor position if provided
    const nodeWidth = 150;
    const nodeHeight = 80;
    const centeredPosition = position ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 } : undefined;
    const pos = centeredPosition ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true) : findAvailablePosition(120, 280);
    const newNode: EditorNode = {
      id,
      type: 'event-listener',
      position: pos,
      data: {
        kind: 'event-listener',
        label: 'Listen Event',
        payload
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [findAvailablePosition, setIsDirty, setNodes]);

  const addEffectRaiserNode = useCallback((position?: { x: number; y: number }) => {
    const id = `effect-raiser-${createId()}`;
    const payload: import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectRaiserNode = {
      id,
      type: 'effect-raiser',
      effectId: '',
      label: 'Raise Effect',
      outputs: []
    };

    // Center the node on the cursor position if provided
    const nodeWidth = 150;
    const nodeHeight = 80;
    const centeredPosition = position ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 } : undefined;
    const pos = centeredPosition ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true) : findAvailablePosition(120, 280);
    const newNode: EditorNode = {
      id,
      type: 'effect-raiser',
      position: pos,
      data: {
        kind: 'effect-raiser',
        label: 'Raise Effect',
        payload
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [findAvailablePosition, setIsDirty, setNodes]);

  const addEffectListenerNode = useCallback((position?: { x: number; y: number }) => {
    const id = `effect-listener-${createId()}`;
    const payload: import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectEventListenerNode = {
      id,
      type: 'effect-listener',
      label: 'Effect Entry',
      outputs: []
    };

    // Center the node on the cursor position if provided
    const nodeWidth = 150;
    const nodeHeight = 80;
    const centeredPosition = position ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 } : undefined;
    const pos = centeredPosition ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true) : findAvailablePosition(120, 80);
    const newNode: EditorNode = {
      id,
      type: 'effect-listener',
      position: pos,
      data: {
        kind: 'effect-listener',
        label: 'Effect Entry',
        payload
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [findAvailablePosition, setIsDirty, setNodes]);

  const addNotesNode = useCallback((variant: NotesVariant = 'notes', position?: { x: number; y: number }) => {
    const normalizedVariant = variant.toLowerCase() as NotesVariant;
    const label = normalizedVariant === 'info' ? 'Info' : normalizedVariant === 'important' ? 'Important' : 'Notes';
    const id = `notes-${createId()}`;
    const payload: NotesNode = {
      id,
      type: 'notes',
      label,
      note: '',
      style: normalizedVariant
    };

    // Center the node on the cursor position if provided
    // Notes nodes are wider than regular nodes
    const nodeWidth = 240;
    const nodeHeight = 80;
    const centeredPosition = position ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 } : undefined;
    const pos = centeredPosition ? findAvailablePosition(centeredPosition.x, centeredPosition.y, nodeWidth, nodeHeight, true) : findAvailablePosition(320, 240);
    const newNode: EditorNode = {
      id,
      type: 'notes',
      position: pos,
      data: {
        kind: 'notes',
        label,
        payload
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [findAvailablePosition, setIsDirty, setNodes]);

  const isValidNodeConnection = useCallback((sourceId?: string | null, targetId?: string | null) => {
    if (!sourceId || !targetId || sourceId === targetId) {
      return false;
    }
    const sourceNode = nodes.find(node => node.id === sourceId);
    const targetNode = nodes.find(node => node.id === targetId);
    if (!sourceNode || !targetNode) {
      return false;
    }

    // Notes nodes cannot have any connections (no inputs or outputs)
    if (sourceNode.data.kind === 'notes' || targetNode.data.kind === 'notes') {
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
          // Event nodes are graph entry points. For song-driven events (beat/keyframe/etc) we can
          // optionally mirror the event onto the action's waitForCondition. For system events
          // (cue-started/cue-called) we MUST NOT write them into action timing (schema/runtime),
          // so we default to 'none'.
          const inheritedWaitForCondition =
            sourceEvent.eventType === 'cue-started' || sourceEvent.eventType === 'cue-called'
              ? 'none'
              : (sourceEvent.eventType as any);
          targetAction.timing = {
            ...createDefaultActionTiming(),
            ...(targetAction.timing ?? {}),
            waitForCondition: inheritedWaitForCondition,
            waitForTime: { source: 'literal', value: 0 }
          };
        } else if (sourceNode.data.kind === 'action') {
          const sourceAction = sourceNode.data.payload as ActionNode;
          targetAction.color = { ...sourceAction.color };
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
    // Use viewport coordinates for fixed positioning
    const x = event.clientX;
    const y = event.clientY;
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

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setPaneContextMenu(null);
  }, []);

  const handlePaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    if (!reactFlowInstance) return;
    
    const clientX = event.clientX;
    const clientY = event.clientY;
    
    // Convert client coordinates to flow coordinates
    // screenToFlowPosition handles the container offset and viewport transform internally
    const flowPosition = reactFlowInstance.screenToFlowPosition({
      x: clientX,
      y: clientY
    });
    
    // Estimate menu height: max possible items (~20px each) + headers (~24px each) + padding
    // Worst case: ~6 sections * 24px + ~20 items * 20px + padding = ~544px
    // Use max-h-[80vh] as the limit, so estimate based on that
    const maxMenuHeight = window.innerHeight * 0.8;
    const estimatedMenuHeight = Math.min(600, maxMenuHeight); // Conservative estimate
    const menuWidth = 200; // Estimated menu width
    
    // Adjust position to prevent overflow
    let adjustedX = clientX;
    let adjustedY = clientY;
    
    // Check bottom overflow
    if (clientY + estimatedMenuHeight > window.innerHeight) {
      adjustedY = window.innerHeight - estimatedMenuHeight - 10; // 10px padding from bottom
      // Don't go above the top
      if (adjustedY < 10) {
        adjustedY = 10;
      }
    }
    
    // Check right overflow
    if (clientX + menuWidth > window.innerWidth) {
      adjustedX = window.innerWidth - menuWidth - 10; // 10px padding from right
      // Don't go off the left edge
      if (adjustedX < 10) {
        adjustedX = 10;
      }
    }
    
    // Check left overflow
    if (adjustedX < 0) {
      adjustedX = 10;
    }
    
    setPaneContextMenu({
      x: adjustedX,
      y: adjustedY,
      flowX: flowPosition.x,
      flowY: flowPosition.y
    });
  }, [reactFlowInstance, flowWrapperRef]);

  const updateSelectedNode = useCallback(<T extends YargEventNode | AudioEventNode | ActionNode | LogicNode | EventRaiserNode | EventListenerNode | import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectRaiserNode | import('../../../../../photonics-dmx/cues/types/nodeCueTypes').EffectEventListenerNode | NotesNode>(updates: Partial<T>) => {
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
  };
};

export { useCueFlow };

