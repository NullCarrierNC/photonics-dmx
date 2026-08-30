/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import * as ipcHelpers from '../../../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels'
import type { NodeCueRuntimeErrorPayload } from '../../../../../shared/ipcTypes'
import { useErrorNodes } from './useErrorNodes'

/** Grabs the runtime-error subscriber useErrorNodes registers, so tests can drive it directly. */
function captureRuntimeErrorHandler(): () => (payload: NodeCueRuntimeErrorPayload) => void {
  // Stub the registration so it records the subscriber without needing window.api in jsdom.
  const spy = jest.spyOn(ipcHelpers, 'addIpcListener').mockImplementation(() => {})
  return () => {
    const call = spy.mock.calls.find(
      ([channel]) => channel === RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR,
    )
    if (!call) throw new Error('useErrorNodes did not subscribe to NODE_CUE_RUNTIME_ERROR')
    return call[1] as (payload: NodeCueRuntimeErrorPayload) => void
  }
}

describe('useErrorNodes graph scoping', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('highlights a node whose error names the open graph', () => {
    const getHandler = captureRuntimeErrorHandler()
    const { result } = renderHook(() => useErrorNodes('groupA:cue1'))
    act(() => getHandler()({ graphId: 'groupA:cue1', nodeId: 'node-1', message: 'boom' }))
    expect(result.current.has('node-1')).toBe(true)
  })

  it('ignores an error attributed to a different graph', () => {
    const getHandler = captureRuntimeErrorHandler()
    const { result } = renderHook(() => useErrorNodes('groupA:cue1'))
    act(() => getHandler()({ graphId: 'groupB:cue9', nodeId: 'node-2', message: 'boom' }))
    expect(result.current.has('node-2')).toBe(false)
  })

  it('still highlights an unattributed error (no graphId)', () => {
    const getHandler = captureRuntimeErrorHandler()
    const { result } = renderHook(() => useErrorNodes('groupA:cue1'))
    act(() => getHandler()({ nodeId: 'node-3', message: 'boom' }))
    expect(result.current.has('node-3')).toBe(true)
  })
})
