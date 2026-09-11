/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import type { EdgeChange, NodeChange } from 'reactflow'
import type { NetNodeCueDefinition } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { useCueFlow } from './useCueFlow'

const CUE = {
  id: 'c1',
  name: 'Cue',
  cueType: 'Default',
  kind: 'lighting',
  nodes: {
    events: [{ id: 'e1', type: 'event', eventType: 'beat' }],
    actions: [{ id: 'a1', type: 'action', effectType: 'set-color' }],
  },
  connections: [{ from: 'e1', to: 'a1' }],
} as unknown as NetNodeCueDefinition

function renderFlow() {
  const setIsDirty = jest.fn<(dirty: boolean) => void>()
  const view = renderHook(() =>
    useCueFlow({ activeMode: 'yarg', cueKind: 'lighting', editorMode: 'cue', setIsDirty }),
  )
  act(() => view.result.current.loadCueIntoFlow(CUE))
  return { ...view, setIsDirty }
}

describe('useCueFlow', () => {
  it('puts a loaded cue on the canvas', () => {
    const { result } = renderFlow()
    expect(result.current.nodes.map((n) => n.id)).toEqual(['e1', 'a1'])
    expect(result.current.edges).toHaveLength(1)
  })

  it.each([
    ['a finished drag', { type: 'position', id: 'e1', dragging: false }, true],
    ['a drag still under way', { type: 'position', id: 'e1', dragging: true }, false],
    ['a removed node', { type: 'remove', id: 'e1' }, true],
    ['a selection', { type: 'select', id: 'e1', selected: true }, false],
  ])('counts %s as an edit: %s', (_case, change, edited) => {
    const { result, setIsDirty } = renderFlow()
    act(() => result.current.onNodesChange([change as NodeChange]))
    expect(setIsDirty.mock.calls.length > 0).toBe(edited)
  })

  it.each([
    ['a removed edge', { type: 'remove', id: 'any' }, true],
    ['a selected edge', { type: 'select', id: 'any', selected: true }, false],
  ])('counts %s as an edit: %s', (_case, change, edited) => {
    const { result, setIsDirty } = renderFlow()
    act(() => result.current.onEdgesChange([change as EdgeChange]))
    expect(setIsDirty.mock.calls.length > 0).toBe(edited)
  })
})
