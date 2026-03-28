import React, { useCallback } from 'react'
import { addEdge, type Connection, type Edge } from 'reactflow'
import {
  createDefaultActionTiming,
  type ActionNode,
  type AudioEventNode,
  type YargEventNode,
  type LogicNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorNode } from '../lib/types'
import { isValidEditorEdge } from '../lib/edgeValidation'

export type UseEdgeManagementParams = {
  nodes: EditorNode[]
  edges: Edge[]
  setNodes: React.Dispatch<React.SetStateAction<EditorNode[]>>
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  setIsDirty: (dirty: boolean) => void
  editorMode: 'cue' | 'effect'
}

export function useEdgeManagement({
  nodes,
  edges: _edges,
  setNodes,
  setEdges,
  setIsDirty,
  editorMode,
}: UseEdgeManagementParams) {
  const isValidNodeConnection = useCallback(
    (sourceId?: string | null, targetId?: string | null) => {
      if (!sourceId || !targetId || sourceId === targetId) return false
      const sourceNode = nodes.find((node) => node.id === sourceId)
      const targetNode = nodes.find((node) => node.id === targetId)
      if (!sourceNode || !targetNode) return false
      return isValidEditorEdge(sourceNode.data.kind, targetNode.data.kind, editorMode)
    },
    [nodes, editorMode],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidNodeConnection(connection.source, connection.target)) return

      setNodes((prevNodes) => {
        const sourceNode = prevNodes.find((n) => n.id === connection.source)
        const targetNode = prevNodes.find((n) => n.id === connection.target)
        if (!sourceNode || !targetNode) return prevNodes

        if (targetNode.data.kind === 'action') {
          const targetAction = { ...(targetNode.data.payload as ActionNode) }
          if (sourceNode.data.kind === 'event') {
            const sourceEvent = sourceNode.data.payload as YargEventNode | AudioEventNode
            const inheritedWaitForCondition =
              sourceEvent.eventType === 'cue-started' || sourceEvent.eventType === 'cue-called'
                ? 'none'
                : (sourceEvent.eventType as
                    | 'none'
                    | 'delay'
                    | 'beat'
                    | 'measure'
                    | 'half-beat'
                    | 'keyframe')
            targetAction.timing = {
              ...createDefaultActionTiming(),
              ...(targetAction.timing ?? {}),
              waitForCondition: { source: 'literal', value: inheritedWaitForCondition },
              waitForTime: { source: 'literal', value: 0 },
            }
          }

          return prevNodes.map((node) =>
            node.id === targetNode.id
              ? { ...node, data: { ...node.data, payload: targetAction } }
              : node,
          )
        }
        return prevNodes
      })

      setEdges((prevEdges) => {
        let fromPort: string | null = null
        if (connection.sourceHandle) {
          fromPort = connection.sourceHandle
        } else {
          const sourceNode = nodes.find((n) => n.id === connection.source)
          if (sourceNode?.data.kind === 'logic') {
            const logicPayload = sourceNode.data.payload as LogicNode
            if (logicPayload.logicType === 'conditional') {
              const existingEdges = prevEdges.filter((e) => e.source === sourceNode.id)
              if (existingEdges.length === 0) fromPort = 'true'
              else if (existingEdges.length === 1) fromPort = 'false'
            }
          }
        }
        return addEdge({ ...connection, type: 'default', data: { fromPort } }, prevEdges)
      })
      setIsDirty(true)
    },
    [isValidNodeConnection, nodes, setEdges, setIsDirty, setNodes],
  )

  const isValidConnection = useCallback(
    (connection: Connection) => {
      return isValidNodeConnection(connection.source, connection.target)
    },
    [isValidNodeConnection],
  )

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      setEdges((prev) => prev.filter((e) => e.id !== edge.id))
      setIsDirty(true)
    },
    [setEdges, setIsDirty],
  )

  return { onConnect, isValidConnection, isValidNodeConnection, onEdgeContextMenu }
}
