/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import { emitIpc } from '@renderer/tests/helpers/ipcListenerStub'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import * as ipcApi from '../ipcApi'
import YargEnabledCueGroups from './YargEnabledCueGroups'

jest.mock(
  '../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const getCueGroups = jest.mocked(ipcApi.getCueGroups)
const getEnabledCueGroups = jest.mocked(ipcApi.getEnabledCueGroups)
const getDisabledYargCues = jest.mocked(ipcApi.getDisabledYargCues)
const setEnabledCueGroups = jest.mocked(ipcApi.setEnabledCueGroups)
const setDisabledYargCues = jest.mocked(ipcApi.setDisabledYargCues)
const getAvailableCues = jest.mocked(ipcApi.getAvailableCues)

function seedHappyPath(): void {
  getCueGroups.mockResolvedValue([
    { id: 'yg1', name: 'Yarg Group 1', description: 'desc1', cueTypes: [] },
    { id: 'yg2', name: 'Yarg Group 2', description: 'desc2', cueTypes: [] },
  ])
  getEnabledCueGroups.mockResolvedValue(['yg1'])
  getDisabledYargCues.mockResolvedValue({})
  setEnabledCueGroups.mockResolvedValue({ success: true })
  setDisabledYargCues.mockResolvedValue({ success: true })
  getAvailableCues.mockResolvedValue([
    { id: 'cue1', yargDescription: 'cue 1 desc', rb3Description: '', groupName: 'Yarg Group 1' },
  ])
}

describe('YargEnabledCueGroups', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  it('surfaces an inline error when lazy-loading YARG cues fails, and Retry recovers', async () => {
    seedHappyPath()
    getAvailableCues.mockRejectedValueOnce(new Error('cue load boom')).mockResolvedValueOnce([
      {
        id: 'cue1',
        yargDescription: 'cue 1 desc',
        rb3Description: '',
        groupName: 'Yarg Group 1',
      },
    ])

    renderWithProviders(<YargEnabledCueGroups />)
    expect(screen.getByRole('heading', { name: /YARG Lighting Cue Groups/i })).toBeInTheDocument()
    await screen.findByRole('button', { name: /Yarg Group 1/ })

    fireEvent.click(screen.getByRole('button', { name: /Yarg Group 1/ }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('cue load boom')

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText(/cue 1 desc/)).toBeInTheDocument()
  })

  it('surfaces an inline persistence error when the enabled-cue-group save fails', async () => {
    seedHappyPath()
    setEnabledCueGroups.mockResolvedValueOnce({ success: false, error: 'yarg save failed' })

    renderWithProviders(<YargEnabledCueGroups />)
    expect(screen.getByRole('heading', { name: /YARG Lighting Cue Groups/i })).toBeInTheDocument()
    await screen.findByRole('button', { name: /Yarg Group 1/ })

    const enableCheckboxes = screen.getAllByRole('checkbox', { name: /Enable Yarg Group/ })
    fireEvent.click(enableCheckboxes[1])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('yarg save failed')
  })

  it('puts the enabled groups back when the disabled-cues write that follows fails', async () => {
    // The two writes are not one transaction. Without a rollback the enabled list is on disk while
    // the panel still shows the old one, so the next launch starts on a state nobody chose.
    seedHappyPath()
    setDisabledYargCues.mockResolvedValueOnce({ success: false, error: 'disabled save failed' })

    renderWithProviders(<YargEnabledCueGroups />)
    await screen.findByRole('button', { name: /Yarg Group 1/ })

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Enable Yarg Group/ })[1])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('disabled save failed')
    await waitFor(() => expect(setEnabledCueGroups).toHaveBeenCalledTimes(2))
    expect(setEnabledCueGroups).toHaveBeenLastCalledWith(['yg1'])
  })

  it('shows a group enabled elsewhere', async () => {
    seedHappyPath()
    renderWithProviders(<YargEnabledCueGroups />)
    await screen.findByRole('button', { name: /Yarg Group 1/ })

    getEnabledCueGroups.mockResolvedValue(['yg1', 'yg2'])
    await act(async () => emitIpc(RENDERER_RECEIVE.YARG_CUE_GROUPS_CHANGED, undefined))

    const enableCheckboxes = screen.getAllByRole('checkbox', { name: /Enable Yarg Group/ })
    await waitFor(() => expect(enableCheckboxes[1]).toBeChecked())
  })
})
