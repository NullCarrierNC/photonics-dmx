/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, render, waitFor } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import { resetIpcListenerStub } from '@renderer/tests/helpers/ipcListenerStub'
import { senderSacnEnabledAtom } from './atoms'

const mockCaptureStarts: Array<string | undefined> = []

jest.mock('./services/AudioCaptureManager', () => ({
  AudioCaptureManager: class {
    start(deviceId?: string): Promise<void> {
      mockCaptureStarts.push(deviceId)
      return Promise.resolve()
    }
    stop(): void {}
    updateConfig(): void {}
  },
}))
jest.mock(
  './ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)
jest.mock(
  './utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)
jest.mock('./components/LeftMenu', () => ({ __esModule: true, default: () => null }))
jest.mock('./components/Header', () => ({ __esModule: true, default: () => null }))
jest.mock('./components/LifecycleFailedBanner', () => ({ __esModule: true, default: () => null }))
jest.mock('./components/MasterOutputSidebar', () => ({
  __esModule: true,
  default: () => null,
  MASTER_OUTPUT_SIDEBAR_WIDTH_PX: 99,
}))
jest.mock('./components/AppPageRouter', () => ({ AppPageRouter: () => null }))
jest.mock('./assets/images/photonics-icon.png', () => 'photonics-icon.png')

import App from './App'
import { DarkModeProvider } from './DarkModeProvider'

beforeEach(() => {
  resetIpcApiMock()
  resetIpcListenerStub()
  mockCaptureStarts.length = 0
  ipcApiMock.getAppVersion.mockResolvedValue('test' as never)
  ipcApiMock.getPrefs.mockResolvedValue({} as never)
  ipcApiMock.getValidationErrors.mockResolvedValue([] as never)
  ipcApiMock.getCorruptRecoveryEvents.mockResolvedValue({ files: [] } as never)
  ipcApiMock.getDmxRigs.mockResolvedValue([] as never)
  ipcApiMock.getLightLibrary.mockResolvedValue([] as never)
  ipcApiMock.getMyLights.mockResolvedValue([] as never)
  ipcApiMock.getLightLayout.mockResolvedValue(null as never)
})

afterEach(() => cleanup())

describe('a main window opened while main runs audio and a sender', () => {
  it('starts capture on the running audio device and shows the sender on', async () => {
    ipcApiMock.getAudioEnabled.mockResolvedValue(true as never)
    ipcApiMock.getAudioConfig.mockResolvedValue({ deviceId: 'mic-1', bands: [] } as never)
    ipcApiMock.getSystemStatus.mockResolvedValue({
      success: true,
      isYargEnabled: false,
      isRb3Enabled: false,
      senderStatus: { sacn: true, artnet: false, enttecpro: false, opendmx: false, ipc: false },
    } as never)

    render(
      <DarkModeProvider>
        <App />
      </DarkModeProvider>,
    )

    await waitFor(() => expect(mockCaptureStarts).toEqual(['mic-1']))
    await waitFor(() => expect(getDefaultStore().get(senderSacnEnabledAtom)).toBe(true))
  })

  it('leaves capture off when audio is not running', async () => {
    ipcApiMock.getAudioEnabled.mockResolvedValue(false as never)

    render(
      <DarkModeProvider>
        <App />
      </DarkModeProvider>,
    )

    await waitFor(() => expect(ipcApiMock.getAudioEnabled).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockCaptureStarts).toEqual([])
  })
})
