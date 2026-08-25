/** @jest-environment jsdom */
/**
 * The Venue Post-Processing toggle: defaults to on, reflects the stored preference, and persists a
 * change through savePrefs while updating the prefs atom.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { lightingPrefsAtom } from '../atoms'

const savePrefsMock = jest.fn<
  (
    updates: Record<string, unknown>,
  ) => Promise<{ success: true } | { success: false; error: string }>
>(async () => ({ success: true }))

jest.mock('../ipcApi', () => ({
  savePrefs: (...args: unknown[]) => savePrefsMock(...(args as [Record<string, unknown>])),
}))

import VenuePostProcessingSettings from './VenuePostProcessingSettings'

const LABEL = 'Apply venue post-processing to lights'

function renderWith(prefs: Record<string, unknown> = {}): ReturnType<typeof createStore> {
  const store = createStore()
  store.set(lightingPrefsAtom, prefs)
  render(
    <Provider store={store}>
      <VenuePostProcessingSettings />
    </Provider>,
  )
  return store
}

describe('VenuePostProcessingSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('is on when the preference has never been set', () => {
    renderWith()
    expect((screen.getByLabelText(LABEL) as HTMLInputElement).checked).toBe(true)
  })

  it('reflects a stored opt-out', () => {
    renderWith({ venuePostProcessingEnabled: false })
    expect((screen.getByLabelText(LABEL) as HTMLInputElement).checked).toBe(false)
  })

  it('persists a change and updates the prefs atom', async () => {
    const store = renderWith()
    fireEvent.click(screen.getByLabelText(LABEL))

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({ venuePostProcessingEnabled: false }),
    )
    await waitFor(() => expect(store.get(lightingPrefsAtom).venuePostProcessingEnabled).toBe(false))
  })

  it('keeps the checkbox state when savePrefs fails', async () => {
    savePrefsMock.mockResolvedValueOnce({ success: false, error: 'disk full' })
    const store = renderWith()
    fireEvent.click(screen.getByLabelText(LABEL))

    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())
    expect((screen.getByLabelText(LABEL) as HTMLInputElement).checked).toBe(true)
    expect(store.get(lightingPrefsAtom).venuePostProcessingEnabled).toBeUndefined()
  })
})
