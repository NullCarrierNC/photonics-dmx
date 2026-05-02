/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as ipcApi from '../ipcApi'
import MotionEnabledCueGroups from './MotionEnabledCueGroups'

jest.mock('../ipcApi', () => {
  const actual = jest.requireActual<typeof import('../ipcApi')>('../ipcApi')
  return {
    ...actual,
    getYargMotionCueGroups: jest.fn(),
    getEnabledYargMotionCueGroups: jest.fn(),
    getDisabledYargMotionCues: jest.fn(),
    setEnabledYargMotionCueGroups: jest.fn(),
    setDisabledYargMotionCues: jest.fn(),
    getAvailableYargMotionCues: jest.fn(),
  }
})

const getYargMotionCueGroups = jest.mocked(ipcApi.getYargMotionCueGroups)
const getEnabledYargMotionCueGroups = jest.mocked(ipcApi.getEnabledYargMotionCueGroups)
const getDisabledYargMotionCues = jest.mocked(ipcApi.getDisabledYargMotionCues)
const setEnabledYargMotionCueGroups = jest.mocked(ipcApi.setEnabledYargMotionCueGroups)
const getAvailableYargMotionCues = jest.mocked(ipcApi.getAvailableYargMotionCues)

function seedHappyPath(): void {
  getYargMotionCueGroups.mockResolvedValue([
    { id: 'mg1', name: 'Motion Group 1', cueCount: 1 },
    { id: 'mg2', name: 'Motion Group 2', cueCount: 1 },
  ])
  getEnabledYargMotionCueGroups.mockResolvedValue(['mg1'])
  getDisabledYargMotionCues.mockResolvedValue({})
  setEnabledYargMotionCueGroups.mockResolvedValue({ success: true })
  jest.mocked(ipcApi.setDisabledYargMotionCues).mockResolvedValue({ success: true })
  getAvailableYargMotionCues.mockResolvedValue([
    { id: 'm1', name: 'Motion 1', description: 'desc' },
  ])
}

describe('MotionEnabledCueGroups (yarg)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('surfaces an inline error when lazy-loading motion cues fails, and Retry recovers', async () => {
    seedHappyPath()
    getAvailableYargMotionCues
      .mockRejectedValueOnce(new Error('lazy boom'))
      .mockResolvedValueOnce([{ id: 'm1', name: 'Motion 1', description: 'desc' }])

    render(<MotionEnabledCueGroups platform="yarg" />)
    await screen.findByRole('button', { name: /Motion Group 1/ })

    fireEvent.click(screen.getByRole('button', { name: /Motion Group 1/ }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('lazy boom')

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText(/Motion 1/)).toBeTruthy()
  })

  it('surfaces an inline persistence error when the enabled-motion-group save fails', async () => {
    seedHappyPath()
    setEnabledYargMotionCueGroups.mockResolvedValueOnce({
      success: false,
      error: 'persist failed',
    })

    render(<MotionEnabledCueGroups platform="yarg" />)
    await screen.findByRole('button', { name: /Motion Group 1/ })

    const enableCheckboxes = screen.getAllByRole('checkbox', { name: /Enable Motion Group/ })
    fireEvent.click(enableCheckboxes[1])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('persist failed')
  })
})
