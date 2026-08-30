/** @jest-environment jsdom */
/**
 * The preview's DMX intake, through the shared {@link useRigDmxValues} subscription. The publisher
 * pushes buffers at its output rate (up to 44 Hz) and every applied buffer re-renders the live
 * preview subtrees, so buffers coalesce to one atom write per animation frame: a render pass slower
 * than the send rate drops the frames it missed rather than queueing them.
 */
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals'
import { renderHook, act } from '@testing-library/react'
import { Provider, createStore, useAtomValue } from 'jotai'
import React from 'react'
import * as ipcHelpers from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { dmxValuesAtom, previewRigIdAtom } from '../atoms'
import type { DmxValuesPayload } from '../../../shared/ipcTypes'
import { useDmxPreview } from './useDmxPreview'

jest.mock('../ipcApi', () => ({
  getDmxRig: jest.fn(async () => null),
  enableSender: jest.fn(),
}))

/** Captured DMX_VALUES subscriber, so tests can push payloads the way the main process would. */
let emitDmxValues: ((payload: DmxValuesPayload) => void) | null = null
/** Pending rAF callbacks, run only when a test explicitly advances a frame. */
let frameCallbacks: FrameRequestCallback[] = []

function rigsPayload(value: number): DmxValuesPayload {
  return { kind: 'rigs', rigBuffers: { 'rig-1': { 1: value } } } as DmxValuesPayload
}

function runAnimationFrame(): void {
  const due = frameCallbacks
  frameCallbacks = []
  act(() => {
    due.forEach((cb) => cb(0))
  })
}

beforeEach(() => {
  emitDmxValues = null
  frameCallbacks = []
  jest.spyOn(ipcHelpers, 'registerIpcListener').mockImplementation((channel, listener) => {
    if (channel === RENDERER_RECEIVE.DMX_VALUES) {
      emitDmxValues = listener as (payload: DmxValuesPayload) => void
    }
    return () => {
      if (channel === RENDERER_RECEIVE.DMX_VALUES) emitDmxValues = null
    }
  })
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frameCallbacks.push(cb)
    return frameCallbacks.length
  })
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
    frameCallbacks = []
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

/** Renders the hook alongside a live read of the atom it writes, with a rig selected to preview. */
function renderPreview() {
  const store = createStore()
  store.set(previewRigIdAtom, 'rig-1')
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  return renderHook(
    () => {
      useDmxPreview()
      return useAtomValue(dmxValuesAtom)
    },
    { wrapper },
  )
}

describe('useDmxPreview DMX intake', () => {
  it('applies only the newest buffer of a burst, once per animation frame', () => {
    const { result } = renderPreview()

    act(() => {
      emitDmxValues!(rigsPayload(10))
      emitDmxValues!(rigsPayload(20))
      emitDmxValues!(rigsPayload(30))
    })

    // Nothing lands until the frame runs, and only one frame is scheduled for the whole burst.
    expect(result.current).toEqual({})
    expect(frameCallbacks).toHaveLength(1)

    runAnimationFrame()

    // The two superseded buffers are dropped rather than replayed.
    expect(result.current).toEqual({ 1: 30 })
  })

  it('applies the newest buffer on each successive frame', () => {
    const { result } = renderPreview()

    act(() => emitDmxValues!(rigsPayload(11)))
    runAnimationFrame()
    expect(result.current).toEqual({ 1: 11 })

    act(() => emitDmxValues!(rigsPayload(22)))
    runAnimationFrame()
    expect(result.current).toEqual({ 1: 22 })
  })

  it('does not schedule a frame when no buffer has arrived', () => {
    renderPreview()
    expect(frameCallbacks).toHaveLength(0)
  })

  it('cancels a pending frame on unmount', () => {
    const cancelSpy = jest.spyOn(window, 'cancelAnimationFrame')
    const { unmount } = renderPreview()

    act(() => emitDmxValues!(rigsPayload(5)))
    unmount()

    expect(cancelSpy).toHaveBeenCalled()
  })
})
