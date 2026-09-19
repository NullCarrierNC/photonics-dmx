/** @jest-environment jsdom */
/**
 * The Blackout Shortcut card: two selects, each saving only its own preference, with copy that
 * follows the chosen key.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { refused, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { lightingPrefsAtom } from '../atoms'
import BlackoutShortcutSettings from './BlackoutShortcutSettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const savePrefs = jest.mocked(ipcApi.savePrefs)
const KEY = 'Key'
const BINDING = 'Binding'

function renderWith(prefs: Record<string, unknown> = {}) {
  return renderWithProviders(<BlackoutShortcutSettings />, {
    seed: (set) => set(lightingPrefsAtom, prefs),
  }).store
}

function select(label: string): HTMLSelectElement {
  return screen.getByLabelText(label) as HTMLSelectElement
}

describe('BlackoutShortcutSettings', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  afterEach(() => {
    cleanup()
  })

  describe('the key', () => {
    it('offers the two keys', () => {
      renderWith()
      expect([...select(KEY).options].map((o) => o.value)).toEqual(['escape', 'backquote'])
    })

    it('is Escape when the preference has never been set', () => {
      renderWith()
      expect(select(KEY).value).toBe('escape')
    })

    it('reflects a stored key', () => {
      renderWith({ blackoutShortcutKey: 'backquote' })
      expect(select(KEY).value).toBe('backquote')
    })

    it('persists a change and updates the prefs atom', async () => {
      const store = renderWith()

      fireEvent.change(select(KEY), { target: { value: 'backquote' } })

      await waitFor(() =>
        expect(savePrefs).toHaveBeenCalledWith({ blackoutShortcutKey: 'backquote' }),
      )
      await waitFor(() =>
        expect(store.get(lightingPrefsAtom).blackoutShortcutKey).toBe('backquote'),
      )
    })

    it('saves only its own preference, leaving the binding untouched', async () => {
      renderWith({ blackoutShortcutScope: 'system-wide' })

      fireEvent.change(select(KEY), { target: { value: 'backquote' } })

      await waitFor(() => expect(savePrefs).toHaveBeenCalledTimes(1))
      expect(savePrefs).toHaveBeenCalledWith({ blackoutShortcutKey: 'backquote' })
    })

    it('warns that the backquote is ignored while typing', () => {
      renderWith({ blackoutShortcutKey: 'backquote' })
      expect(screen.getByText(/won't toggle the lights if you're typing/i)).toBeTruthy()
    })
  })

  describe('the binding', () => {
    it('offers the three scopes', () => {
      renderWith()
      expect([...select(BINDING).options].map((o) => o.value)).toEqual([
        'disabled',
        'focused',
        'system-wide',
      ])
    })

    it('is in-app when the preference has never been set', () => {
      renderWith()
      expect(select(BINDING).value).toBe('focused')
    })

    it('reflects a stored binding', () => {
      renderWith({ blackoutShortcutScope: 'system-wide' })
      expect(select(BINDING).value).toBe('system-wide')
    })

    it('persists a change and updates the prefs atom', async () => {
      const store = renderWith()

      fireEvent.change(select(BINDING), { target: { value: 'disabled' } })

      await waitFor(() =>
        expect(savePrefs).toHaveBeenCalledWith({ blackoutShortcutScope: 'disabled' }),
      )
      await waitFor(() =>
        expect(store.get(lightingPrefsAtom).blackoutShortcutScope).toBe('disabled'),
      )
    })

    it('says so when the save is refused, and leaves the setting as it was', async () => {
      savePrefs.mockImplementation((() => Promise.resolve(refused('read only'))) as never)
      const store = renderWith({ blackoutShortcutScope: 'focused' })

      fireEvent.change(select(BINDING), { target: { value: 'system-wide' } })

      await screen.findByRole('alert')
      expect(store.get(lightingPrefsAtom).blackoutShortcutScope).toBe('focused')
    })
  })

  describe('the system-wide warning', () => {
    it('stays hidden until the binding asks for it', () => {
      renderWith({ blackoutShortcutScope: 'focused' })
      expect(screen.queryByText(/every other application/i)).toBeNull()
    })

    it('names Escape when Escape is bound', () => {
      renderWith({ blackoutShortcutKey: 'escape', blackoutShortcutScope: 'system-wide' })
      expect(screen.getByText(/takes ESC key away from every other application/i)).toBeTruthy()
    })

    it('spells out what a claimed backquote costs elsewhere', () => {
      renderWith({ blackoutShortcutKey: 'backquote', blackoutShortcutScope: 'system-wide' })
      expect(screen.getByText(/no backticks in a terminal/i)).toBeTruthy()
    })
  })
})
