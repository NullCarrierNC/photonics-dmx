/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)
jest.mock(
  '../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)
jest.mock('./LightsDmxPreview3D', () => ({ __esModule: true, default: () => null }))
jest.mock('./MovingHeadCalibrationWizard/WizardBeamPreview', () => ({
  __esModule: true,
  WizardBeamPreview: () => null,
}))
jest.mock('@renderer/hooks/useIpcPreviewSender', () => ({ useIpcPreviewSender: () => {} }))

import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import MovingHeadCalibrationWizard from './MovingHeadCalibrationWizard'
import { useBlackoutShortcut } from '../hooks/useBlackoutShortcut'
import { masterOutputAtom } from '../state/masterOutput'
import {
  createMockLightingConfig,
  rgbMovingHeadLight,
} from '../../../photonics-dmx/tests/helpers/testFixtures'

const light = rgbMovingHeadLight({
  id: 'mh-1',
  name: 'Moving head',
  label: 'Moving head',
  position: 0,
  channels: { masterDimmer: 1, pan: 2, tilt: 3, red: 4, green: 5, blue: 6 },
})

const BlackoutShortcut = () => {
  useBlackoutShortcut()
  return null
}

beforeEach(() => {
  resetIpcApiMock()
  jest
    .mocked(ipcApi.getPrefs)
    .mockResolvedValue({ blackoutShortcutKey: 'escape', blackoutShortcutScope: 'focused' } as never)
  jest.mocked(ipcApi.setMasterOutput).mockResolvedValue({
    success: true,
    state: { dimmerPercent: 100, blackout: true, strobeOutputEnabled: true },
  } as never)
})
afterEach(() => cleanup())

describe('MovingHeadCalibrationWizard with Escape bound to blackout', () => {
  it('blacks out on Escape and stays in console mode', async () => {
    const onClose = jest.fn()
    const { store } = renderWithProviders(
      <>
        <BlackoutShortcut />
        <MovingHeadCalibrationWizard
          light={light}
          rigId="rig-1"
          lightingConfig={createMockLightingConfig({ frontLights: [] })}
          onClose={onClose}
          onComplete={() => {}}
        />
      </>,
    )
    await waitFor(() => expect(ipcApi.enableConsole).toHaveBeenCalledWith('rig-1'))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' })

    await waitFor(() => expect(store.get(masterOutputAtom).blackout).toBe(true))
    expect(ipcApi.disableConsole).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
