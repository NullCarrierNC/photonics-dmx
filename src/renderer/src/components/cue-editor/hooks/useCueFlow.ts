import React, { useCallback, useEffect, useRef } from 'react'
import {
  useEdgesState,
  useNodesState,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from 'reactflow'
import type {
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  NodeCueMode,
  YargNodeCueDefinition,
  YargEffectDefinition,
  EffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorNodeData } from '../lib/types'
import { useFlowSync } from './useFlowSync'
import { useEdgeManagement } from './useEdgeManagement'
import { useNodeSelection } from './useNodeSelection'
import { useNodeCreation } from './useNodeCreation'

type UseCueFlowParams = {
  activeMode: NodeCueMode
  editorMode: 'cue' | 'effect'
  setIsDirty: (dirty: boolean) => void
  flowWrapperRef?: React.RefObject<HTMLDivElement>
  effectDefinitions?: Map<string, EffectDefinition>
}

const useCueFlow = ({
  activeMode,
  editorMode,
  setIsDirty,
  flowWrapperRef,
  effectDefinitions,
}: UseCueFlowParams) => {
  const setSelectedNodeIdRef = useRef<(id: string | null) => void>(() => {})
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<EditorNodeData>([])
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState<Edge>([])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeRaw(changes)
      const hasDirtyChange = changes.some(
        (c) => (c.type === 'position' && c.dragging === false) || c.type === 'remove',
      )
      if (hasDirtyChange) setIsDirty(true)
    },
    [onNodesChangeRaw, setIsDirty],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChangeRaw(changes)
      if (changes.some((c) => c.type === 'remove')) setIsDirty(true)
    },
    [onEdgesChangeRaw, setIsDirty],
  )

  const flowSync = useFlowSync({
    setNodes,
    setEdges,
    effectDefinitions,
    onCueLoaded: () => setSelectedNodeIdRef.current(null),
  })

  const selection = useNodeSelection({
    nodes,
    setNodes,
    edges,
    setEdges,
    reactFlowInstance: flowSync.reactFlowInstance,
    flowWrapperRef,
    activeMode,
    setIsDirty,
  })

  useEffect(() => {
    setSelectedNodeIdRef.current = selection.setSelectedNodeId
  }, [selection.setSelectedNodeId])

  const edgeMgmt = useEdgeManagement({
    nodes,
    edges,
    setEdges,
    setNodes,
    setIsDirty,
    editorMode,
  })

  const nodeCreation = useNodeCreation({ nodes, setNodes, activeMode, setIsDirty })

  const loadCueIntoFlow = useCallback(
    (
      cue:
        | YargNodeCueDefinition
        | AudioNodeCueDefinition
        | YargEffectDefinition
        | AudioEffectDefinition
        | null,
    ) => {
      flowSync.loadCueIntoFlow(cue)
      selection.setSelectedNodeId(null)
    },
    [flowSync, selection],
  )

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
    addEventNode: nodeCreation.addEventNode,
    addActionNode: nodeCreation.addActionNode,
    addLogicNode: nodeCreation.addLogicNode,
    addEventRaiserNode: nodeCreation.addEventRaiserNode,
    addEventListenerNode: nodeCreation.addEventListenerNode,
    addEffectRaiserNode: nodeCreation.addEffectRaiserNode,
    addEffectListenerNode: nodeCreation.addEffectListenerNode,
    addNotesNode: nodeCreation.addNotesNode,
    updateSelectedNode: selection.updateSelectedNode,
    updateNodeId: selection.updateNodeId,
    loadCueIntoFlow,
    setReactFlowInstance: flowSync.setReactFlowInstance,
    reactFlowInstance: flowSync.reactFlowInstance,
    closeContextMenu: selection.closeContextMenu,
    handlePaneContextMenu: selection.handlePaneContextMenu,
  }
}

export { useCueFlow }
