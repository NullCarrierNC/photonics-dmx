/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as ipcApi from '../ipcApi'
import YargEnabledCueGroups from './YargEnabledCueGroups'

jest.mock('../ipcApi', () => {
  const actual = jest.requireActual<typeof import('../ipcApi')>('../ipcApi')
  return {
    ...actual,
    getCueGroups: jest.fn(),
    getEnabledCueGroups: jest.fn(),
    getDisabledYargCues: jest.fn(),
    setEnabledCueGroups: jest.fn(),
    setDisabledYargCues: jest.fn(),
    getAvailableCues: jest.fn(),
  }
})

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
    jest.clearAllMocks()
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

    render(<YargEnabledCueGroups />)
    expect(screen.getByRole('heading', { name: /YARG Lighting Cue Groups/i })).toBeTruthy()
    await screen.findByRole('button', { name: /Yarg Group 1/ })

    fireEvent.click(screen.getByRole('button', { name: /Yarg Group 1/ }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('cue load boom')

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText(/cue 1 desc/)).toBeTruthy()
  })

  it('surfaces an inline persistence error when the enabled-cue-group save fails', async () => {
    seedHappyPath()
    setEnabledCueGroups.mockResolvedValueOnce({ success: false, error: 'yarg save failed' })

    render(<YargEnabledCueGroups />)
    expect(screen.getByRole('heading', { name: /YARG Lighting Cue Groups/i })).toBeTruthy()
    await screen.findByRole('button', { name: /Yarg Group 1/ })

    const enableCheckboxes = screen.getAllByRole('checkbox', { name: /Enable Yarg Group/ })
    fireEvent.click(enableCheckboxes[1])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('yarg save failed')
  })
})
