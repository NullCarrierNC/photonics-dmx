/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import type { Edge } from 'reactflow'
import type { EditorNode } from '../lib/types'
import type {
  EffectDefinition,
  EffectRaiserNode,
  NetNodeCueDefinition,
  YargEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { useFlowSync } from './useFlowSync'

const CUE = {
  id: 'c1',
  name: 'Cue',
  cueType: 'Default',
  kind: 'lighting',
  nodes: {
    events: [{ id: 'e1', type: 'event', eventType: 'beat' }],
    actions: [{ id: 'a1', type: 'action', effectType: 'set-color' }],
    effectRaisers: [
      {
        id: 'r1',
        type: 'effect-raiser',
        effectId: 'sweep',
        parameterValues: {
          speed: { source: 'literal', value: 9 },
          stale: { source: 'literal', value: 1 },
        },
      },
    ],
  },
  connections: [{ from: 'e1', to: 'a1' }],
  effects: [{ effectId: 'sweep', name: 'Old Sweep' }],
} as unknown as NetNodeCueDefinition

const SWEEP = {
  id: 'sweep',
  name: 'Sweep',
  mode: 'yarg',
  nodes: { actions: [], effectListeners: [{ id: 'l1', type: 'effect-listener' }] },
  connections: [],
  variables: [
    { name: 'speed', type: 'number', scope: 'cue', isParameter: true, initialValue: 1 },
    { name: 'colour', type: 'string', scope: 'cue', isParameter: true, initialValue: 'red' },
    { name: 'scratch', type: 'number', scope: 'cue', isParameter: false, initialValue: 0 },
  ],
} as unknown as YargEffectDefinition

function renderSync() {
  const onCueLoaded = jest.fn()
  const view = renderHook(
    ({ definitions }: { definitions?: Map<string, EffectDefinition> }) => {
      const [nodes, setNodes] = useState<EditorNode[]>([])
      const [edges, setEdges] = useState<Edge[]>([])
      return {
        nodes,
        edges,
        ...useFlowSync({ setNodes, setEdges, effectDefinitions: definitions, onCueLoaded }),
      }
    },
    { initialProps: {} },
  )
  return { ...view, onCueLoaded }
}

function raiser(nodes: EditorNode[]): EditorNode {
  return nodes.find((n) => n.id === 'r1')!
}

describe('useFlowSync', () => {
  it('lays a cue out on the canvas and reports it loaded', () => {
    const { result, onCueLoaded } = renderSync()
    act(() => result.current.loadCueIntoFlow(CUE))
    expect(result.current.nodes.map((n) => n.id)).toEqual(['e1', 'a1', 'r1'])
    expect(result.current.edges.map((e) => [e.source, e.target])).toEqual([['e1', 'a1']])
    expect(onCueLoaded).toHaveBeenCalledTimes(1)
  })

  it('lays an effect out through the effect transform', () => {
    const { result } = renderSync()
    act(() => result.current.loadCueIntoFlow(SWEEP))
    expect(result.current.nodes.map((n) => [n.id, n.data.kind])).toEqual([
      ['l1', 'effect-listener'],
    ])
  })

  it('empties the canvas for no cue', () => {
    const { result } = renderSync()
    act(() => result.current.loadCueIntoFlow(CUE))
    act(() => result.current.loadCueIntoFlow(null))
    expect(result.current.nodes).toEqual([])
    expect(result.current.edges).toEqual([])
  })

  it("fills an effect raiser's parameters from the effect it raises", () => {
    const { result, rerender } = renderSync()
    act(() => result.current.loadCueIntoFlow(CUE))
    rerender({ definitions: new Map([['sweep', SWEEP]]) })

    const { data } = raiser(result.current.nodes)
    expect(data.effectName).toBe('Sweep')
    expect(data.label).toBe('Effect: Sweep')
    expect(data.parameterDefinitions?.map((def) => def.name)).toEqual(['speed', 'colour'])
    expect((data.payload as EffectRaiserNode).parameterValues).toEqual({
      speed: { source: 'literal', value: 9 },
      colour: { source: 'literal', value: 'red' },
    })
  })

  it('leaves an array parameter to the initial value of the effect it raises', () => {
    const withLights = {
      ...SWEEP,
      variables: [
        ...SWEEP.variables!,
        { name: 'targets', type: 'light-array', scope: 'cue', isParameter: true, initialValue: [] },
        { name: 'palette', type: 'color-array', scope: 'cue', isParameter: true, initialValue: [] },
      ],
    } as YargEffectDefinition
    const { result, rerender } = renderSync()
    act(() => result.current.loadCueIntoFlow(CUE))
    rerender({ definitions: new Map([['sweep', withLights]]) })

    expect((raiser(result.current.nodes).data.payload as EffectRaiserNode).parameterValues).toEqual(
      {
        speed: { source: 'literal', value: 9 },
        colour: { source: 'literal', value: 'red' },
      },
    )
  })

  it('leaves the nodes alone when the definitions change nothing', () => {
    const { result, rerender } = renderSync()
    act(() => result.current.loadCueIntoFlow(CUE))
    rerender({ definitions: new Map([['sweep', SWEEP]]) })
    const nodes = result.current.nodes

    rerender({ definitions: new Map([['sweep', SWEEP]]) })
    expect(result.current.nodes).toBe(nodes)
  })
})
