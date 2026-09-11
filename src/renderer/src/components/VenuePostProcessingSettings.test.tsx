/** @jest-environment jsdom */
/**
 * The Venue Post-Processing toggle: defaults to on, reflects the stored preference, and persists a
 * change through savePrefs while updating the prefs atom.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { lightingPrefsAtom } from '../atoms'
import VenuePostProcessingSettings from './VenuePostProcessingSettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const savePrefs = jest.mocked(ipcApi.savePrefs)
const LABEL = 'Apply venue post-processing to lights'

function renderWith(prefs: Record<string, unknown> = {}) {
  return renderWithProviders(<VenuePostProcessingSettings />, {
    seed: (set) => set(lightingPrefsAtom, prefs),
  }).store
}

describe('VenuePostProcessingSettings', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  afterEach(() => {
    cleanup()
  })

  it('is on when the preference has never been set', () => {
    renderWith()
    expect(screen.getByLabelText(LABEL)).toBeChecked()
  })

  it('reflects a stored opt-out', () => {
    renderWith({ venuePostProcessingEnabled: false })
    expect(screen.getByLabelText(LABEL)).not.toBeChecked()
  })

  it('persists a change and updates the prefs atom', async () => {
    const store = renderWith()
    fireEvent.click(screen.getByLabelText(LABEL))

    await waitFor(() =>
      expect(savePrefs).toHaveBeenCalledWith({ venuePostProcessingEnabled: false }),
    )
    await waitFor(() => expect(store.get(lightingPrefsAtom).venuePostProcessingEnabled).toBe(false))
  })

  it('keeps the checkbox state when savePrefs fails', async () => {
    savePrefs.mockResolvedValueOnce({ success: false, error: 'disk full' })
    const store = renderWith()
    fireEvent.click(screen.getByLabelText(LABEL))

    await waitFor(() => expect(savePrefs).toHaveBeenCalled())
    expect(screen.getByLabelText(LABEL)).toBeChecked()
    expect(store.get(lightingPrefsAtom).venuePostProcessingEnabled).toBeUndefined()
  })
})
