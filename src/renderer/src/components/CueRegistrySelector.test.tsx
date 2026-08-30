/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { render, waitFor } from '@testing-library/react'
import * as ipcApi from '../ipcApi'
import { CueType } from '../../../photonics-dmx/cues/types/cueTypes'
import CueRegistrySelector from './CueRegistrySelector'

jest.mock('../utils/ipcHelpers', () => ({
  addIpcListener: jest.fn(),
  removeIpcListener: jest.fn(),
}))

jest.mock('../ipcApi', () => {
  const actual = jest.requireActual<typeof import('../ipcApi')>('../ipcApi')
  return {
    ...actual,
    getCueGroups: jest.fn(),
    getEnabledCueGroups: jest.fn(),
    getRb3CueGroups: jest.fn(),
    getEnabledRb3CueGroups: jest.fn(),
  }
})

const getCueGroups = jest.mocked(ipcApi.getCueGroups)
const getEnabledCueGroups = jest.mocked(ipcApi.getEnabledCueGroups)
const getRb3CueGroups = jest.mocked(ipcApi.getRb3CueGroups)
const getEnabledRb3CueGroups = jest.mocked(ipcApi.getEnabledRb3CueGroups)

const baseProps = {
  onRegistryChange: jest.fn(),
  selectedVenueSize: 'Small' as const,
  onVenueSizeChange: jest.fn(),
  selectedBpm: 120,
  onBpmChange: jest.fn(),
  selectedGroupId: '',
}

describe('CueRegistrySelector', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getCueGroups.mockResolvedValue([
      { id: 'yarg-stagekit', name: 'YARG Stage Kit', description: '', cueTypes: [CueType.Chorus] },
      { id: 'yarg-fade', name: 'YARG Fade', description: '', cueTypes: [CueType.Verse] },
    ])
    getEnabledCueGroups.mockResolvedValue(['yarg-stagekit', 'yarg-fade'])
    // RB3 exposes a single enabled group (the strobe-only default).
    getRb3CueGroups.mockResolvedValue([
      {
        id: 'rb3-stagekit',
        name: 'RB3 Stage Kit',
        description: '',
        cueTypes: [CueType.Strobe_Fast],
      },
    ])
    getEnabledRb3CueGroups.mockResolvedValue(['rb3-stagekit'])
  })

  it('auto-selects and notifies the parent for a single-group RB3 registry', async () => {
    const onGroupChange = jest.fn()
    render(
      <CueRegistrySelector
        {...baseProps}
        onGroupChange={onGroupChange}
        selectedRegistryType="RB3E"
      />,
    )

    // Even though the sole group can't be chosen via the dropdown's onChange, the parent is
    // notified so the downstream cue selector enables.
    await waitFor(() => expect(onGroupChange).toHaveBeenCalledWith(['rb3-stagekit']))
  })

  it('re-selects the new registry group when switching YARG -> RB3E', async () => {
    const onGroupChange = jest.fn()
    const { rerender } = render(
      <CueRegistrySelector
        {...baseProps}
        onGroupChange={onGroupChange}
        selectedRegistryType="YARG"
      />,
    )
    // A YARG group is auto-selected first (which one depends on sort order).
    await waitFor(() =>
      expect(
        onGroupChange.mock.calls.some((c) => String((c[0] as string[])[0]).startsWith('yarg-')),
      ).toBe(true),
    )

    onGroupChange.mockClear()
    rerender(
      <CueRegistrySelector
        {...baseProps}
        onGroupChange={onGroupChange}
        selectedRegistryType="RB3E"
      />,
    )

    await waitFor(() => expect(onGroupChange).toHaveBeenCalledWith(['rb3-stagekit']))
  })
})
