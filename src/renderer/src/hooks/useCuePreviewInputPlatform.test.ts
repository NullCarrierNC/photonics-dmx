/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act } from '@testing-library/react'
import { renderHookWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import {
  audioListenerEnabledAtom,
  rb3eListenerEnabledAtom,
  yargListenerEnabledAtom,
} from '../atoms'
import { useCuePreviewInputPlatform } from './useCuePreviewInputPlatform'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const getAudioEnabled = jest.mocked(ipcApi.getAudioEnabled)

type Listeners = { yarg?: boolean; rb3e?: boolean; audio?: boolean }

function renderPlatform(listeners: Listeners) {
  return renderHookWithProviders(() => useCuePreviewInputPlatform(), {
    seed: (set) => {
      set(yargListenerEnabledAtom, listeners.yarg ?? false)
      set(rb3eListenerEnabledAtom, listeners.rb3e ?? false)
      set(audioListenerEnabledAtom, listeners.audio ?? false)
    },
  })
}

beforeEach(() => {
  resetIpcApiMock()
})

describe('useCuePreviewInputPlatform', () => {
  it.each<[string, Listeners, 'RB3E' | 'YARG' | 'AUDIO' | null]>([
    ['RB3E over YARG and audio', { rb3e: true, yarg: true, audio: true }, 'RB3E'],
    ['YARG over audio', { yarg: true, audio: true }, 'YARG'],
    ['audio when no listener is on', { audio: true }, 'AUDIO'],
    ['nothing when everything is off', {}, null],
  ])('picks %s', (_case, listeners, expected) => {
    const { result } = renderPlatform(listeners)
    expect(result.current).toBe(expected)
  })

  it('follows the shared audio state without asking main', () => {
    const { result, store } = renderPlatform({})
    expect(result.current).toBeNull()

    act(() => store.set(audioListenerEnabledAtom, true))

    expect(result.current).toBe('AUDIO')
    expect(getAudioEnabled).not.toHaveBeenCalled()
  })
})
