/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels'
import { useActiveNodes } from './useActiveNodes'
import {
  emitIpc,
  ipcSubscribers,
  resetIpcListenerStub,
} from '@renderer/tests/helpers/ipcListenerStub'

jest.mock(
  '../../../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

function emit(type: 'activated' | 'deactivated', cueId: string, nodeId: string): void {
  act(() => {
    emitIpc(RENDERER_RECEIVE.NODE_EXECUTION, { type, cueId, nodeId, timestamp: 0 })
  })
}

function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms)
  })
}

/** Long enough for a queued animation frame to run. */
const FRAME_MS = 20

beforeEach(() => {
  jest.useFakeTimers()
  resetIpcListenerStub()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('useActiveNodes', () => {
  it('highlights a node of the current graph from the next frame', () => {
    const { result } = renderHook(() => useActiveNodes('cue-1'))
    emit('activated', 'cue-1', 'n1')
    expect(result.current.has('n1')).toBe(false)

    advance(FRAME_MS)
    expect([...result.current]).toEqual(['n1'])
  })

  it('ignores nodes from another graph', () => {
    const { result } = renderHook(() => useActiveNodes('cue-1'))
    emit('activated', 'cue-2', 'n1')
    advance(FRAME_MS)
    expect(result.current.size).toBe(0)
  })

  it('keeps a finished node lit for the minimum highlight time', () => {
    const { result } = renderHook(() => useActiveNodes('cue-1'))
    emit('activated', 'cue-1', 'n1')
    advance(FRAME_MS)
    emit('deactivated', 'cue-1', 'n1')

    advance(299)
    expect(result.current.has('n1')).toBe(true)

    advance(1 + FRAME_MS)
    expect(result.current.has('n1')).toBe(false)
  })

  it('stays lit when the node runs again before the minimum time is up', () => {
    const { result } = renderHook(() => useActiveNodes('cue-1'))
    emit('activated', 'cue-1', 'n1')
    advance(FRAME_MS)
    emit('deactivated', 'cue-1', 'n1')
    advance(100)
    emit('activated', 'cue-1', 'n1')

    advance(500)
    expect(result.current.has('n1')).toBe(true)
  })

  it('clears every highlight when the graph closes', () => {
    const { result, rerender } = renderHook(({ id }) => useActiveNodes(id), {
      initialProps: { id: 'cue-1' as string | null },
    })
    emit('activated', 'cue-1', 'n1')
    advance(FRAME_MS)

    rerender({ id: null })
    expect(result.current.size).toBe(0)
  })

  it('stops listening on unmount', () => {
    const { unmount } = renderHook(() => useActiveNodes('cue-1'))
    expect(ipcSubscribers(RENDERER_RECEIVE.NODE_EXECUTION)).toHaveLength(1)
    unmount()
    expect(ipcSubscribers(RENDERER_RECEIVE.NODE_EXECUTION)).toEqual([])
  })
})
