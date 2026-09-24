/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { refused, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import MotionMasterToggle from './MotionMasterToggle'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const setMotionEnabled = jest.mocked(ipcApi.setMotionEnabled)

describe('MotionMasterToggle', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  it('tells the parent once main has stored the new state', async () => {
    const onChange = jest.fn()
    renderWithProviders(<MotionMasterToggle enabled={false} onMotionEnabledChange={onChange} />)

    fireEvent.click(screen.getByRole('checkbox'))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(true))
    expect(setMotionEnabled).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says the save failed and leaves the box where it was when main refuses', async () => {
    setMotionEnabled.mockResolvedValue(refused('read only') as never)
    const onChange = jest.fn()
    renderWithProviders(<MotionMasterToggle enabled={false} onMotionEnabledChange={onChange} />)

    fireEvent.click(screen.getByRole('checkbox'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save motion support.')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('says the save failed when the write throws', async () => {
    setMotionEnabled.mockRejectedValue(new Error('bridge gone') as never)
    renderWithProviders(<MotionMasterToggle enabled onMotionEnabledChange={jest.fn()} />)

    fireEvent.click(screen.getByRole('checkbox'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save motion support.')
  })
})
