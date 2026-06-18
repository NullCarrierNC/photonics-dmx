import { useMemo } from 'react'
import type { Edge } from 'reactflow'
import type { EditorNode } from '../lib/types'
import { findIncompatibleTimingNodes } from '../lib/levelModeCompat'

/**
 * Live, non-blocking warnings for timing/iteration nodes (delay, for-each-light) wired into a
 * trigger context that fires them incorrectly — reachable from a level-mode audio event (where they
 * are inert) or from an audio trigger's "during" port (where they re-fire every frame). Recomputes
 * whenever the graph changes, so it also catches switching an event to level mode, or pasting/editing
 * a subgraph (no connection event needed).
 */
export function useLevelModeWarnings(
  nodes: EditorNode[],
  edges: Edge[],
): { warningNodeIds: Set<string>; warningMessages: string[] } {
  return useMemo(() => {
    const { nodeIds, messages } = findIncompatibleTimingNodes(nodes, edges)
    return { warningNodeIds: nodeIds, warningMessages: messages }
  }, [nodes, edges])
}
