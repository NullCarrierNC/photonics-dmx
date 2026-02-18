import React, { useCallback, useEffect, useRef } from 'react';
import { useEdgesState, useNodesState, type Edge } from 'reactflow';
import {
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
  type ArrayLengthLogicNode,
  type ReverseLightsLogicNode,
  type CreatePairsLogicNode,
  type ConcatLightsLogicNode,
  type DebuggerLogicNode,
  type DelayLogicNode,
  type RandomLogicNode,
  type ShuffleLightsLogicNode,
  type ForEachLightLogicNode,
  type YargEventNode,
  type YargNodeCueDefinition,
  type YargEffectDefinition,
  type NotesNode,
  type EffectDefinition
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import { createId, buildDefaultAction } from '../lib/cueDefaults';
import type { EditorNode, EditorNodeData, EventOption, NotesVariant } from '../lib/types';
import { getDefaultEventOption } from '../lib/options';
import { useFlowSync } from './useFlowSync';
import { useEdgeManagement } from './useEdgeManagement';
import { useNodeSelection } from './useNodeSelection';

type UseCueFlowParams = {
  activeMode: NodeCueMode;
  setIsDirty: (dirty: boolean) => void;
  flowWrapperRef?: React.RefObject<HTMLDivElement>;
  effectDefinitions?: Map<string, EffectDefinition>;
};

const useCueFlow = ({ activeMode, setIsDirty, flowWrapperRef, effectDefinitions }: UseCueFlowParams) => {
  const setSelectedNodeIdRef = useRef<(id: string | null) => void>(() => {});
  const [nodes, setNodes, onNodesChange] = useNodesState<EditorNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);

  const flowSync = useFlowSync({
    setNodes,
    setEdges,
    effectDefinitions,
    onCueLoaded: () => setSelectedNodeIdRef.current(null)
  });

  const selection = useNodeSelection({
    nodes,
    setNodes,
    edges,
    setEdges,
    reactFlowInstance: flowSync.reactFlowInstance,
    flowWrapperRef,
    activeMode,
    setIsDirty
  });

  useEffect(() => {
    setSelectedNodeIdRef.current = selection.setSelectedNodeId;
  }, [selection.setSelectedNodeId]);

  const edgeMgmt = useEdgeManagement({ nodes, edges, setEdges, setNodes, setIsDirty });

  const loadCueIntoFlow = useCallback((cue: YargNodeCueDefinition | AudioNodeCueDefinition | YargEffectDefinition | AudioEffectDefinition | null) => {
    flowSync.loadCueIntoFlow(cue);
    selection.setSelectedNodeId(null);
  }, [flowSync.loadCueIntoFlow, selection.setSelectedNodeId]);

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
    } satisfies ConditionalLogicNode),
    random: id => ({
      id,
      type: 'logic',
      logicType: 'random',
      label: 'random',
      outputs: [],
      mode: 'random-integer',
      min: { source: 'literal', value: 0 },
      max: { source: 'literal', value: 1 },
      assignTo: ''
    } satisfies RandomLogicNode as LogicNode),
    'shuffle-lights': id => ({
      id,
      type: 'logic',
      logicType: 'shuffle-lights',
      label: 'shuffle-lights',
      outputs: [],
      sourceVariable: '',
      assignTo: ''
    } satisfies ShuffleLightsLogicNode as LogicNode),
    'for-each-light': id => ({
      id,
      type: 'logic',
      logicType: 'for-each-light',
      label: 'for-each-light',
      outputs: [],
      sourceVariable: '',
      currentLightVariable: '',
      currentIndexVariable: ''
    } satisfies ForEachLightLogicNode as LogicNode)
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

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect: edgeMgmt.onConnect,
    isValidConnection: edgeMgmt.isValidConnection,
    handleNodeSelection: selection.handleNodeSelection,
    handleNodeContextMenu: selection.handleNodeContextMenu,
    handleRemoveNode: selection.handleRemoveNode,
    onEdgeContextMenu: edgeMgmt.onEdgeContextMenu,
    selectedNode: selection.selectedNode,
    selectedActionHasEventParent: selection.selectedActionHasEventParent,
    contextMenu: selection.contextMenu,
    paneContextMenu: selection.paneContextMenu,
    chainDuration: selection.chainDuration,
    addEventNode,
    addActionNode,
    addLogicNode,
    addEventRaiserNode,
    addEventListenerNode,
    addEffectRaiserNode,
    addEffectListenerNode,
    addNotesNode,
    updateSelectedNode: selection.updateSelectedNode,
    loadCueIntoFlow,
    setReactFlowInstance: flowSync.setReactFlowInstance,
    reactFlowInstance: flowSync.reactFlowInstance,
    closeContextMenu: selection.closeContextMenu,
    handlePaneContextMenu: selection.handlePaneContextMenu
  };
};

export { useCueFlow };

