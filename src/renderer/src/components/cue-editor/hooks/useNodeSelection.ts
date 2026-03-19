import React, { useCallback, useMemo, useState } from 'react'
import type { ReactFlowInstance } from 'reactflow'
import type {
  ActionNode,
  AudioEventNode,
  AudioEventNodeUnion,
  AudioTriggerNode,
  EventListenerNode,
  EventRaiserNode,
  LogicNode,
  NotesNode,
  YargEventNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type {
  EffectRaiserNode,
  EffectEventListenerNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorNode } from '../lib/types'

export type UseNodeSelectionParams = {
  nodes: EditorNode[]
  setNodes: React.Dispatch<React.SetStateAction<EditorNode[]>>
  edges: import('reactflow').Edge[]
  setEdges: React.Dispatch<React.SetStateAction<import('reactflow').Edge[]>>
  reactFlowInstance: ReactFlowInstance | null
  flowWrapperRef?: React.RefObject<HTMLDivElement>
  activeMode: 'yarg' | 'audio'
  setIsDirty: (dirty: boolean) => void
}

export function useNodeSelection({
  nodes,
  setNodes,
  edges,
  setEdges,
  reactFlowInstance,
  flowWrapperRef: _flowWrapperRef,
  activeMode,
  setIsDirty,
}: UseNodeSelectionParams) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(
    null,
  )
  const [paneContextMenu, setPaneContextMenu] = useState<{
    x: number
    y: number
    flowX: number
    flowY: number
  } | null>(null)

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return nodes.find((node) => node.id === selectedNodeId) ?? null
  }, [nodes, selectedNodeId])

  const selectedActionHasEventParent = useMemo(() => {
    if (!selectedNode || selectedNode.data.kind !== 'action') return false
    return edges.some(
      (edge) =>
        edge.target === selectedNode.id &&
        nodes.find((n) => n.id === edge.source)?.data.kind === 'event',
    )
  }, [edges, nodes, selectedNode])

  const handleNodeSelection = useCallback(({ nodes: selected }: { nodes: EditorNode[] }) => {
    setSelectedNodeId(selected[0]?.id ?? null)
    setContextMenu(null)
  }, [])

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: EditorNode) => {
    event.preventDefault()
    setSelectedNodeId(node.id)
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id })
  }, [])

  const handleRemoveNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId))
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
      setSelectedNodeId((prev) => (prev === nodeId ? null : prev))
      setIsDirty(true)
      setContextMenu(null)
    },
    [setEdges, setIsDirty, setNodes],
  )

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
    setPaneContextMenu(null)
  }, [])

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      if (!reactFlowInstance) return
      const flowPosition = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const estimatedMenuHeight = Math.min(600, window.innerHeight * 0.8)
      const menuWidth = 200
      let adjustedX = event.clientX
      let adjustedY = event.clientY
      if (event.clientY + estimatedMenuHeight > window.innerHeight) {
        adjustedY = Math.max(10, window.innerHeight - estimatedMenuHeight - 10)
      }
      if (event.clientX + menuWidth > window.innerWidth) {
        adjustedX = Math.max(10, window.innerWidth - menuWidth - 10)
      }
      if (adjustedX < 0) adjustedX = 10
      setPaneContextMenu({
        x: adjustedX,
        y: adjustedY,
        flowX: flowPosition.x,
        flowY: flowPosition.y,
      })
    },
    [reactFlowInstance],
  )

  const updateNodeId = useCallback(
    (newId: string) => {
      if (!selectedNodeId) return
      const trimmed = newId.trim()
      if (!trimmed) return
      const isDuplicate = nodes.some((n) => n.id === trimmed && n.id !== selectedNodeId)
      if (isDuplicate) return
      if (trimmed === selectedNodeId) return
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== selectedNodeId) return node
          const nextPayload = { ...node.data.payload, id: trimmed }
          return {
            ...node,
            id: trimmed,
            data: {
              ...node.data,
              payload: nextPayload,
            },
          }
        }),
      )
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          source: edge.source === selectedNodeId ? trimmed : edge.source,
          target: edge.target === selectedNodeId ? trimmed : edge.target,
        })),
      )
      setSelectedNodeId(trimmed)
      setIsDirty(true)
    },
    [selectedNodeId, nodes, setNodes, setEdges, setIsDirty],
  )

  const updateSelectedNode = useCallback(
    <
      T extends
        | YargEventNode
        | AudioEventNodeUnion
        | ActionNode
        | LogicNode
        | EventRaiserNode
        | EventListenerNode
        | EffectRaiserNode
        | EffectEventListenerNode
        | NotesNode,
    >(
      updates: Partial<T>,
    ) => {
      if (!selectedNodeId) return
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== selectedNodeId) return node
          const nextPayload = { ...node.data.payload, ...updates } as T
          const label = (() => {
            switch (node.data.kind) {
              case 'event': {
                if (activeMode === 'yarg') return (nextPayload as YargEventNode).eventType
                const audioPayload = nextPayload as AudioEventNodeUnion
                return audioPayload.eventType === 'audio-trigger'
                  ? (audioPayload as AudioTriggerNode).nodeLabel
                  : (audioPayload as AudioEventNode).eventType
              }
              case 'action':
                return (nextPayload as ActionNode).effectType
              case 'logic':
                return (nextPayload as LogicNode).logicType
              case 'event-raiser':
                return (nextPayload as EventRaiserNode).eventName
                  ? `Raise: ${(nextPayload as EventRaiserNode).eventName}`
                  : 'Raise Event'
              case 'event-listener':
                return (nextPayload as EventListenerNode).eventName
                  ? `Listen: ${(nextPayload as EventListenerNode).eventName}`
                  : 'Listen Event'
              case 'effect-raiser':
                return node.data.effectName ? `Effect: ${node.data.effectName}` : 'Raise Effect'
              case 'effect-listener':
                return 'Effect Listener'
              case 'notes':
                return (nextPayload as NotesNode).label ?? 'Notes'
              default:
                return node.data.label
            }
          })()
          return {
            ...node,
            data: {
              ...node.data,
              payload: nextPayload,
              label,
            },
          }
        }),
      )
      setIsDirty(true)
    },
    [activeMode, selectedNodeId, setNodes, setIsDirty],
  )

  return {
    selectedNodeId,
    setSelectedNodeId,
    contextMenu,
    setContextMenu,
    paneContextMenu,
    setPaneContextMenu,
    handleNodeSelection,
    handleNodeContextMenu,
    handleRemoveNode,
    closeContextMenu,
    handlePaneContextMenu,
    updateSelectedNode,
    updateNodeId,
    selectedNode,
    selectedActionHasEventParent,
  }
}
