/** @jest-environment jsdom */
/**
 * The idle-detection times that decide when a quiet room stops counting as a performance.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { DEFAULT_AUDIO_IDLE_DETECTION } from '../../../photonics-dmx/listeners/Audio/AudioConfig'
import AudioIdleDetectionSettings from './AudioIdleDetectionSettings'

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
  renderWithProviders(<AudioIdleDetectionSettings />)
  const field = await screen.findByLabelText('Minimum low-energy time (seconds)')
  return field as HTMLInputElement
}

describe('AudioIdleDetectionSettings', () => {
  beforeEach(() => {
    resetIpcApiMock()
    loadAudioConfig.mockResolvedValue({
      idleDetection: { ...DEFAULT_AUDIO_IDLE_DETECTION, enabled: true, minIdleSeconds: 12 },
    } as never)
  })

  it('saves nothing until the user leaves the field', async () => {
    const field = await renderPanel()

    fireEvent.change(field, { target: { value: '3' } })
    fireEvent.change(field, { target: { value: '30' } })
    expect(saveAudioConfig).not.toHaveBeenCalled()

    fireEvent.blur(field)
    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          idleDetection: expect.objectContaining({ minIdleSeconds: 30 }),
        }),
      ),
    )
  })

  it('stores the threshold once the slider is let go, however long it is held', async () => {
    await renderPanel()
    const slider = screen.getByRole('slider')

    fireEvent.change(slider, { target: { value: '30' } })
    fireEvent.change(slider, { target: { value: '40' } })
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)))
    expect(saveAudioConfig).not.toHaveBeenCalled()

    fireEvent.pointerUp(slider)
    await waitFor(() => expect(saveAudioConfig).toHaveBeenCalledTimes(1))
    expect(saveAudioConfig).toHaveBeenCalledWith(
      expect.objectContaining({ idleDetection: expect.objectContaining({ thresholdPct: 40 }) }),
    )
  })

  it('leaves the saved time alone when the field is cleared', async () => {
    const field = await renderPanel()

    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)

    expect(saveAudioConfig).not.toHaveBeenCalled()
    expect(field).toHaveValue(12)
  })
})
