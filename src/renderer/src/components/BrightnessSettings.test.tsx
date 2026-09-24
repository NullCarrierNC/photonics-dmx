/** @jest-environment jsdom */
/**
 * The brightness levels every cue colour is scaled by. One drag or one typed number is one write.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { refused, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { lightingPrefsAtom } from '../atoms'
import BrightnessSettings from './BrightnessSettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const savePrefs = jest.mocked(ipcApi.savePrefs)

function renderPanel(): void {
  renderWithProviders(<BrightnessSettings />, {
    seed: (set) =>
      set(lightingPrefsAtom, { brightness: { low: 40, medium: 100, high: 180, max: 255 } }),
  })
}

describe('BrightnessSettings', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  it('saves once for a drag, when the user lets go', () => {
    renderPanel()
    const slider = screen.getAllByRole('slider')[0]

    fireEvent.change(slider, { target: { value: '60' } })
    fireEvent.change(slider, { target: { value: '90' } })
    expect(savePrefs).not.toHaveBeenCalled()

    fireEvent.pointerUp(slider)
    fireEvent.blur(slider)
    expect(savePrefs).toHaveBeenCalledTimes(1)
  })

  it('saves nothing when a key that moves nothing comes up', () => {
    renderPanel()
    const slider = screen.getAllByRole('slider')[0]

    fireEvent.keyUp(slider, { key: 'Shift' })
    fireEvent.keyUp(slider, { key: 'Tab' })

    expect(savePrefs).not.toHaveBeenCalled()
  })

  it('saves a typed level when the user leaves the field', async () => {
    renderPanel()
    const box = screen.getByLabelText('Low level')

    fireEvent.change(box, { target: { value: '77' } })
    expect(savePrefs).not.toHaveBeenCalled()

    fireEvent.blur(box)
    await waitFor(() =>
      expect(savePrefs).toHaveBeenCalledWith(
        expect.objectContaining({ brightness: expect.objectContaining({ low: 77 }) }),
      ),
    )
  })

  it('says so when a level cannot be saved', async () => {
    savePrefs.mockImplementation((() => Promise.resolve(refused('read only'))) as never)
    renderPanel()
    const box = screen.getByLabelText('Low level')

    fireEvent.change(box, { target: { value: '77' } })
    fireEvent.blur(box)

    await screen.findByRole('alert')
  })

  it('shows the saved level again when the save is refused', async () => {
    savePrefs.mockImplementation((() => Promise.resolve(refused('read only'))) as never)
    renderPanel()
    const box = screen.getByLabelText('Low level')

    fireEvent.change(box, { target: { value: '77' } })
    fireEvent.blur(box)

    await screen.findByRole('alert')
    expect(box).toHaveValue(40)
  })
})
