/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook } from '@testing-library/react'
import type { Edge } from 'reactflow'
import type { EditorNode } from '../lib/types'
import { useLevelModeWarnings } from './useLevelModeWarnings'

const mockFind = jest.fn((_nodes: EditorNode[], _edges: Edge[]) => ({
  nodeIds: new Set(['delay-1']),
  messages: ['delay-1 never fires in level mode'],
}))

jest.mock('../lib/levelModeCompat', () => ({
  findIncompatibleTimingNodes: (nodes: EditorNode[], edges: Edge[]) => mockFind(nodes, edges),
}))

beforeEach(() => {
  mockFind.mockClear()
})

describe('useLevelModeWarnings', () => {
  it('hands back the incompatible nodes and their messages', () => {
    const { result } = renderHook(() => useLevelModeWarnings([], []))
    expect([...result.current.warningNodeIds]).toEqual(['delay-1'])
    expect(result.current.warningMessages).toEqual(['delay-1 never fires in level mode'])
  })

  it('recomputes only when the graph changes', () => {
    const nodes: EditorNode[] = []
    const edges: Edge[] = []
    const { result, rerender } = renderHook(({ n, e }) => useLevelModeWarnings(n, e), {
      initialProps: { n: nodes, e: edges },
    })
    const first = result.current

    rerender({ n: nodes, e: edges })
    expect(result.current).toBe(first)
    expect(mockFind).toHaveBeenCalledTimes(1)

    rerender({ n: nodes, e: [] })
    expect(mockFind).toHaveBeenCalledTimes(2)
  })
})
