/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import { audioListenerEnabledAtom, yargListenerEnabledAtom } from '../atoms'
import YargToggle from './YargToggle'
import Rb3Toggle from './Rb3Toggle'
import AudioToggle from './AudioToggle'
import AudioSmoothingSettings from './AudioSmoothingSettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

jest.mock('../hooks/useAudioConfigFields', () => ({
  useAudioConfigFields: () => ({
    values: { smoothing: { enabled: true, alpha: 0.7 } },
    isSaving: false,
    save: () => Promise.resolve(),
    set: () => {},
    commit: () => Promise.resolve(),
  }),
}))

beforeEach(() => {
  resetIpcApiMock()
  Object.defineProperty(window, 'api', {
    value: { receive: jest.fn(() => jest.fn()), invoke: jest.fn() },
    configurable: true,
  })
})

const switchNamed = (name: string) => screen.getByRole('switch', { name })

describe('toggle switches', () => {
  it('names the YARG listener switch and reports whether it is on', () => {
    renderWithProviders(<YargToggle />, { seed: (set) => set(yargListenerEnabledAtom, true) })
    expect(switchNamed('Enable YARG')).toHaveAttribute('aria-checked', 'true')
  })

  it('names the RB3E listener switch and reports whether it is on', () => {
    renderWithProviders(<Rb3Toggle />)
    expect(switchNamed('Enable RB3E')).toHaveAttribute('aria-checked', 'false')
  })

  it('names the audio listener and game mode switches', async () => {
    ipcApiMock.getAudioEnabled.mockResolvedValue(true as never)
    ipcApiMock.getAudioGameMode.mockResolvedValue({ enabled: true } as never)
    renderWithProviders(<AudioToggle />, { seed: (set) => set(audioListenerEnabledAtom, true) })
    expect(switchNamed('Enable Audio')).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(switchNamed('Game mode')).toHaveAttribute('aria-checked', 'true'))
  })

  it('names the smoothing switch and reports whether it is on', () => {
    renderWithProviders(<AudioSmoothingSettings />)
    expect(switchNamed('Enable Smoothing')).toHaveAttribute('aria-checked', 'true')
  })
})
