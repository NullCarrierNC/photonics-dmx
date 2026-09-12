/** @jest-environment jsdom */
/**
 * The Advanced Mode toggle, which decides how much of the app the user can see.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { refused, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { lightingPrefsAtom } from '../atoms'
import AdvancedModeSettings from './AdvancedModeSettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const savePrefs = jest.mocked(ipcApi.savePrefs)
const LABEL = 'Enable Advanced Mode'

function renderWith(prefs: Record<string, unknown> = {}) {
  return renderWithProviders(<AdvancedModeSettings />, {
    seed: (set) => set(lightingPrefsAtom, prefs),
  }).store
}

describe('AdvancedModeSettings', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  it('turns advanced mode on and keeps it on', async () => {
    const store = renderWith({ advancedModeEnabled: false })

    fireEvent.click(screen.getByLabelText(LABEL))

    await waitFor(() => expect(store.get(lightingPrefsAtom).advancedModeEnabled).toBe(true))
    expect(savePrefs).toHaveBeenCalledWith({ advancedModeEnabled: true })
  })

  it('says so when the save is refused, and leaves the setting as it was', async () => {
    savePrefs.mockImplementation((() => Promise.resolve(refused('read only'))) as never)
    const store = renderWith({ advancedModeEnabled: false })

    fireEvent.click(screen.getByLabelText(LABEL))

    await screen.findByRole('alert')
    expect(store.get(lightingPrefsAtom).advancedModeEnabled).toBe(false)
  })
})
