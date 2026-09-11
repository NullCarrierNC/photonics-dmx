/** @jest-environment jsdom */
/**
 * The White Channel Mix Mode select: reads the preference, offers the three modes, and persists
 * the chosen one through savePrefs while updating the prefs atom.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { lightingPrefsAtom } from '../atoms'
import WhiteChannelMixModeSettings from './WhiteChannelMixModeSettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const savePrefs = jest.mocked(ipcApi.savePrefs)

function renderWith(prefs: Record<string, unknown> = {}) {
  return renderWithProviders(<WhiteChannelMixModeSettings />, {
    seed: (set) => set(lightingPrefsAtom, prefs),
  }).store
}

describe('WhiteChannelMixModeSettings', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  afterEach(() => {
    cleanup()
  })

  it('offers the three modes and defaults to Always RGBW', () => {
    renderWith()
    const select = screen.getByLabelText('Mode') as HTMLSelectElement
    expect(select).toHaveValue('always-rgbw')
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'always-rgbw',
      'strobe-rgbw',
      'w-only',
    ])
  })

  it('reflects the stored preference', () => {
    renderWith({ whiteChannelMixMode: 'strobe-rgbw' })
    expect(screen.getByLabelText('Mode')).toHaveValue('strobe-rgbw')
  })

  it('persists a change and updates the prefs atom', async () => {
    const store = renderWith()
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'w-only' } })

    await waitFor(() => expect(savePrefs).toHaveBeenCalledWith({ whiteChannelMixMode: 'w-only' }))
    await waitFor(() => expect(store.get(lightingPrefsAtom).whiteChannelMixMode).toBe('w-only'))
  })
})
