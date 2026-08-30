/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as ipcApi from '../ipcApi'
import Rb3EnabledCueGroups from './Rb3EnabledCueGroups'

jest.mock('../ipcApi', () => {
  const actual = jest.requireActual<typeof import('../ipcApi')>('../ipcApi')
  return {
    ...actual,
    getRb3CueGroups: jest.fn(),
    getEnabledRb3CueGroups: jest.fn(),
    getDisabledRb3Cues: jest.fn(),
    setEnabledRb3CueGroups: jest.fn(),
    setDisabledRb3Cues: jest.fn(),
    getAvailableRb3Cues: jest.fn(),
  }
})

const getRb3CueGroups = jest.mocked(ipcApi.getRb3CueGroups)
const getEnabledRb3CueGroups = jest.mocked(ipcApi.getEnabledRb3CueGroups)
const getDisabledRb3Cues = jest.mocked(ipcApi.getDisabledRb3Cues)
const setEnabledRb3CueGroups = jest.mocked(ipcApi.setEnabledRb3CueGroups)
const setDisabledRb3Cues = jest.mocked(ipcApi.setDisabledRb3Cues)
const getAvailableRb3Cues = jest.mocked(ipcApi.getAvailableRb3Cues)

function seedHappyPath(): void {
  getRb3CueGroups.mockResolvedValue([
    { id: 'rg1', name: 'RB3 Group 1', description: 'desc1', cueTypes: [] },
    { id: 'rg2', name: 'RB3 Group 2', description: 'desc2', cueTypes: [] },
  ])
  getEnabledRb3CueGroups.mockResolvedValue(['rg1'])
  getDisabledRb3Cues.mockResolvedValue({})
  setEnabledRb3CueGroups.mockResolvedValue({ success: true })
  setDisabledRb3Cues.mockResolvedValue({ success: true })
  getAvailableRb3Cues.mockResolvedValue([
    {
      id: 'cue1',
      yargDescription: 'yarg desc',
      rb3Description: 'rb3 cue 1 desc',
      groupName: 'RB3 Group 1',
    },
  ])
}

describe('Rb3EnabledCueGroups', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('surfaces an inline error when lazy-loading RB3 cues fails, and Retry recovers', async () => {
    seedHappyPath()
    getAvailableRb3Cues.mockRejectedValueOnce(new Error('cue load boom')).mockResolvedValueOnce([
      {
        id: 'cue1',
        yargDescription: 'yarg desc',
        rb3Description: 'rb3 cue 1 desc',
        groupName: 'RB3 Group 1',
      },
    ])

    render(<Rb3EnabledCueGroups />)
    expect(screen.getByRole('heading', { name: /RB3 Lighting Cue Groups/i })).toBeTruthy()
    await screen.findByRole('button', { name: /RB3 Group 1/ })

    fireEvent.click(screen.getByRole('button', { name: /RB3 Group 1/ }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('cue load boom')

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText(/rb3 cue 1 desc/)).toBeTruthy()
  })

  it('surfaces an inline persistence error when the enabled-cue-group save fails', async () => {
    seedHappyPath()
    setEnabledRb3CueGroups.mockResolvedValueOnce({ success: false, error: 'rb3 save failed' })

    render(<Rb3EnabledCueGroups />)
    expect(screen.getByRole('heading', { name: /RB3 Lighting Cue Groups/i })).toBeTruthy()
    await screen.findByRole('button', { name: /RB3 Group 1/ })

    const enableCheckboxes = screen.getAllByRole('checkbox', { name: /Enable RB3 Group/ })
    fireEvent.click(enableCheckboxes[1])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('rb3 save failed')
  })
})
