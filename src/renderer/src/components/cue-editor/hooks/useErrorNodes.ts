import { useCallback, useEffect, useRef, useState } from 'react'
import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels'
import { addIpcListener, removeIpcListener } from '../../../utils/ipcHelpers'

const ERROR_HIGHLIGHT_MS = 6000

/**
 * Parses node ID from runtime error payload format "nodeId: error message".
 */
function parseNodeIdFromRuntimeError(message: string): string | null {
  if (typeof message !== 'string') return null
  const colonIndex = message.indexOf(': ')
  if (colonIndex < 0) return null
  const nodeId = message.slice(0, colonIndex).trim()
  return nodeId || null
}

/**
 * Tracks which nodes have thrown a runtime error for error-node highlighting.
 * Listens to node-cue:runtime-error IPC, parses the node ID from the message,
 * and auto-clears the highlight after ERROR_HIGHLIGHT_MS.
 */
export function useErrorNodes(currentGraphId: string | null): Set<string> {
  const [errorNodeIds, setErrorNodeIds] = useState<Set<string>>(() => new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const handleRuntimeError = useCallback((message: string) => {
    const nodeId = parseNodeIdFromRuntimeError(message)
    if (!nodeId) return

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
  }, [])

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

  return errorNodeIds
}
