/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import AudioDeviceSelector from './AudioDeviceSelector'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

jest.mock(
  '../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

const loadAudioConfig = jest.mocked(ipcApi.getAudioConfig)

describe('AudioDeviceSelector', () => {
  beforeEach(() => {
    resetIpcApiMock()
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' }],
      },
    })
  })

  it('says so when the stored audio configuration cannot be read', async () => {
    loadAudioConfig.mockRejectedValue(new Error('offline'))

    renderWithProviders(<AudioDeviceSelector />)

    expect(await screen.findByText('Failed to load audio configuration')).toBeInTheDocument()
  })

  it('shows the stored device once the configuration loads', async () => {
    loadAudioConfig.mockResolvedValue({ deviceId: 'mic-1' } as never)

    renderWithProviders(<AudioDeviceSelector />)

    expect(await screen.findByDisplayValue('Mic')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load audio configuration')).toBeNull()
  })
})
