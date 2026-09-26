/** @jest-environment jsdom */
/**
 * The RB3 processing mode picker, which decides whether RB3E LED data drives the lights directly
 * or runs through the node cue system.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { refused, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { lightingPrefsAtom } from '../atoms'
import StageKitRb3EnhancedSettings from './StageKitRb3EnhancedSettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const savePrefs = jest.mocked(ipcApi.savePrefs)

function renderPanel() {
  return renderWithProviders(<StageKitRb3EnhancedSettings />, {
    seed: (set) => {
      set(lightingPrefsAtom, { rb3Prefs: { processingMode: 'direct' } })
    },
  }).store
}

describe('StageKitRb3EnhancedSettings', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  it('stores the chosen mode', async () => {
    const store = renderPanel()

    fireEvent.change(screen.getByLabelText('Processing Mode'), { target: { value: 'cue' } })

    await waitFor(() => expect(store.get(lightingPrefsAtom).rb3Prefs?.processingMode).toBe('cue'))
    expect(savePrefs).toHaveBeenCalledWith({ rb3Prefs: { processingMode: 'cue' } })
  })

  it('says so when the mode is refused, and stays on the stored one', async () => {
    savePrefs.mockImplementation((() => Promise.resolve(refused('read only'))) as never)
    const store = renderPanel()

    fireEvent.change(screen.getByLabelText('Processing Mode'), { target: { value: 'cue' } })

    await screen.findByRole('alert')
    expect(store.get(lightingPrefsAtom).rb3Prefs?.processingMode).toBe('direct')
  })
})
