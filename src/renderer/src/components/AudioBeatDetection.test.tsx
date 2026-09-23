/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import AudioBeatDetection from './AudioBeatDetection'

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

async function renderPanel(): Promise<void> {
  renderWithProviders(<AudioBeatDetection />)
  await waitFor(() =>
    expect((screen.getByLabelText('Minimum beat interval value') as HTMLInputElement).value).toBe(
      '100',
    ),
  )
}

/** Types one key at a time, each landing after whatever the box shows by then. */
function typeKeys(box: HTMLInputElement, keys: string): void {
  fireEvent.change(box, { target: { value: keys[0] } })
  for (const key of keys.slice(1)) {
    fireEvent.change(box, { target: { value: box.value + key } })
  }
}

const savedBeatDetection = () => {
  const calls = saveAudioConfig.mock.calls
  return calls[calls.length - 1]?.[0].beatDetection
}

describe('AudioBeatDetection number boxes', () => {
  beforeEach(() => {
    resetIpcApiMock()
    loadAudioConfig.mockResolvedValue({
      beatDetection: { threshold: 0.3, decayRate: 0.8, minInterval: 100 },
    } as never)
  })

  it('takes a minimum interval whose first digit is below the floor', async () => {
    await renderPanel()
    const box = screen.getByLabelText('Minimum beat interval value') as HTMLInputElement

    typeKeys(box, '200')
    expect(box.value).toBe('200')
    fireEvent.blur(box)

    await waitFor(() =>
      expect(savedBeatDetection()).toEqual(expect.objectContaining({ minInterval: 200 })),
    )
  })

  it.each([
    ['Detection threshold value', 'threshold', '0.05', 0.1],
    ['Decay rate value', 'decayRate', '0.9', 0.9],
    ['Minimum beat interval value', 'minInterval', '900', 500],
  ] as const)(
    'holds %s as typed and clamps it once the box is left',
    async (label, field, typed, stored) => {
      await renderPanel()
      const box = screen.getByLabelText(label) as HTMLInputElement

      fireEvent.change(box, { target: { value: typed[0] } })
      expect(box.value).toBe(typed[0])
      fireEvent.change(box, { target: { value: typed } })
      expect(saveAudioConfig).not.toHaveBeenCalled()
      fireEvent.blur(box)

      await waitFor(() =>
        expect(savedBeatDetection()).toEqual(expect.objectContaining({ [field]: stored })),
      )
    },
  )

  it('stores nothing when a box is only focused and left', async () => {
    await renderPanel()
    const box = screen.getByLabelText('Decay rate value')

    fireEvent.focus(box)
    fireEvent.blur(box)
    await act(async () => {})

    expect(saveAudioConfig).not.toHaveBeenCalled()
  })
})
