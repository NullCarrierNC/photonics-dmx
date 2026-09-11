/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import { audioDataAtom } from '../atoms'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { useAudioPreviewMirror } from './useAudioPreviewMirror'

const mockHandlers = new Map<string, (payload: unknown) => void>()
const mockCleanups = new Map<string, jest.Mock<() => void>>()

jest.mock('../utils/ipcHelpers', () => ({
  registerIpcListener: (channel: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(channel, handler)
    const cleanup = jest.fn<() => void>()
    mockCleanups.set(channel, cleanup)
    return cleanup
  },
}))

beforeEach(() => {
  mockHandlers.clear()
  mockCleanups.clear()
  getDefaultStore().set(audioDataAtom, null)
})

describe('useAudioPreviewMirror', () => {
  it('puts each mirrored audio frame in the shared store', () => {
    renderHook(() => useAudioPreviewMirror())
    const frame = { timestamp: 1 }

    mockHandlers.get(RENDERER_RECEIVE.AUDIO_DATA_MIRROR)!(frame)

    expect(getDefaultStore().get(audioDataAtom)).toBe(frame)
  })

  it('clears the frame when audio is disabled', () => {
    renderHook(() => useAudioPreviewMirror())
    mockHandlers.get(RENDERER_RECEIVE.AUDIO_DATA_MIRROR)!({ timestamp: 1 })

    mockHandlers.get(RENDERER_RECEIVE.AUDIO_DISABLE)!(undefined)

    expect(getDefaultStore().get(audioDataAtom)).toBeNull()
  })

  it('stops listening on unmount', () => {
    const { unmount } = renderHook(() => useAudioPreviewMirror())
    unmount()
    expect(mockCleanups.get(RENDERER_RECEIVE.AUDIO_DATA_MIRROR)).toHaveBeenCalledTimes(1)
    expect(mockCleanups.get(RENDERER_RECEIVE.AUDIO_DISABLE)).toHaveBeenCalledTimes(1)
  })
})
