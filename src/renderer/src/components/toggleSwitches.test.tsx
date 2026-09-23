/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import {
  audioListenerEnabledAtom,
  rb3eListenerEnabledAtom,
  yargListenerEnabledAtom,
} from '../atoms'
import ListenerToggle from './ListenerToggle'
import AudioToggle from './AudioToggle'
import AudioSmoothingSettings from './AudioSmoothingSettings'
import { installWindowApi } from '@renderer/tests/helpers/windowApiStub'

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
  installWindowApi()
})

const switchNamed = (name: string) => screen.getByRole('switch', { name })

describe('toggle switches', () => {
  it('names the YARG listener switch and reports whether it is on', () => {
    renderWithProviders(<ListenerToggle listener="yarg" />, {
      seed: (set) => set(yargListenerEnabledAtom, true),
    })
    expect(switchNamed('Enable YARG')).toHaveAttribute('aria-checked', 'true')
  })

  it('names the RB3E listener switch and reports whether it is on', () => {
    renderWithProviders(<ListenerToggle listener="rb3" />)
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

  it.each([
    ['yarg', 'Enable YARG', 'enableYarg', 'disableYarg'],
    ['rb3', 'Enable RB3E', 'enableRb3', 'disableRb3'],
  ] as const)('turns the %s listener on and off', (listener, name, enableCall, disableCall) => {
    renderWithProviders(<ListenerToggle listener={listener} />)

    fireEvent.click(switchNamed(name))
    expect(ipcApiMock[enableCall]).toHaveBeenCalledTimes(1)
    expect(switchNamed(name)).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(switchNamed(name))
    expect(ipcApiMock[disableCall]).toHaveBeenCalledTimes(1)
    expect(switchNamed(name)).toHaveAttribute('aria-checked', 'false')
  })

  it.each([
    ['yarg', 'Enable YARG', rb3eListenerEnabledAtom],
    ['rb3', 'Enable RB3E', yargListenerEnabledAtom],
    ['yarg', 'Enable YARG', audioListenerEnabledAtom],
    ['rb3', 'Enable RB3E', audioListenerEnabledAtom],
  ] as const)('holds the %s switch while another listener runs', (listener, name, other) => {
    renderWithProviders(<ListenerToggle listener={listener} />, {
      seed: (set) => set(other, true),
    })

    expect(switchNamed(name)).toBeDisabled()
  })
})
