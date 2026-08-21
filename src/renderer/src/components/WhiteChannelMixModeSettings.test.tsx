/** @jest-environment jsdom */
/**
 * The White Channel Mix Mode select: reads the preference, offers the three modes, and persists
 * the chosen one through savePrefs while updating the prefs atom.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { lightingPrefsAtom } from '../atoms'

const savePrefsMock = jest.fn(async (_p: Record<string, unknown>) => undefined)

jest.mock('../ipcApi', () => ({
  savePrefs: (...args: unknown[]) => savePrefsMock(...(args as [Record<string, unknown>])),
}))

import WhiteChannelMixModeSettings from './WhiteChannelMixModeSettings'

function renderWith(prefs: Record<string, unknown> = {}): ReturnType<typeof createStore> {
  const store = createStore()
  store.set(lightingPrefsAtom, prefs)
  render(
    <Provider store={store}>
      <WhiteChannelMixModeSettings />
    </Provider>,
  )
  return store
}

describe('WhiteChannelMixModeSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('offers the three modes and defaults to Always RGBW', () => {
    renderWith()
    const select = screen.getByLabelText('Mode') as HTMLSelectElement
    expect(select.value).toBe('always-rgbw')
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'always-rgbw',
      'strobe-rgbw',
      'w-only',
    ])
  })

  it('reflects the stored preference', () => {
    renderWith({ whiteChannelMixMode: 'strobe-rgbw' })
    expect((screen.getByLabelText('Mode') as HTMLSelectElement).value).toBe('strobe-rgbw')
  })

  it('persists a change and updates the prefs atom', async () => {
    const store = renderWith()
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'w-only' } })

    await waitFor(() =>
      expect(savePrefsMock).toHaveBeenCalledWith({ whiteChannelMixMode: 'w-only' }),
    )
    await waitFor(() => expect(store.get(lightingPrefsAtom).whiteChannelMixMode).toBe('w-only'))
  })
})
