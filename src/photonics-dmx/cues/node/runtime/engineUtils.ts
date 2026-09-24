/**
 * Shared utilities used by both NodeExecutionEngine and EffectExecutionEngine.
 */
import type { ActionNode, Connection, EventListenerNode } from '../../types/nodeCueTypes'

/**
 * Collect all node IDs reachable from startNodeIds via the adjacency graph,
 * excluding excludeNodeId. Used to find for-each-light body nodes so they can
 * be unmarked between loop iterations.
 */
export function collectReachableNodes(
  adjacency: Map<string, Connection[]>,
  startNodeIds: string[],
  excludeNodeId: string,
): Set<string> {
  const result = new Set<string>()
  const queue = [...startNodeIds]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (id === excludeNodeId) continue
    if (result.has(id)) continue
    result.add(id)
    const outgoing = adjacency.get(id) ?? []
    for (const conn of outgoing) {
      queue.push(conn.to)
    }
  }
  return result
}

/** The longest delay setTimeout honours. It fires a longer one after 1 ms. */
export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

/**
 * A delay setTimeout honours: 0 for a negative or non-numeric delay, and the longest it can wait
 * for anything longer, so an authored "wait a very long time" still waits.
 */
export function clampTimerDelayMs(delayMs: number): number {
  if (Number.isNaN(delayMs)) return 0
  return Math.min(MAX_TIMER_DELAY_MS, Math.max(0, delayMs))
}

/**
 * The action a delay node registers under its own id while it waits, so its context counts the
 * delay as a blocking step. It never reaches the sequencer.
 */
export function delayPlaceholderAction(nodeId: string): ActionNode {
  return {
    id: nodeId,
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: 'blue' },
      brightness: { source: 'literal', value: 'medium' },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 0 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
    },
  }
}

/** Index a graph's event listeners by the event name they listen for, skipping unnamed ones. */
export function indexEventListeners(
  eventListenerMap: Map<string, EventListenerNode>,
): Map<string, EventListenerNode[]> {
  const index = new Map<string, EventListenerNode[]>()
  for (const listener of eventListenerMap.values()) {
    if (!listener.eventName) continue
    const listeners = index.get(listener.eventName) ?? []
    listeners.push(listener)
    index.set(listener.eventName, listeners)
  }
  return index
}
