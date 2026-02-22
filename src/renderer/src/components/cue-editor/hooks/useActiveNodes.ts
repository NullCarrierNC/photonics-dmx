import { useCallback, useEffect, useRef, useState } from 'react'
import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels'
import { addIpcListener, removeIpcListener } from '../../../utils/ipcHelpers'

const MIN_HIGHLIGHT_MS = 300

type NodeExecutionPayload = {
  type: 'activated' | 'deactivated'
  cueId: string
  nodeId: string
  timestamp: number
}

/**
 * Tracks which nodes are currently executing for active-node highlighting.
 * Listens to node-cues:node-execution IPC, filters by current graph (cue or effect id),
 * and enforces a minimum highlight duration (200ms) so fast logic nodes remain visible.
 */
export function useActiveNodes(currentGraphId: string | null): Set<string> {
  const [activeNodeIds, setActiveNodeIds] = useState<Set<string>>(() => new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<Map<string, 'activated' | 'deactivated'>>(new Map())

  const flushPending = useCallback(() => {
    rafRef.current = null
    const pending = pendingRef.current
    if (pending.size === 0) return
    pendingRef.current = new Map()
    setActiveNodeIds((prev) => {
      const next = new Set(prev)
      for (const [nodeId, type] of pending) {
        if (type === 'activated') {
          next.add(nodeId)
        } else {
          next.delete(nodeId)
        }
      }
      return next
    })
  }, [])

  const handleNodeExecution = useCallback(
    (_: unknown, payload: NodeExecutionPayload) => {
      if (!payload || payload.cueId !== currentGraphId) return

      const { type, nodeId } = payload

      if (type === 'activated') {
        const existing = timersRef.current.get(nodeId)
        if (existing) {
          clearTimeout(existing)
          timersRef.current.delete(nodeId)
        }
        pendingRef.current.set(nodeId, 'activated')
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(flushPending)
        }
      } else {
        const timer = setTimeout(() => {
          timersRef.current.delete(nodeId)
          pendingRef.current.set(nodeId, 'deactivated')
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(flushPending)
          }
        }, MIN_HIGHLIGHT_MS)
        timersRef.current.set(nodeId, timer)
      }
    },
    [currentGraphId, flushPending],
  )

  useEffect(() => {
    addIpcListener<NodeExecutionPayload>(RENDERER_RECEIVE.NODE_EXECUTION, handleNodeExecution)
    return () => removeIpcListener(RENDERER_RECEIVE.NODE_EXECUTION, handleNodeExecution)
  }, [handleNodeExecution])

  useEffect(() => {
    if (!currentGraphId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when graph unmounts
      setActiveNodeIds(new Set())
      for (const t of timersRef.current.values()) clearTimeout(t)
      timersRef.current.clear()
      pendingRef.current.clear()
    }
  }, [currentGraphId])

  return activeNodeIds
}
