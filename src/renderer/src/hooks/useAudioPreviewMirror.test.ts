/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import { audioDataAtom } from '../atoms'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { useAudioPreviewMirror } from './useAudioPreviewMirror'
import { renderHookWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import {
  emitIpc,
  ipcSubscribers,
  resetIpcListenerStub,
} from '@renderer/tests/helpers/ipcListenerStub'

jest.mock(
  '../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

beforeEach(() => {
  resetIpcListenerStub()
  getDefaultStore().set(audioDataAtom, null)
})

describe('useAudioPreviewMirror', () => {
  it('puts each mirrored audio frame in the shared store', () => {
    renderHook(() => useAudioPreviewMirror())
    const frame = { timestamp: 1 }

    emitIpc(RENDERER_RECEIVE.AUDIO_DATA_MIRROR, frame)

    expect(getDefaultStore().get(audioDataAtom)).toBe(frame)
  })

  it('puts the frame in the store the window renders from', () => {
    const { store } = renderHookWithProviders(() => useAudioPreviewMirror())
    const frame = { timestamp: 2 }

    emitIpc(RENDERER_RECEIVE.AUDIO_DATA_MIRROR, frame)

    expect(store.get(audioDataAtom)).toBe(frame)
  })

  it('clears the frame when audio is disabled', () => {
    renderHook(() => useAudioPreviewMirror())
    emitIpc(RENDERER_RECEIVE.AUDIO_DATA_MIRROR, { timestamp: 1 })

    emitIpc(RENDERER_RECEIVE.AUDIO_DISABLE, undefined)

    expect(getDefaultStore().get(audioDataAtom)).toBeNull()
  })

  it('stops listening on unmount', () => {
    const { unmount } = renderHook(() => useAudioPreviewMirror())
    unmount()
    expect(ipcSubscribers(RENDERER_RECEIVE.AUDIO_DATA_MIRROR)).toEqual([])
    expect(ipcSubscribers(RENDERER_RECEIVE.AUDIO_DISABLE)).toEqual([])
  })
})
