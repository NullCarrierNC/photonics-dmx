/** @jest-environment jsdom */
/**
 * The gain and noise floor sliders preview as they move and store the value when the user lets go,
 * whether they were dragged or moved with the keyboard.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import AudioSensitivityControls from './AudioSensitivityControls'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

jest.mock('../utils/ipcHelpers', () => ({
  addIpcListener: jest.fn(),
  removeIpcListener: jest.fn(),
  registerIpcListener: jest.fn(() => () => undefined),
}))

const loadAudioConfig = jest.mocked(ipcApi.getAudioConfig)
const saveAudioConfig = jest.mocked(ipcApi.saveAudioConfig)

async function renderControls(): Promise<HTMLInputElement> {
  renderWithProviders(<AudioSensitivityControls compact />)
  const slider = await screen.findByLabelText('Global Gain')
  await waitFor(() => expect(loadAudioConfig).toHaveBeenCalled())
  return slider as HTMLInputElement
}

describe('AudioSensitivityControls', () => {
  beforeEach(() => {
    resetIpcApiMock()
    loadAudioConfig.mockResolvedValue({ sensitivity: 2.5, noiseFloor: 60 } as never)
  })

  it('stores the gain a keyboard user set', async () => {
    const slider = await renderControls()

    fireEvent.change(slider, { target: { value: '3' } })
    fireEvent.keyUp(slider, { key: 'ArrowRight' })

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith(expect.objectContaining({ sensitivity: 3 })),
    )
  })

  it('stores nothing while the slider is still moving', async () => {
    const slider = await renderControls()

    fireEvent.change(slider, { target: { value: '3' } })
    fireEvent.change(slider, { target: { value: '4' } })

    expect(saveAudioConfig).not.toHaveBeenCalled()
  })

  it('stores the gain a drag ended on', async () => {
    const slider = await renderControls()

    fireEvent.change(slider, { target: { value: '4.5' } })
    fireEvent.mouseUp(slider)

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith(expect.objectContaining({ sensitivity: 4.5 })),
    )
  })
})
