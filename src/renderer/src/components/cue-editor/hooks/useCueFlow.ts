import React, { useCallback, useEffect, useRef } from 'react';
import { useEdgesState, useNodesState, type Edge } from 'reactflow';
import type {
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  NodeCueMode,
  YargNodeCueDefinition,
  YargEffectDefinition,
  EffectDefinition
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EditorNodeData } from '../lib/types';
import { useFlowSync } from './useFlowSync';
import { useEdgeManagement } from './useEdgeManagement';
import { useNodeSelection } from './useNodeSelection';
import { useNodeCreation } from './useNodeCreation';

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

  const nodeCreation = useNodeCreation({ nodes, setNodes, activeMode, setIsDirty });

  const loadCueIntoFlow = useCallback(
    (
      cue:
        | YargNodeCueDefinition
        | AudioNodeCueDefinition
        | YargEffectDefinition
        | AudioEffectDefinition
        | null
    ) => {
      flowSync.loadCueIntoFlow(cue);
      selection.setSelectedNodeId(null);
    },
    [flowSync.loadCueIntoFlow, selection.setSelectedNodeId]
  );

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
    addEventNode: nodeCreation.addEventNode,
    addActionNode: nodeCreation.addActionNode,
    addLogicNode: nodeCreation.addLogicNode,
    addEventRaiserNode: nodeCreation.addEventRaiserNode,
    addEventListenerNode: nodeCreation.addEventListenerNode,
    addEffectRaiserNode: nodeCreation.addEffectRaiserNode,
    addEffectListenerNode: nodeCreation.addEffectListenerNode,
    addNotesNode: nodeCreation.addNotesNode,
    updateSelectedNode: selection.updateSelectedNode,
    loadCueIntoFlow,
    setReactFlowInstance: flowSync.setReactFlowInstance,
    reactFlowInstance: flowSync.reactFlowInstance,
    closeContextMenu: selection.closeContextMenu,
    handlePaneContextMenu: selection.handlePaneContextMenu
  };
};

export { useCueFlow };
