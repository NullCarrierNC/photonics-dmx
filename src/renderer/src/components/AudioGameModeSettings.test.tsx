/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import AudioGameModeSettings from './AudioGameModeSettings'

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

const getAudioGameMode = jest.mocked(ipcApi.getAudioGameMode)
const setAudioGameMode = jest.mocked(ipcApi.setAudioGameMode)

const stored = { enabled: false, cueDurationMin: 10, cueDurationMax: 20 }

async function renderPanel(): Promise<{ min: HTMLInputElement; max: HTMLInputElement }> {
  renderWithProviders(<AudioGameModeSettings />)
  const min = (await screen.findByLabelText('Minimum cue duration')) as HTMLInputElement
  const max = screen.getByLabelText('Maximum cue duration') as HTMLInputElement
  return { min, max }
}

/** Types a value and leaves the box. */
async function commit(box: HTMLInputElement, value: string): Promise<void> {
  fireEvent.change(box, { target: { value } })
  fireEvent.blur(box)
  await act(async () => {})
}

describe('AudioGameModeSettings cue duration boxes', () => {
  beforeEach(() => {
    resetIpcApiMock()
    getAudioGameMode.mockResolvedValue(stored as never)
    setAudioGameMode.mockImplementation(async (updates) => ({
      success: true,
      config: { ...stored, ...updates },
    }))
  })

  it('writes nothing when the boxes are only focused and left', async () => {
    const { min, max } = await renderPanel()

    for (const box of [min, max]) {
      fireEvent.focus(box)
      fireEvent.blur(box)
    }
    await act(async () => {})

    expect(setAudioGameMode).not.toHaveBeenCalled()
  })

  it('keeps the stored minimum when the box is cleared', async () => {
    const { min } = await renderPanel()

    fireEvent.change(min, { target: { value: '' } })
    expect(min.value).toBe('')
    fireEvent.blur(min)
    await act(async () => {})

    expect(min.value).toBe('10')
    expect(setAudioGameMode).not.toHaveBeenCalled()
  })

  it('raises the maximum to a minimum typed above it', async () => {
    const { min, max } = await renderPanel()

    await commit(min, '30')

    expect(setAudioGameMode).toHaveBeenCalledWith({ cueDurationMin: 30, cueDurationMax: 30 })
    expect(max.value).toBe('30')
  })

  it('holds a maximum typed below the minimum at the minimum', async () => {
    const { max } = await renderPanel()

    await commit(max, '7')

    expect(setAudioGameMode).toHaveBeenCalledWith({ cueDurationMin: 10, cueDurationMax: 10 })
    expect(max.value).toBe('10')
  })

  it('holds a duration above the ceiling at 120', async () => {
    const { max } = await renderPanel()

    await commit(max, '500')

    expect(setAudioGameMode).toHaveBeenCalledWith({ cueDurationMin: 10, cueDurationMax: 120 })
  })
})
