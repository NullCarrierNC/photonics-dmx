/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { CueType } from '../../../photonics-dmx/cues/types/cueTypes'
import CueRegistrySelector from './CueRegistrySelector'

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
    resetIpcApiMock()
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
    renderWithProviders(
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
    const { rerender } = renderWithProviders(
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

  it('keeps a saved group that is not first in the list', async () => {
    const onGroupChange = jest.fn()
    renderWithProviders(
      <CueRegistrySelector
        {...baseProps}
        onGroupChange={onGroupChange}
        selectedGroupId="yarg-stagekit"
        selectedRegistryType="YARG"
      />,
    )

    await screen.findByRole('option', { name: 'YARG Fade' })
    expect(screen.getByLabelText('Cue Group')).toHaveValue('yarg-stagekit')
    expect(onGroupChange).not.toHaveBeenCalled()
  })

  it('leaves an empty selection alone until the parent has restored its own', async () => {
    const onGroupChange = jest.fn()
    const { rerender } = renderWithProviders(
      <CueRegistrySelector
        {...baseProps}
        onGroupChange={onGroupChange}
        selectedRegistryType="YARG"
        ready={false}
      />,
    )
    await screen.findByRole('option', { name: 'YARG Fade' })
    expect(onGroupChange).not.toHaveBeenCalled()

    rerender(
      <CueRegistrySelector
        {...baseProps}
        onGroupChange={onGroupChange}
        selectedRegistryType="YARG"
        ready
      />,
    )
    await waitFor(() => expect(onGroupChange).toHaveBeenCalledWith(['yarg-fade']))
  })

  it('reports a BPM when the user leaves the field, not per keystroke', async () => {
    const onBpmChange = jest.fn()
    renderWithProviders(
      <CueRegistrySelector
        {...baseProps}
        onBpmChange={onBpmChange}
        onGroupChange={jest.fn()}
        selectedGroupId="yarg-stagekit"
        selectedRegistryType="YARG"
      />,
    )
    const field = await screen.findByLabelText('BPM')

    fireEvent.change(field, { target: { value: '1' } })
    fireEvent.change(field, { target: { value: '140' } })
    expect(onBpmChange).not.toHaveBeenCalled()

    fireEvent.blur(field)
    expect(onBpmChange).toHaveBeenCalledWith(140)
  })
})
