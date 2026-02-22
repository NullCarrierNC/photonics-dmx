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

export type UseEdgeManagementParams = {
  nodes: EditorNode[]
  edges: Edge[]
  setNodes: React.Dispatch<React.SetStateAction<EditorNode[]>>
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  setIsDirty: (dirty: boolean) => void
}

export function useEdgeManagement({
  nodes,
  edges,
  setNodes,
  setEdges,
  setIsDirty,
}: UseEdgeManagementParams) {
  const isValidNodeConnection = useCallback(
    (sourceId?: string | null, targetId?: string | null) => {
      if (!sourceId || !targetId || sourceId === targetId) return false
      const sourceNode = nodes.find((node) => node.id === sourceId)
      const targetNode = nodes.find((node) => node.id === targetId)
      if (!sourceNode || !targetNode) return false
      if (sourceNode.data.kind === 'notes' || targetNode.data.kind === 'notes') return false
      if (targetNode.data.kind === 'event-listener' || targetNode.data.kind === 'effect-listener')
        return false
      const validTargets = ['action', 'logic', 'event-raiser', 'effect-raiser']
      if (sourceNode.data.kind === 'event' && validTargets.includes(targetNode.data.kind))
        return true
      if (sourceNode.data.kind === 'logic' && validTargets.includes(targetNode.data.kind))
        return true
      if (sourceNode.data.kind === 'action' && validTargets.includes(targetNode.data.kind))
        return true
      if (sourceNode.data.kind === 'event-raiser' && validTargets.includes(targetNode.data.kind))
        return true
      if (sourceNode.data.kind === 'effect-raiser' && validTargets.includes(targetNode.data.kind))
        return true
      if (sourceNode.data.kind === 'event-listener' && validTargets.includes(targetNode.data.kind))
        return true
      if (sourceNode.data.kind === 'effect-listener' && validTargets.includes(targetNode.data.kind))
        return true
      return false
    },
    [nodes],
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
              waitForCondition: inheritedWaitForCondition,
              waitForTime: { source: 'literal', value: 0 },
            }
          } else if (sourceNode.data.kind === 'action') {
            const sourceAction = sourceNode.data.payload as ActionNode
            targetAction.color = { ...sourceAction.color }
            targetAction.target = { ...sourceAction.target }
            targetAction.layer = sourceAction.layer
          }

          return prevNodes.map((node) =>
            node.id === targetNode.id
              ? { ...node, data: { ...node.data, payload: targetAction } }
              : node,
          )
        }
        return prevNodes
      })

      const sourceNode = nodes.find((n) => n.id === connection.source)
      let fromPort: string | null = null
      if (connection.sourceHandle) {
        fromPort = connection.sourceHandle
      } else if (sourceNode?.data.kind === 'logic') {
        const logicPayload = sourceNode.data.payload as LogicNode
        if (logicPayload.logicType === 'conditional') {
          const existingEdges = edges.filter((e) => e.source === sourceNode.id)
          if (existingEdges.length === 0) fromPort = 'true'
          else if (existingEdges.length === 1) fromPort = 'false'
        }
      }

      setEdges((eds) => addEdge({ ...connection, type: 'default', data: { fromPort } }, eds))
      setIsDirty(true)
    },
    [edges, isValidNodeConnection, nodes, setEdges, setIsDirty, setNodes],
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
