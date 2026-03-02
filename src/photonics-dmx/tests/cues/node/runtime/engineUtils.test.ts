/**
 * Tests for graph traversal utilities used by NodeExecutionEngine and EffectExecutionEngine.
 */

import { collectReachableNodes } from '../../../../cues/node/runtime/engineUtils'
import type { Connection } from '../../../../cues/types/nodeCueTypes'

function conn(from: string, to: string): Connection {
  return { from, to }
}

function buildAdjacency(connections: Connection[]): Map<string, Connection[]> {
  const map = new Map<string, Connection[]>()
  for (const c of connections) {
    const list = map.get(c.from) ?? []
    list.push(c)
    map.set(c.from, list)
  }
  return map
}

describe('engineUtils', () => {
  describe('collectReachableNodes', () => {
    it('linear chain A → B → C: start A, exclude nothing returns A, B, C', () => {
      const adjacency = buildAdjacency([conn('A', 'B'), conn('B', 'C')])
      const result = collectReachableNodes(adjacency, ['A'], '')
      expect(result).toEqual(new Set(['A', 'B', 'C']))
    })

    it('exclude mid-node: start A, exclude B blocks traversal past B', () => {
      const adjacency = buildAdjacency([conn('A', 'B'), conn('B', 'C')])
      const result = collectReachableNodes(adjacency, ['A'], 'B')
      expect(result).toEqual(new Set(['A']))
    })

    it('cycle A → B → A terminates without infinite loop', () => {
      const adjacency = buildAdjacency([conn('A', 'B'), conn('B', 'A')])
      const result = collectReachableNodes(adjacency, ['A'], '')
      expect(result).toEqual(new Set(['A', 'B']))
    })

    it('multiple start nodes in branching graph', () => {
      const adjacency = buildAdjacency([
        conn('A', 'B'),
        conn('B', 'D'),
        conn('C', 'D'),
        conn('D', 'E'),
      ])
      const result = collectReachableNodes(adjacency, ['A', 'C'], '')
      expect(result).toEqual(new Set(['A', 'B', 'C', 'D', 'E']))
    })

    it('start node with no outgoing connections returns only that node', () => {
      const adjacency = buildAdjacency([conn('A', 'B')])
      const result = collectReachableNodes(adjacency, ['B'], '')
      expect(result).toEqual(new Set(['B']))
    })

    it('excludeNodeId equals start node: start node is skipped and not traversed', () => {
      const adjacency = buildAdjacency([conn('A', 'B'), conn('B', 'C')])
      const result = collectReachableNodes(adjacency, ['A'], 'A')
      expect(result).toEqual(new Set())
    })
  })
})
