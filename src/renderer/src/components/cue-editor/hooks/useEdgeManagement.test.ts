/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { useState, type MouseEvent } from 'react'
import type { Connection, Edge } from 'reactflow'
import type { EditorNode, EditorNodeData } from '../lib/types'
import type { ActionNode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { useEdgeManagement } from './useEdgeManagement'

function node(id: string, kind: EditorNodeData['kind'], payload: object = {}): EditorNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { kind, label: id, payload: { id, ...payload } as EditorNodeData['payload'] },
  }
}

const NODES = [
  node('beat', 'event', { type: 'event', eventType: 'beat' }),
  node('start', 'event', { type: 'event', eventType: 'cue-started' }),
  node('act', 'action', { type: 'action', effectType: 'set-color' }),
  node('act2', 'action', { type: 'action', effectType: 'set-color' }),
  node('act3', 'action', { type: 'action', effectType: 'set-color' }),
  node('gate', 'logic', { type: 'logic', logicType: 'conditional' }),
  node('notes', 'notes'),
]

function renderEdges(edges: Edge[] = []) {
  const setIsDirty = jest.fn<(dirty: boolean) => void>()
  const view = renderHook(() => {
    const [nodes, setNodes] = useState(NODES)
    const [current, setEdges] = useState(edges)
    return {
      nodes,
      edges: current,
      ...useEdgeManagement({
        nodes,
        edges: current,
        setNodes,
        setEdges,
        setIsDirty,
        editorMode: 'cue',
      }),
    }
  })
  return { ...view, setIsDirty }
}

function connection(
  source: string,
  target: string,
  sourceHandle: string | null = null,
): Connection {
  return { source, target, sourceHandle, targetHandle: null }
}

function actionTiming(nodes: EditorNode[], id: string): ActionNode['timing'] {
  return (nodes.find((n) => n.id === id)!.data.payload as ActionNode).timing
}

describe('useEdgeManagement', () => {
  it.each([
    ['a node to itself', 'act', 'act', false],
    ['a node that is not on the canvas', 'beat', 'missing', false],
    ['an event into an action', 'beat', 'act', true],
    ['an action into an event', 'act', 'beat', false],
    ['anything into notes', 'act', 'notes', false],
  ])('accepts a connection from %s: %s', (_case, source, target, expected) => {
    const { result } = renderEdges()
    expect(result.current.isValidConnection(connection(source, target))).toBe(expected)
  })

  it("copies a beat event's wait onto the action it feeds", () => {
    const { result, setIsDirty } = renderEdges()
    act(() => result.current.onConnect(connection('beat', 'act')))

    const timing = actionTiming(result.current.nodes, 'act')
    expect(timing?.waitForCondition).toEqual({ source: 'literal', value: 'beat' })
    expect(timing?.waitForTime).toEqual({ source: 'literal', value: 0 })
    expect(result.current.edges.map((edge) => edge.data)).toEqual([{ fromPort: null }])
    expect(setIsDirty).toHaveBeenCalledWith(true)
  })

  it('starts an action at once when its event is the cue starting', () => {
    const { result } = renderEdges()
    act(() => result.current.onConnect(connection('start', 'act')))
    expect(actionTiming(result.current.nodes, 'act')?.waitForCondition).toEqual({
      source: 'literal',
      value: 'none',
    })
  })

  it("labels a conditional's first two unlabelled edges true then false", () => {
    const { result } = renderEdges()
    act(() => result.current.onConnect(connection('gate', 'act')))
    act(() => result.current.onConnect(connection('gate', 'act2')))
    act(() => result.current.onConnect(connection('gate', 'act3')))
    expect(result.current.edges.map((edge) => edge.data.fromPort)).toEqual(['true', 'false', null])
  })

  it('keeps the handle an edge was dropped on', () => {
    const { result } = renderEdges()
    act(() => result.current.onConnect(connection('gate', 'act', 'false')))
    expect(result.current.edges.map((edge) => edge.data.fromPort)).toEqual(['false'])
  })

  it('leaves the graph alone for a refused connection', () => {
    const { result, setIsDirty } = renderEdges()
    const nodes = result.current.nodes
    act(() => result.current.onConnect(connection('act', 'beat')))
    expect(result.current.nodes).toBe(nodes)
    expect(result.current.edges).toEqual([])
    expect(setIsDirty).not.toHaveBeenCalled()
  })

  it('deletes an edge from its context menu', () => {
    const edge: Edge = { id: 'e1', source: 'beat', target: 'act' }
    const { result, setIsDirty } = renderEdges([edge])
    const preventDefault = jest.fn()

    act(() => result.current.onEdgeContextMenu({ preventDefault } as unknown as MouseEvent, edge))

    expect(result.current.edges).toEqual([])
    expect(preventDefault).toHaveBeenCalled()
    expect(setIsDirty).toHaveBeenCalledWith(true)
  })
})
