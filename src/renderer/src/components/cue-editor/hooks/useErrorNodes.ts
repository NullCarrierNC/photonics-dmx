import { useCallback, useEffect, useRef, useState } from 'react'
import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels'
import type { NodeCueRuntimeErrorPayload } from '../../../../../shared/ipcTypes'
import { addIpcListener, removeIpcListener } from '../../../utils/ipcHelpers'

const ERROR_HIGHLIGHT_MS = 6000

/**
 * Tracks which nodes have thrown a runtime error for error-node highlighting.
 * Listens to node-cue:runtime-error IPC and auto-clears each highlight after ERROR_HIGHLIGHT_MS.
 * Errors are scoped to the open graph: a payload whose graphId names a different cue/effect is ignored,
 * while an unattributed error (no graphId) still highlights — it cannot be ruled out.
 */
export function useErrorNodes(currentGraphId: string | null): Set<string> {
  const [errorNodeIds, setErrorNodeIds] = useState<Set<string>>(() => new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const handleRuntimeError = useCallback(
    (payload: NodeCueRuntimeErrorPayload) => {
      const nodeId = payload?.nodeId
      if (typeof nodeId !== 'string' || !nodeId) return
      if (payload.graphId && payload.graphId !== currentGraphId) return

      const existing = timersRef.current.get(nodeId)
      if (existing) {
        clearTimeout(existing)
      }

      setErrorNodeIds((prev) => {
        const next = new Set(prev)
        next.add(nodeId)
        return next
      })

      const timer = setTimeout(() => {
        timersRef.current.delete(nodeId)
        setErrorNodeIds((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
      }, ERROR_HIGHLIGHT_MS)
      timersRef.current.set(nodeId, timer)
    },
    [currentGraphId],
  )

  useEffect(() => {
    addIpcListener(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, handleRuntimeError)
    return () => removeIpcListener(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, handleRuntimeError)
  }, [handleRuntimeError])

  useEffect(() => {
    if (!currentGraphId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when graph unmounts
      setErrorNodeIds(new Set())
      for (const t of timersRef.current.values()) clearTimeout(t)
      timersRef.current.clear()
    }
  }, [currentGraphId])

  useEffect(() => {
    // Clear pending error-highlight timers on unmount so their callbacks do not run setState
    // after the component is gone.
    const timers = timersRef.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  return errorNodeIds
}
