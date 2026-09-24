/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { refused, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { lightingPrefsAtom } from '../atoms'
import StageKitYargPrioritySettings from './StageKitYargPrioritySettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const setStageKitPriority = jest.mocked(ipcApi.setStageKitPriority)

function renderPanel() {
  return renderWithProviders(<StageKitYargPrioritySettings />, {
    seed: (set) => set(lightingPrefsAtom, { stageKitPrefs: { yargPriority: 'random' } }),
  }).store
}

const picker = (): HTMLSelectElement => screen.getByLabelText('Stage Kit Priority')

describe('StageKitYargPrioritySettings', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  afterEach(() => cleanup())

  it('stores the chosen priority', async () => {
    const store = renderPanel()

    fireEvent.change(picker(), { target: { value: 'prefer-for-tracked' } })

    await waitFor(() =>
      expect(store.get(lightingPrefsAtom).stageKitPrefs?.yargPriority).toBe('prefer-for-tracked'),
    )
    expect(setStageKitPriority).toHaveBeenCalledWith('prefer-for-tracked')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says so when the priority is refused, and stays on the stored one', async () => {
    setStageKitPriority.mockResolvedValue(refused('read only'))
    const store = renderPanel()

    fireEvent.change(picker(), { target: { value: 'prefer-for-tracked' } })

    await screen.findByRole('alert')
    expect(store.get(lightingPrefsAtom).stageKitPrefs?.yargPriority).toBe('random')
    expect(picker().value).toBe('random')
  })

  it('says so when the call fails, and stays on the stored one', async () => {
    setStageKitPriority.mockRejectedValue(new Error('channel gone'))
    const store = renderPanel()

    fireEvent.change(picker(), { target: { value: 'prefer-for-tracked' } })

    await screen.findByRole('alert')
    expect(store.get(lightingPrefsAtom).stageKitPrefs?.yargPriority).toBe('random')
    expect(picker().value).toBe('random')
  })
})
