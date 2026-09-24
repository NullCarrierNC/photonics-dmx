/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, waitFor } from '@testing-library/react'
import { renderHookWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcHelpers from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { audioListenerEnabledAtom } from '../atoms'
import { useAudioEnabledSync } from './useAudioEnabledSync'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const handlers = new Map<string, (payload: never) => void>()

beforeEach(() => {
  resetIpcApiMock()
  handlers.clear()
  jest.spyOn(ipcHelpers, 'registerIpcListener').mockImplementation((channel, handler) => {
    handlers.set(channel, handler as (payload: never) => void)
    return jest.fn()
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('useAudioEnabledSync', () => {
  it('reads what main is running on mount', async () => {
    ipcApiMock.getAudioEnabled.mockResolvedValue(true as never)
    const { store } = renderHookWithProviders(() => useAudioEnabledSync())

    await waitFor(() => expect(store.get(audioListenerEnabledAtom)).toBe(true))
  })

  it('reads it again after a restart that brought audio back', async () => {
    ipcApiMock.getAudioEnabled.mockResolvedValue(true as never)
    const { store } = renderHookWithProviders(() => useAudioEnabledSync())
    await waitFor(() => expect(store.get(audioListenerEnabledAtom)).toBe(true))

    act(() => handlers.get(RENDERER_RECEIVE.CONTROLLERS_RESTARTED)!(undefined as never))

    await waitFor(() => expect(ipcApiMock.getAudioEnabled).toHaveBeenCalledTimes(2))
    expect(store.get(audioListenerEnabledAtom)).toBe(true)
  })

  it('follows each start and stop main announces', async () => {
    ipcApiMock.getAudioEnabled.mockResolvedValue(false as never)
    const { store } = renderHookWithProviders(() => useAudioEnabledSync())
    await waitFor(() => expect(ipcApiMock.getAudioEnabled).toHaveBeenCalled())

    act(() => handlers.get(RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED)!({ enabled: true } as never))

    expect(store.get(audioListenerEnabledAtom)).toBe(true)
  })

  it('keeps an announcement over a read that was already under way', async () => {
    let answerRead!: (enabled: boolean) => void
    ipcApiMock.getAudioEnabled.mockImplementation(
      () =>
        new Promise((resolve) => {
          answerRead = resolve
        }) as never,
    )
    const { store } = renderHookWithProviders(() => useAudioEnabledSync())

    act(() => handlers.get(RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED)!({ enabled: true } as never))
    await act(async () => answerRead(false))

    expect(store.get(audioListenerEnabledAtom)).toBe(true)
  })
})
