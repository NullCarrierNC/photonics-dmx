/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { useState, type MouseEvent } from 'react'
import type { Edge, ReactFlowInstance } from 'reactflow'
import type { EditorNode, EditorNodeData } from '../lib/types'
import type { NodeCueMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { useNodeSelection } from './useNodeSelection'

function node(
  id: string,
  kind: EditorNodeData['kind'],
  payload: object = {},
  extra: Partial<EditorNodeData> = {},
): EditorNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { kind, label: id, payload: { id, ...payload } as EditorNodeData['payload'], ...extra },
  }
}

const NODES = [
  node('beat', 'event', { eventType: 'beat' }),
  node('act', 'action', { effectType: 'set-color' }),
  node('gate', 'logic', { logicType: 'conditional' }),
  node('act2', 'action', { effectType: 'set-color' }),
  node('raise', 'event-raiser', { eventName: 'drop' }),
  node('listen', 'event-listener', { eventName: 'drop' }),
  node('note', 'notes', {}),
  node('fx', 'effect-raiser', { effectId: 'sweep' }, { effectName: 'Sweep' }),
  node('trig', 'event', { eventType: 'audio-trigger', nodeLabel: 'Kick' }),
  node('energy', 'event', { eventType: 'audio-energy' }),
]

const EDGES: Edge[] = [
  { id: 'e1', source: 'beat', target: 'act' },
  { id: 'e2', source: 'gate', target: 'act2' },
  { id: 'e3', source: 'act', target: 'gate' },
]

const INSTANCE = {
  screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x: x / 2, y: y / 2 }),
} as unknown as ReactFlowInstance

function renderSelection(
  options: { activeMode?: NodeCueMode; reactFlowInstance?: ReactFlowInstance | null } = {},
) {
  const setIsDirty = jest.fn<(dirty: boolean) => void>()
  const view = renderHook(() => {
    const [nodes, setNodes] = useState(NODES)
    const [edges, setEdges] = useState(EDGES)
    return {
      nodes,
      edges,
      ...useNodeSelection({
        nodes,
        setNodes,
        edges,
        setEdges,
        reactFlowInstance: options.reactFlowInstance ?? null,
        activeMode: options.activeMode ?? 'yarg',
        setIsDirty,
      }),
    }
  })
  return { ...view, setIsDirty }
}

type View = ReturnType<typeof renderSelection>

function mouse(clientX: number, clientY: number) {
  const preventDefault = jest.fn()
  return { event: { preventDefault, clientX, clientY } as unknown as MouseEvent, preventDefault }
}

function select({ result }: View, id: string): void {
  act(() =>
    result.current.handleNodeSelection({ nodes: [result.current.nodes.find((n) => n.id === id)!] }),
  )
}

function nodeById({ result }: View, id: string): EditorNode | undefined {
  return result.current.nodes.find((n) => n.id === id)
}

describe('useNodeSelection', () => {
  it('selects the first node picked and closes the node menu', () => {
    const view = renderSelection()
    act(() => view.result.current.handleNodeContextMenu(mouse(5, 6).event, NODES[1]!))

    select(view, 'gate')
    expect(view.result.current.selectedNode?.id).toBe('gate')
    expect(view.result.current.contextMenu).toBeNull()

    act(() => view.result.current.handleNodeSelection({ nodes: [] }))
    expect(view.result.current.selectedNode).toBeNull()
  })

  it.each([
    ['an action fed by an event', 'act', true],
    ['an action fed by logic', 'act2', false],
    ['a node that is not an action', 'gate', false],
  ])('knows whether %s hangs off an event: %s', (_case, id, expected) => {
    const view = renderSelection()
    select(view, id)
    expect(view.result.current.selectedActionHasEventParent).toBe(expected)
  })

  it('opens the node menu where it was right-clicked and selects that node', () => {
    const view = renderSelection()
    const { event, preventDefault } = mouse(5, 6)
    act(() => view.result.current.handleNodeContextMenu(event, NODES[1]!))
    expect(preventDefault).toHaveBeenCalled()
    expect(view.result.current.contextMenu).toEqual({ x: 5, y: 6, nodeId: 'act' })
    expect(view.result.current.selectedNode?.id).toBe('act')
  })

  it('removes a node with its edges and drops it from the selection', () => {
    const view = renderSelection()
    select(view, 'act')
    act(() => view.result.current.handleRemoveNode('act'))

    expect(nodeById(view, 'act')).toBeUndefined()
    expect(view.result.current.edges.map((e) => e.id)).toEqual(['e2'])
    expect(view.result.current.selectedNode).toBeNull()
    expect(view.setIsDirty).toHaveBeenCalledWith(true)
  })

  it('renames a node, its payload and every edge that touches it', () => {
    const view = renderSelection()
    select(view, 'act')
    act(() => view.result.current.updateNodeId(' wash '))

    const renamed = nodeById(view, 'wash')!
    expect((renamed.data.payload as { id: string }).id).toBe('wash')
    expect(view.result.current.edges.map((e) => [e.source, e.target])).toEqual([
      ['beat', 'wash'],
      ['gate', 'act2'],
      ['wash', 'gate'],
    ])
    expect(view.result.current.selectedNode?.id).toBe('wash')
    expect(view.setIsDirty).toHaveBeenCalledWith(true)
  })

  it.each([
    ['blank', '   '],
    ['already another node', 'gate'],
    ['unchanged', 'act'],
  ])('ignores a new id that is %s', (_case, newId) => {
    const view = renderSelection()
    select(view, 'act')
    const nodes = view.result.current.nodes
    act(() => view.result.current.updateNodeId(newId))
    expect(view.result.current.nodes).toBe(nodes)
    expect(view.setIsDirty).not.toHaveBeenCalled()
  })

  it.each([
    ['an action', 'act', { effectType: 'pulse' }, 'pulse'],
    ['a logic node', 'gate', { logicType: 'math' }, 'math'],
    ['an event raiser', 'raise', { eventName: 'lift' }, 'Raise: lift'],
    ['an event raiser with no event', 'raise', { eventName: '' }, 'Raise Event'],
    ['an event listener', 'listen', { eventName: 'lift' }, 'Listen: lift'],
    ['an event listener with no event', 'listen', { eventName: '' }, 'Listen Event'],
    ['a notes node', 'note', { label: 'Remember' }, 'Remember'],
    ['a notes node with no label', 'note', {}, 'Notes'],
    ['a YARG event', 'beat', { eventType: 'measure' }, 'measure'],
    ['an effect raiser', 'fx', {}, 'Effect: Sweep'],
  ])('relabels %s from its new payload', (_case, id, updates, label) => {
    const view = renderSelection()
    select(view, id)
    // The hook takes a partial of whichever payload the selected node carries.
    act(() => view.result.current.updateSelectedNode(updates as never))

    const updated = nodeById(view, id)!
    expect(updated.data.label).toBe(label)
    expect(updated.data.payload).toMatchObject(updates)
    expect(view.setIsDirty).toHaveBeenCalledWith(true)
  })

  it.each([
    ['an audio trigger by its node label', 'trig', { nodeLabel: 'Snare' }, 'Snare'],
    ['any other audio event by its type', 'energy', { eventType: 'audio-hfc' }, 'audio-hfc'],
  ])('labels %s in audio mode', (_case, id, updates, label) => {
    const view = renderSelection({ activeMode: 'audio' })
    select(view, id)
    act(() => view.result.current.updateSelectedNode(updates as never))
    expect(nodeById(view, id)!.data.label).toBe(label)
  })

  it('changes nothing with no node selected', () => {
    const view = renderSelection()
    const nodes = view.result.current.nodes
    act(() => view.result.current.updateSelectedNode({} as never))
    expect(view.result.current.nodes).toBe(nodes)
    expect(view.setIsDirty).not.toHaveBeenCalled()
  })

  it('opens the canvas menu where it was right-clicked when it fits', () => {
    const view = renderSelection({ reactFlowInstance: INSTANCE })
    act(() => view.result.current.handlePaneContextMenu(mouse(20, 30).event))
    expect(view.result.current.paneContextMenu).toEqual({ x: 20, y: 30, flowX: 10, flowY: 15 })
  })

  it('keeps the canvas menu inside the window', () => {
    const view = renderSelection({ reactFlowInstance: INSTANCE })
    const clientX = window.innerWidth - 5
    const clientY = window.innerHeight - 5
    act(() => view.result.current.handlePaneContextMenu(mouse(clientX, clientY).event))

    const menuHeight = Math.min(600, window.innerHeight * 0.8)
    expect(view.result.current.paneContextMenu).toEqual({
      x: Math.max(10, window.innerWidth - 200 - 10),
      y: Math.max(10, window.innerHeight - menuHeight - 10),
      flowX: clientX / 2,
      flowY: clientY / 2,
    })
  })

  it('opens no canvas menu before the canvas is ready', () => {
    const view = renderSelection()
    const { event, preventDefault } = mouse(20, 30)
    act(() => view.result.current.handlePaneContextMenu(event))
    expect(preventDefault).toHaveBeenCalled()
    expect(view.result.current.paneContextMenu).toBeNull()
  })

  it('closes both menus together', () => {
    const view = renderSelection({ reactFlowInstance: INSTANCE })
    act(() => view.result.current.handleNodeContextMenu(mouse(5, 6).event, NODES[1]!))
    act(() => view.result.current.handlePaneContextMenu(mouse(20, 30).event))

    act(() => view.result.current.closeContextMenu())
    expect(view.result.current.contextMenu).toBeNull()
    expect(view.result.current.paneContextMenu).toBeNull()
  })
})
