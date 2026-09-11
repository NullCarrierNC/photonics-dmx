/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act } from '@testing-library/react'
import { renderHookWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { rb3eListenerEnabledAtom, yargListenerEnabledAtom } from '../atoms'
import { useCuePreviewInputPlatform } from './useCuePreviewInputPlatform'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const getAudioEnabled = jest.mocked(ipcApi.getAudioEnabled)

type Listeners = { yarg?: boolean; rb3e?: boolean }

function renderPlatform(listeners: Listeners) {
  return renderHookWithProviders(() => useCuePreviewInputPlatform(), {
    seed: (set) => {
      set(yargListenerEnabledAtom, listeners.yarg ?? false)
      set(rb3eListenerEnabledAtom, listeners.rb3e ?? false)
    },
  })
}

/** Lets the audio check that runs on mount settle. */
async function settle(): Promise<void> {
  await act(async () => {})
}

beforeEach(() => {
  resetIpcApiMock()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('useCuePreviewInputPlatform', () => {
  it.each<[string, Listeners, boolean, 'RB3E' | 'YARG' | 'AUDIO' | null]>([
    ['RB3E over YARG and audio', { rb3e: true, yarg: true }, true, 'RB3E'],
    ['YARG over audio', { yarg: true }, true, 'YARG'],
    ['audio when no listener is on', {}, true, 'AUDIO'],
    ['nothing when everything is off', {}, false, null],
  ])('picks %s', async (_case, listeners, audio, expected) => {
    getAudioEnabled.mockResolvedValue(audio)
    const { result } = renderPlatform(listeners)
    await settle()
    expect(result.current).toBe(expected)
  })

  it('notices audio being turned on at the next poll', async () => {
    getAudioEnabled.mockResolvedValue(false)
    const { result } = renderPlatform({})
    await settle()
    expect(result.current).toBeNull()

    getAudioEnabled.mockResolvedValue(true)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500)
    })
    expect(result.current).toBe('AUDIO')
  })

  it('stops polling on unmount', async () => {
    getAudioEnabled.mockResolvedValue(false)
    const { unmount } = renderPlatform({})
    await settle()
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })
})
