/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import AudioSmoothingSettings from './AudioSmoothingSettings'

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
const saveAudioConfig = jest.mocked(ipcApi.saveAudioConfig)

async function renderPanel(): Promise<HTMLInputElement> {
  renderWithProviders(<AudioSmoothingSettings />)
  const box = screen.getByLabelText('Smoothing factor value') as HTMLInputElement
  await waitFor(() => expect(box.value).toBe('0.6'))
  return box
}

describe('AudioSmoothingSettings smoothing factor box', () => {
  beforeEach(() => {
    resetIpcApiMock()
    loadAudioConfig.mockResolvedValue({ smoothing: { enabled: true, alpha: 0.6 } } as never)
  })

  it('shows a factor as it is typed and stores it once the box is left', async () => {
    const box = await renderPanel()

    fireEvent.change(box, { target: { value: '0' } })
    expect(box.value).toBe('0')
    fireEvent.change(box, { target: { value: '0.5' } })
    expect(saveAudioConfig).not.toHaveBeenCalled()
    fireEvent.blur(box)

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith({ smoothing: { enabled: true, alpha: 0.5 } }),
    )
  })

  it('holds a factor above the ceiling at 0.95', async () => {
    const box = await renderPanel()

    fireEvent.change(box, { target: { value: '2' } })
    fireEvent.blur(box)

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith({ smoothing: { enabled: true, alpha: 0.95 } }),
    )
  })

  it('stores nothing when the box is only focused and left', async () => {
    const box = await renderPanel()

    fireEvent.focus(box)
    fireEvent.blur(box)
    await act(async () => {})

    expect(saveAudioConfig).not.toHaveBeenCalled()
  })
})
