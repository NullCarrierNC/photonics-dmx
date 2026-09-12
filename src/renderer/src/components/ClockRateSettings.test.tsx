/** @jest-environment jsdom */
/**
 * The clock rate field holds to the window the engine renders effects in, and saves on blur.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import ClockRateSettings from './ClockRateSettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const getClockRateMock = jest.mocked(ipcApi.getClockRate)
const setClockRateMock = jest.mocked(ipcApi.setClockRate)

beforeEach(() => {
  resetIpcApiMock()
  getClockRateMock.mockResolvedValue({ success: true, clockRate: 10 } as never)
})

async function renderPanel(): Promise<HTMLInputElement> {
  renderWithProviders(<ClockRateSettings />)
  await waitFor(() => expect(getClockRateMock).toHaveBeenCalled())
  return screen.getByLabelText('Clock Rate') as HTMLInputElement
}

describe('ClockRateSettings', () => {
  it('offers the window the engine renders effects in', async () => {
    const field = await renderPanel()

    expect(field.min).toBe('1')
    expect(field.max).toBe('50')
  })

  it('saves the slowest rate in the window when a slower one is typed', async () => {
    const field = await renderPanel()

    fireEvent.change(field, { target: { value: '80' } })
    fireEvent.blur(field)

    await waitFor(() => expect(setClockRateMock).toHaveBeenCalledWith(50))
  })

  it('saves a rate inside the window as typed', async () => {
    const field = await renderPanel()

    fireEvent.change(field, { target: { value: '25' } })
    fireEvent.blur(field)

    await waitFor(() => expect(setClockRateMock).toHaveBeenCalledWith(25))
  })
})
