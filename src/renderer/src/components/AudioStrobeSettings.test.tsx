/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import AudioStrobeSettings from './AudioStrobeSettings'

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

async function box(name: string): Promise<HTMLInputElement> {
  renderWithProviders(<AudioStrobeSettings />)
  const input = (await screen.findByLabelText(name)) as HTMLInputElement
  await waitFor(() => expect(input.disabled).toBe(false))
  return input
}

async function typeAndLeave(input: HTMLInputElement, value: string): Promise<void> {
  fireEvent.change(input, { target: { value } })
  await act(async () => {
    fireEvent.blur(input)
  })
}

describe('AudioStrobeSettings number boxes', () => {
  beforeEach(() => {
    resetIpcApiMock()
    loadAudioConfig.mockResolvedValue({
      strobeEnabled: true,
      strobeTriggerThreshold: 0.8,
      strobeProbability: 100,
    } as never)
  })

  it('keeps the stored threshold when its box is cleared', async () => {
    const threshold = await box('Strobe trigger threshold numeric')

    await typeAndLeave(threshold, '')

    expect(saveAudioConfig).not.toHaveBeenCalled()
    expect(threshold.value).toBe('0.8')
  })

  it('stores the threshold at two decimal places', async () => {
    const threshold = await box('Strobe trigger threshold numeric')

    await typeAndLeave(threshold, '0.555')

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith(
        expect.objectContaining({ strobeTriggerThreshold: 0.56 }),
      ),
    )
  })

  it('stores a typed probability once the box is left', async () => {
    const probability = await box('Strobe probability percent')

    fireEvent.change(probability, { target: { value: '50' } })
    expect(saveAudioConfig).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.blur(probability)
    })

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith(
        expect.objectContaining({ strobeProbability: 50 }),
      ),
    )
  })
})
