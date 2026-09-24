/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import MotionEnabledCueGroups from './MotionEnabledCueGroups'

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
    resetIpcApiMock()
  })

  it('surfaces an inline error when lazy-loading motion cues fails, and Retry recovers', async () => {
    seedHappyPath()
    getAvailableYargMotionCues
      .mockRejectedValueOnce(new Error('lazy boom'))
      .mockResolvedValueOnce([{ id: 'm1', name: 'Motion 1', description: 'desc' }])

    renderWithProviders(<MotionEnabledCueGroups platform="yarg" />)
    await screen.findByRole('button', { name: /Motion Group 1/ })

    fireEvent.click(screen.getByRole('button', { name: /Motion Group 1/ }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('lazy boom')

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText(/Motion 1/)).toBeInTheDocument()
  })

  it('names the program, its id and what it does on one row', async () => {
    seedHappyPath()

    renderWithProviders(<MotionEnabledCueGroups platform="yarg" />)
    await screen.findByRole('button', { name: /Motion Group 1/ })

    fireEvent.click(screen.getByRole('button', { name: /Motion Group 1/ }))

    const name = await screen.findByText(/Motion 1/)
    const row = name.closest('p')
    expect(row?.textContent).toContain('Motion 1')
    expect(row?.textContent).toContain('(m1)')
    expect(row?.textContent).toContain('desc')
    expect(screen.getByText(/Motion programs in this group \(1\)/)).toBeInTheDocument()
  })

  it('surfaces an inline persistence error when the enabled-motion-group save fails', async () => {
    seedHappyPath()
    setEnabledYargMotionCueGroups.mockResolvedValueOnce({
      success: false,
      error: 'persist failed',
    })

    renderWithProviders(<MotionEnabledCueGroups platform="yarg" />)
    await screen.findByRole('button', { name: /Motion Group 1/ })

    const enableCheckboxes = screen.getAllByRole('checkbox', { name: /Enable Motion Group/ })
    fireEvent.click(enableCheckboxes[1])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('persist failed')
  })
})

describe('MotionEnabledCueGroups (rb3)', () => {
  const getRb3MotionCueGroups = jest.mocked(ipcApi.getRb3MotionCueGroups)
  const getEnabledRb3MotionCueGroups = jest.mocked(ipcApi.getEnabledRb3MotionCueGroups)
  const getDisabledRb3MotionCues = jest.mocked(ipcApi.getDisabledRb3MotionCues)
  const getAvailableRb3MotionCues = jest.mocked(ipcApi.getAvailableRb3MotionCues)

  beforeEach(() => {
    resetIpcApiMock()
  })

  it('routes to the RB3 motion IPC wrappers and titles the list for RB3', async () => {
    getRb3MotionCueGroups.mockResolvedValue([{ id: 'rmg1', name: 'RB3 Motion 1', cueCount: 1 }])
    getEnabledRb3MotionCueGroups.mockResolvedValue(['rmg1'])
    getDisabledRb3MotionCues.mockResolvedValue({})
    getAvailableRb3MotionCues.mockResolvedValue([
      { id: 'rm1', name: 'RB3 Prog 1', description: 'd' },
    ])

    renderWithProviders(<MotionEnabledCueGroups platform="rb3" />)

    expect(screen.getByRole('heading', { name: /RB3 Motion Cue Groups/i })).toBeInTheDocument()
    await screen.findByRole('button', { name: /RB3 Motion 1/ })
    // The rb3 platform must not fall through to the YARG wrappers.
    expect(getRb3MotionCueGroups).toHaveBeenCalled()
    expect(jest.mocked(ipcApi.getYargMotionCueGroups)).not.toHaveBeenCalled()
  })
})
