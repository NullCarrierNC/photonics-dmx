/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { yargListenerEnabledAtom } from '../atoms'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

const listeners = new Map<string, (payload: unknown) => void>()

jest.mock('../utils/ipcHelpers', () => ({
  addIpcListener: (channel: string, handler: (payload: unknown) => void) => {
    listeners.set(channel, handler)
  },
  removeIpcListener: (channel: string) => {
    listeners.delete(channel)
  },
}))

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

import CuePreviewYarg from './CuePreviewYarg'

const GROUP = { id: 'yarg-motion-default', name: 'Default motion' }
const NOD = { id: 'motion-nod-slow', name: 'Nod (Slow)' }
const WAVE = { id: 'motion-wave-slow', name: 'Wave (Slow)' }

async function fire(channel: string, payload?: unknown): Promise<void> {
  await act(async () => {
    listeners.get(channel)?.(payload)
  })
}

async function renderEnabled(): Promise<void> {
  renderWithProviders(<CuePreviewYarg />, {
    seed: (set) => set(yargListenerEnabledAtom, true),
  })
  await act(async () => {})
}

describe('CuePreviewYarg motion labels', () => {
  beforeEach(() => {
    listeners.clear()
    resetIpcApiMock()
    jest.mocked(ipcApi.getMotionEnabled).mockResolvedValue(true)
    jest.mocked(ipcApi.getYargMotionCueGroups).mockResolvedValue([GROUP] as never)
    jest.mocked(ipcApi.getAvailableYargMotionCues).mockResolvedValue([NOD, WAVE] as never)
    jest.mocked(ipcApi.getRunningMotionCue).mockResolvedValue({
      ref: { groupId: GROUP.id, cueId: NOD.id },
      source: 'auto',
      manualFallback: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('seeds from the running motion cue and never reads the pinned preference', async () => {
    await renderEnabled()

    expect(await screen.findByText('Default motion')).toBeInTheDocument()
    expect(await screen.findByText('Nod (Slow)')).toBeInTheDocument()
    expect(ipcApi.getRunningMotionCue).toHaveBeenCalledWith('yarg')
    expect(ipcApi.getActiveYargMotionCue).not.toHaveBeenCalled()
  })

  it('follows the live change event and clears when the cue stops', async () => {
    await renderEnabled()
    await screen.findByText('Nod (Slow)')

    await fire(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, {
      ref: { groupId: GROUP.id, cueId: WAVE.id },
      source: 'auto',
      manualFallback: false,
    })
    expect(await screen.findByText('Wave (Slow)')).toBeInTheDocument()
    expect(screen.queryByText('Nod (Slow)')).toBeNull()

    await fire(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, {
      ref: null,
      source: 'cleared',
      manualFallback: false,
    })
    expect(screen.queryByText('Wave (Slow)')).toBeNull()
  })

  it('re-seeds from the running cue when motion is toggled', async () => {
    await renderEnabled()
    await screen.findByText('Nod (Slow)')
    await fire(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, {
      ref: null,
      source: 'cleared',
      manualFallback: false,
    })
    expect(screen.queryByText('Nod (Slow)')).toBeNull()

    await fire(RENDERER_RECEIVE.MOTION_ENABLED_CHANGED, true)

    expect(await screen.findByText('Nod (Slow)')).toBeInTheDocument()
  })

  it('shows no motion labels while the query reports nothing running', async () => {
    jest.mocked(ipcApi.getRunningMotionCue).mockResolvedValue({
      ref: null,
      source: 'cleared',
      manualFallback: false,
    })

    await renderEnabled()

    expect(screen.queryByText('Nod (Slow)')).toBeNull()
    expect(screen.getByText('No active YARG cue')).toBeInTheDocument()
  })
})
