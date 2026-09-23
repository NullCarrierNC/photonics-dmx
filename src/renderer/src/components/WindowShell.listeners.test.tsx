/** @jest-environment jsdom */
import '@testing-library/jest-dom/jest-globals'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import { emitIpc, resetIpcListenerStub } from '@renderer/tests/helpers/ipcListenerStub'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

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

import WindowShell from './WindowShell'
import YargToggle from './YargToggle'
import AudioToggle from './AudioToggle'

beforeEach(() => {
  resetIpcApiMock()
  resetIpcListenerStub()
  ipcApiMock.getSystemStatus.mockResolvedValue({
    success: true,
    isYargEnabled: true,
    isRb3Enabled: false,
  } as never)
  ipcApiMock.getAudioEnabled.mockResolvedValue(false as never)
  ipcApiMock.getAudioGameMode.mockResolvedValue({ enabled: false } as never)
})

afterEach(() => cleanup())

describe('listener switches in every window', () => {
  it('shows YARG off in the main window once audio starts from another window', async () => {
    renderWithProviders(
      <WindowShell>
        <YargToggle />
        <AudioToggle />
      </WindowShell>,
    )
    const yarg = screen.getByRole('switch', { name: 'Enable YARG' })
    await waitFor(() => expect(yarg).toHaveAttribute('aria-checked', 'true'))

    act(() => {
      emitIpc(RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED, { listener: 'yarg', enabled: false })
      emitIpc(RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED, { enabled: true })
    })

    expect(yarg).toHaveAttribute('aria-checked', 'false')
    expect(yarg).toBeDisabled()
    const audio = screen.getByRole('switch', { name: 'Enable Audio' })
    expect(audio).toHaveAttribute('aria-checked', 'true')
    expect(audio).toBeEnabled()
  })

  it('locks the Audio Preview switch while YARG runs', async () => {
    renderWithProviders(
      <WindowShell>
        <AudioToggle />
      </WindowShell>,
    )

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Enable Audio' })).toBeDisabled())
  })
})
