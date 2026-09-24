/** @jest-environment jsdom */
/**
 * How long a YARG song may go without a cue before the fallback cue runs. Saved when the user
 * finishes with the field, in seconds on screen and milliseconds underneath.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import YargFallbackSettings from './YargFallbackSettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const load = jest.mocked(ipcApi.getYargFallbackCueTimeMs)
const save = jest.mocked(ipcApi.setYargFallbackCueTimeMs)

async function renderPanel(): Promise<HTMLInputElement> {
  renderWithProviders(<YargFallbackSettings />)
  await waitFor(() => expect(load).toHaveBeenCalled())
  return screen.getByLabelText('Fallback Time') as HTMLInputElement
}

describe('YargFallbackSettings', () => {
  beforeEach(() => {
    resetIpcApiMock()
    load.mockResolvedValue({ success: true, fallbackMs: 20000 } as never)
    save.mockResolvedValue({ success: true, fallbackMs: 30000 } as never)
  })

  it('saves nothing until the user leaves the field', async () => {
    const field = await renderPanel()

    fireEvent.change(field, { target: { value: '3' } })
    fireEvent.change(field, { target: { value: '30' } })
    expect(save).not.toHaveBeenCalled()

    fireEvent.blur(field)
    await waitFor(() => expect(save).toHaveBeenCalledWith(30000))
  })

  it('leaves the saved time alone when the field is cleared', async () => {
    const field = await renderPanel()

    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)

    expect(save).not.toHaveBeenCalled()
    expect(field).toHaveValue(20)
  })

  it('shows the saved time again when the save is refused', async () => {
    save.mockResolvedValue({ success: false, error: 'read only' } as never)
    const field = await renderPanel()

    fireEvent.change(field, { target: { value: '30' } })
    fireEvent.blur(field)

    await waitFor(() => expect(save).toHaveBeenCalledWith(30000))
    await waitFor(() => expect(field).toHaveValue(20))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the fallback time.')
  })
})
