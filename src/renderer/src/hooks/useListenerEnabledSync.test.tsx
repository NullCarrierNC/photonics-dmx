/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, waitFor } from '@testing-library/react'
import { renderHookWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcHelpers from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { rb3eListenerEnabledAtom, rb3RunningModeAtom, yargListenerEnabledAtom } from '../atoms'
import type { Rb3RunningMode } from '../../../shared/ipc/listenerTypes'
import { useListenerEnabledSync } from './useListenerEnabledSync'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const handlers = new Map<string, (payload: never) => void>()

function status(
  isYargEnabled: boolean,
  isRb3Enabled: boolean,
  rb3Mode: Rb3RunningMode = isRb3Enabled ? 'cue' : 'none',
): never {
  return { success: true, isYargEnabled, isRb3Enabled, rb3Mode } as never
}

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

describe('useListenerEnabledSync', () => {
  it('reads which listener main is running on mount', async () => {
    ipcApiMock.getSystemStatus.mockResolvedValue(status(false, true))
    const { store } = renderHookWithProviders(() => useListenerEnabledSync())

    await waitFor(() => expect(store.get(rb3eListenerEnabledAtom)).toBe(true))
    expect(store.get(yargListenerEnabledAtom)).toBe(false)
  })

  it('reads it again after a restart', async () => {
    ipcApiMock.getSystemStatus.mockResolvedValue(status(true, false))
    const { store } = renderHookWithProviders(() => useListenerEnabledSync())
    await waitFor(() => expect(store.get(yargListenerEnabledAtom)).toBe(true))
    ipcApiMock.getSystemStatus.mockResolvedValue(status(false, false))

    act(() => handlers.get(RENDERER_RECEIVE.CONTROLLERS_RESTARTED)!(undefined as never))

    await waitFor(() => expect(store.get(yargListenerEnabledAtom)).toBe(false))
  })

  it('follows each start and stop main announces', async () => {
    ipcApiMock.getSystemStatus.mockResolvedValue(status(true, false))
    const { store } = renderHookWithProviders(() => useListenerEnabledSync())
    await waitFor(() => expect(store.get(yargListenerEnabledAtom)).toBe(true))

    act(() => {
      handlers.get(RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED)!({
        listener: 'yarg',
        enabled: false,
      } as never)
      handlers.get(RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED)!({
        listener: 'rb3',
        enabled: true,
        mode: 'cue',
      } as never)
    })

    expect(store.get(yargListenerEnabledAtom)).toBe(false)
    expect(store.get(rb3eListenerEnabledAtom)).toBe(true)
  })

  it('keeps the mode of the RB3 session main runs beside its switch', async () => {
    ipcApiMock.getSystemStatus.mockResolvedValue(status(false, true, 'direct'))
    const { store } = renderHookWithProviders(() => useListenerEnabledSync())
    await waitFor(() => expect(store.get(rb3RunningModeAtom)).toBe('direct'))

    act(() => {
      handlers.get(RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED)!({
        listener: 'rb3',
        enabled: false,
        mode: 'none',
      } as never)
      handlers.get(RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED)!({
        listener: 'rb3',
        enabled: true,
        mode: 'cue',
      } as never)
    })

    expect(store.get(rb3eListenerEnabledAtom)).toBe(true)
    expect(store.get(rb3RunningModeAtom)).toBe('cue')
  })

  it('keeps an announcement over a read that was already under way', async () => {
    let answerRead!: (value: never) => void
    ipcApiMock.getSystemStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          answerRead = resolve
        }) as never,
    )
    const { store } = renderHookWithProviders(() => useListenerEnabledSync())

    act(() =>
      handlers.get(RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED)!({
        listener: 'yarg',
        enabled: true,
      } as never),
    )
    await act(async () => answerRead(status(false, false)))

    expect(store.get(yargListenerEnabledAtom)).toBe(true)
  })
})
