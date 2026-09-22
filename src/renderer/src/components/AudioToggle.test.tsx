/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcHelpers from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { audioListenerEnabledAtom } from '../atoms'
import AudioToggle from './AudioToggle'

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
  ipcApiMock.getAudioGameMode.mockResolvedValue({ enabled: false } as never)
})

afterEach(() => {
  jest.restoreAllMocks()
})

const audioSwitch = () => screen.getByRole('switch', { name: 'Enable Audio' })

describe('AudioToggle', () => {
  it('shows audio on after a restart that brought it back', async () => {
    ipcApiMock.getAudioEnabled.mockResolvedValue(true as never)
    renderWithProviders(<AudioToggle />)
    await waitFor(() => expect(audioSwitch()).toHaveAttribute('aria-checked', 'true'))

    act(() => handlers.get(RENDERER_RECEIVE.CONTROLLERS_RESTARTED)!(undefined as never))

    await waitFor(() => expect(ipcApiMock.getAudioEnabled).toHaveBeenCalledTimes(2))
    expect(audioSwitch()).toHaveAttribute('aria-checked', 'true')
  })

  it('shows audio off after a restart that left it off', async () => {
    ipcApiMock.getAudioEnabled.mockResolvedValue(false as never)
    renderWithProviders(<AudioToggle />, { seed: (set) => set(audioListenerEnabledAtom, true) })
    await waitFor(() => expect(audioSwitch()).toHaveAttribute('aria-checked', 'false'))

    act(() => handlers.get(RENDERER_RECEIVE.CONTROLLERS_RESTARTED)!(undefined as never))

    await waitFor(() => expect(ipcApiMock.getAudioEnabled).toHaveBeenCalledTimes(2))
    expect(audioSwitch()).toHaveAttribute('aria-checked', 'false')
  })

  it('follows the running state main reports', async () => {
    ipcApiMock.getAudioEnabled.mockResolvedValue(false as never)
    renderWithProviders(<AudioToggle />)
    await waitFor(() => expect(ipcApiMock.getAudioEnabled).toHaveBeenCalled())

    act(() => handlers.get(RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED)!({ enabled: true } as never))

    expect(audioSwitch()).toHaveAttribute('aria-checked', 'true')
  })
})
