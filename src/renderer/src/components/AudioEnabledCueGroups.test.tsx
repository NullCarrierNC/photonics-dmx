/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as ipcApi from '../ipcApi'
import AudioEnabledCueGroups from './AudioEnabledCueGroups'

jest.mock('../ipcApi', () => {
  const actual = jest.requireActual<typeof import('../ipcApi')>('../ipcApi')
  return {
    ...actual,
    getAudioCueGroups: jest.fn(),
    getEnabledAudioCueGroups: jest.fn(),
    getDisabledAudioCues: jest.fn(),
    setEnabledAudioCueGroups: jest.fn(),
    setDisabledAudioCues: jest.fn(),
    getAvailableAudioCues: jest.fn(),
  }
})

const getAudioCueGroups = jest.mocked(ipcApi.getAudioCueGroups)
const getEnabledAudioCueGroups = jest.mocked(ipcApi.getEnabledAudioCueGroups)
const getDisabledAudioCues = jest.mocked(ipcApi.getDisabledAudioCues)
const setEnabledAudioCueGroups = jest.mocked(ipcApi.setEnabledAudioCueGroups)
const setDisabledAudioCues = jest.mocked(ipcApi.setDisabledAudioCues)
const getAvailableAudioCues = jest.mocked(ipcApi.getAvailableAudioCues)

function seedHappyPath(): void {
  getAudioCueGroups.mockResolvedValue([
    { id: 'g1', name: 'Group 1', description: 'desc1' },
    { id: 'g2', name: 'Group 2', description: 'desc2' },
  ])
  getEnabledAudioCueGroups.mockResolvedValue(['g1'])
  getDisabledAudioCues.mockResolvedValue({})
  setEnabledAudioCueGroups.mockResolvedValue({ success: true })
  setDisabledAudioCues.mockResolvedValue({ success: true })
  getAvailableAudioCues.mockResolvedValue([{ id: 'c1', description: 'cue 1' }])
}

describe('AudioEnabledCueGroups', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('surfaces a per-row error when lazy-loading cues fails, and Retry re-runs the fetch', async () => {
    seedHappyPath()
    getAvailableAudioCues
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([{ id: 'c1', description: 'cue 1' }])

    render(<AudioEnabledCueGroups />)
    expect(screen.getByRole('heading', { name: /Audio Lighting Cue Groups/i })).toBeTruthy()
    await screen.findByRole('button', { name: /Group 1/ })

    fireEvent.click(screen.getByRole('button', { name: /Group 1/ }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('boom')

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText(/cue 1/)).toBeTruthy()
  })

  it('surfaces an inline persistence error when the enabled-cue-group save fails', async () => {
    seedHappyPath()
    setEnabledAudioCueGroups.mockResolvedValueOnce({ success: false, error: 'save failed' })

    render(<AudioEnabledCueGroups />)
    expect(screen.getByRole('heading', { name: /Audio Lighting Cue Groups/i })).toBeTruthy()
    await screen.findByRole('button', { name: /Group 1/ })

    const enableCheckboxes = screen.getAllByRole('checkbox', { name: /Enable Group/ })
    fireEvent.click(enableCheckboxes[1])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('save failed')
  })

  it('does not let a stale persistence success overwrite a newer error from a fast follow-up toggle', async () => {
    seedHappyPath()
    // First toggle: setEnabled hangs until we resolve it.
    let firstResolve!: (v: { success: true }) => void
    const firstPromise = new Promise<{ success: true }>((resolve) => {
      firstResolve = resolve
    })
    setEnabledAudioCueGroups
      .mockReturnValueOnce(firstPromise)
      // Second toggle: setEnabled resolves immediately with failure.
      .mockResolvedValueOnce({ success: false, error: 'fast failure' })

    render(<AudioEnabledCueGroups />)
    expect(screen.getByRole('heading', { name: /Audio Lighting Cue Groups/i })).toBeTruthy()
    await screen.findByRole('button', { name: /Group 1/ })

    const enableCheckboxes = screen.getAllByRole('checkbox', { name: /Enable Group/ })
    const group2Checkbox = enableCheckboxes[1] as HTMLInputElement

    fireEvent.click(group2Checkbox)
    fireEvent.click(group2Checkbox)

    await waitFor(() => expect(setEnabledAudioCueGroups).toHaveBeenCalledTimes(2))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('fast failure')

    firstResolve({ success: true })

    // Stale success must not clear the newer error banner.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByRole('alert').textContent).toContain('fast failure')
  })
})
