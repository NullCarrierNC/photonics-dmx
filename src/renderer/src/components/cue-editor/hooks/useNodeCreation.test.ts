/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import type { EditorNode, NotesVariant } from '../lib/types'
import type { NodeCueKind, NodeCueMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { buildDefaultAction, buildDefaultAudioTrigger } from '../lib/cueDefaults'
import { getDefaultEventOption } from '../lib/options'
import { LOGIC_NODE_FACTORIES } from '../lib/logicNodeFactories'
import { useNodeCreation } from './useNodeCreation'

function placed(id: string, x: number, y: number): EditorNode {
  return { id, position: { x, y }, data: { kind: 'notes', label: id, payload: { id } as never } }
}

function renderCreation(
  options: { nodes?: EditorNode[]; activeMode?: NodeCueMode; cueKind?: NodeCueKind } = {},
) {
  const setIsDirty = jest.fn<(dirty: boolean) => void>()
  const view = renderHook(() => {
    const [nodes, setNodes] = useState(options.nodes ?? [])
    return {
      nodes,
      ...useNodeCreation({
        nodes,
        setNodes,
        activeMode: options.activeMode ?? 'yarg',
        cueKind: options.cueKind ?? 'lighting',
        setIsDirty,
      }),
    }
  })
  return { ...view, setIsDirty }
}

type View = ReturnType<typeof renderCreation>

function added({ result }: View): EditorNode {
  return result.current.nodes[result.current.nodes.length - 1]!
}

describe('useNodeCreation placement', () => {
  it('snaps to the grid on an empty canvas', () => {
    const { result } = renderCreation()
    expect(result.current.findAvailablePosition(120, 80)).toEqual({ x: 100, y: 100 })
  })

  it('keeps an exact drop point that is free', () => {
    const { result } = renderCreation()
    expect(result.current.findAvailablePosition(123, 77, 150, 80, true)).toEqual({ x: 123, y: 77 })
  })

  it('moves an exact drop point to the first free side of the node in the way', () => {
    const { result } = renderCreation({ nodes: [placed('n1', 100, 100)] })
    expect(result.current.findAvailablePosition(100, 100, 150, 80, true)).toEqual({
      x: 270,
      y: 100,
    })
  })

  it('searches outward from a grid spot that is taken', () => {
    const { result } = renderCreation({ nodes: [placed('n1', 100, 100)] })
    expect(result.current.findAvailablePosition(100, 100)).toEqual({ x: 100, y: 200 })
  })

  it('centres a node on the point it is dropped at', () => {
    const view = renderCreation()
    act(() => view.result.current.addActionNode('set-color', { x: 400, y: 300 }))
    expect(added(view).position).toEqual({ x: 325, y: 260 })
  })
})

describe('useNodeCreation nodes', () => {
  it("adds a YARG event using the mode's default event", () => {
    const view = renderCreation()
    act(() => view.result.current.addEventNode())

    const option = getDefaultEventOption('yarg', 'lighting')
    const node = added(view)
    expect(node.id).toMatch(/^event-/)
    expect(node.data.label).toBe(option.label)
    expect(node.data.payload).toEqual({ id: node.id, type: 'event', eventType: option.value })
  })

  it('adds an audio trigger with its default settings', () => {
    const view = renderCreation({ activeMode: 'audio' })
    act(() => view.result.current.addEventNode({ value: 'audio-trigger', label: 'Trigger' }))

    const node = added(view)
    expect(node.data.label).toBe('Audio Trigger')
    expect(node.data.payload).toEqual(buildDefaultAudioTrigger(node.id))
  })

  it('adds any other audio event as an edge-triggered threshold', () => {
    const view = renderCreation({ activeMode: 'audio' })
    act(() => view.result.current.addEventNode({ value: 'audio-energy', label: 'Energy' }))

    const node = added(view)
    expect(node.data.label).toBe('Energy')
    expect(node.data.payload).toEqual({
      id: node.id,
      type: 'event',
      eventType: 'audio-energy',
      threshold: 0.5,
      triggerMode: 'edge',
    })
  })

  it('adds an action with the default timing and the chosen effect', () => {
    const view = renderCreation()
    act(() => view.result.current.addActionNode('set-color'))

    const node = added(view)
    expect(node.data.label).toBe('set-color')
    expect(node.data.payload).toEqual({
      ...buildDefaultAction(),
      id: node.id,
      effectType: 'set-color',
    })
    expect(node.position).toEqual({ x: 500, y: 150 })
  })

  it("adds a logic node built by its type's factory", () => {
    const view = renderCreation()
    act(() => view.result.current.addLogicNode('math'))

    const node = added(view)
    expect(node.data.label).toBe('math')
    expect(node.data.payload).toEqual(LOGIC_NODE_FACTORIES.math(node.id))
  })

  it.each([
    ['an event raiser', 'addEventRaiserNode', 'event-raiser', 'Raise Event'],
    ['an event listener', 'addEventListenerNode', 'event-listener', 'Listen Event'],
    ['an effect raiser', 'addEffectRaiserNode', 'effect-raiser', 'Raise Effect'],
    ['an effect listener', 'addEffectListenerNode', 'effect-listener', 'Effect Entry'],
  ] as const)('adds %s', (_case, method, kind, label) => {
    const view = renderCreation()
    act(() => view.result.current[method]())

    const node = added(view)
    expect(node.id.startsWith(`${kind}-`)).toBe(true)
    expect(node.data.kind).toBe(kind)
    expect(node.data.label).toBe(label)
    expect(node.data.payload).toMatchObject({ id: node.id, type: kind, label })
  })

  it.each([
    ['notes', 'Notes', 'notes'],
    ['info', 'Info', 'info'],
    ['important', 'Important', 'important'],
    ['INFO', 'Info', 'info'],
  ])('adds a %s note', (variant, label, style) => {
    const view = renderCreation()
    act(() => view.result.current.addNotesNode(variant as NotesVariant))
    expect(added(view).data.payload).toMatchObject({ label, style, note: '' })
  })

  it('adds alongside what is there and marks the cue dirty', () => {
    const view = renderCreation()
    act(() => view.result.current.addActionNode('set-color'))
    act(() => view.result.current.addActionNode('set-color'))

    const ids = view.result.current.nodes.map((n) => n.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(view.setIsDirty).toHaveBeenCalledWith(true)
  })
})
