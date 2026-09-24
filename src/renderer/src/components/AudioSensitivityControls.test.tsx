/** @jest-environment jsdom */
/**
 * The gain and noise floor sliders preview as they move and store the value when the user lets go,
 * whether they were dragged or moved with the keyboard.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
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

jest.mock(
  '../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

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

  it('keeps the slider live while its save is in flight, so focus stays on it', async () => {
    const slider = await renderControls()
    saveAudioConfig.mockReturnValue(new Promise(() => {}) as never)
    slider.focus()

    fireEvent.change(slider, { target: { value: '3' } })
    fireEvent.keyUp(slider, { key: 'ArrowRight' })

    await waitFor(() => expect(saveAudioConfig).toHaveBeenCalled())
    expect(slider).not.toBeDisabled()
    expect(document.activeElement).toBe(slider)
  })

  it('stores nothing when a key that moves nothing comes up', async () => {
    const slider = await renderControls()

    fireEvent.keyUp(slider, { key: 'Shift' })
    fireEvent.keyUp(slider, { key: 'Tab' })

    expect(saveAudioConfig).not.toHaveBeenCalled()
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
    fireEvent.pointerUp(slider)

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith(expect.objectContaining({ sensitivity: 4.5 })),
    )
  })

  it('puts the slider back and says so when the gain a drag ended on is refused', async () => {
    saveAudioConfig.mockResolvedValue({ success: false, error: 'disk full' } as never)
    const slider = await renderControls()
    await waitFor(() => expect(slider).not.toBeDisabled())

    fireEvent.change(slider, { target: { value: '3' } })
    fireEvent.change(slider, { target: { value: '4.5' } })
    fireEvent.pointerUp(slider)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the audio settings.')
    expect(slider.value).toBe('2.5')
  })

  it('shows a gain as it is typed and stores it once the box is left', async () => {
    await renderControls()
    const box = screen.getByLabelText('Global sensitivity numeric') as HTMLInputElement
    await waitFor(() => expect(box).not.toBeDisabled())

    fireEvent.change(box, { target: { value: '0' } })
    expect(box.value).toBe('0')
    fireEvent.change(box, { target: { value: '0.5' } })
    expect(saveAudioConfig).not.toHaveBeenCalled()
    fireEvent.blur(box)

    await waitFor(() =>
      expect(saveAudioConfig).toHaveBeenCalledWith(expect.objectContaining({ sensitivity: 0.5 })),
    )
  })

  it('stores nothing when a number box is only focused and left', async () => {
    await renderControls()
    const box = screen.getByLabelText('Noise floor numeric')
    await waitFor(() => expect(box).not.toBeDisabled())

    fireEvent.focus(box)
    fireEvent.blur(box)
    await act(async () => {})

    expect(saveAudioConfig).not.toHaveBeenCalled()
  })
})

describe.each([
  ['compact', true],
  ['full-size', false],
])('AudioSensitivityControls %s', (_variant, compact) => {
  beforeEach(() => {
    resetIpcApiMock()
    loadAudioConfig.mockResolvedValue({ sensitivity: 2.5, noiseFloor: 60 } as never)
  })

  it('names each slider and each number box', async () => {
    renderWithProviders(<AudioSensitivityControls compact={compact} />)
    await waitFor(() => expect(loadAudioConfig).toHaveBeenCalled())

    expect(screen.getByLabelText('Global Gain')).toHaveAttribute('type', 'range')
    expect(screen.getByLabelText('Noise Floor')).toHaveAttribute('type', 'range')
    expect(screen.getByLabelText('Global sensitivity numeric')).toHaveAttribute('type', 'number')
    expect(screen.getByLabelText('Noise floor numeric')).toHaveAttribute('type', 'number')
  })
})
