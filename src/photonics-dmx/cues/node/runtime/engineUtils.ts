/**
 * Shared utilities used by both NodeExecutionEngine and EffectExecutionEngine.
 */
import type { Connection } from '../../types/nodeCueTypes'

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
