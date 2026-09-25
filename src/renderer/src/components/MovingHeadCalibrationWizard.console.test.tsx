/** @jest-environment jsdom */
/**
 * What the wizard shows when main will not put it into console mode, whether main refuses or the
 * call rejects, that closing it hands console mode back either way, and that a StrictMode remount
 * keeps it.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { StrictMode } from 'react'
import { screen, waitFor } from '@testing-library/react'
import type { RenderWithProvidersResult } from '@renderer/tests/helpers/renderWithProviders'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
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

const wizard = (
  <MovingHeadCalibrationWizard
    light={light}
    rigId="rig-1"
    lightingConfig={createMockLightingConfig({ frontLights: [] })}
    onClose={() => {}}
    onComplete={() => {}}
  />
)

const renderWizard = (): RenderWithProvidersResult => renderWithProviders(wizard)

describe('MovingHeadCalibrationWizard console mode', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  it('shows the refusal main answers with', async () => {
    jest.mocked(ipcApi.enableConsole).mockResolvedValue({ success: false, error: 'rig busy' })

    renderWizard()

    expect(await screen.findByText(/Could not enable DMX console mode: rig busy/)).toBeTruthy()
  })

  it('shows an enable that rejects', async () => {
    jest.mocked(ipcApi.enableConsole).mockRejectedValue(new Error('channel gone'))

    renderWizard()

    await waitFor(() =>
      expect(screen.getByText(/Could not enable DMX console mode: channel gone/)).toBeTruthy(),
    )
  })

  it('hands DMX output back when the wizard closes before the console opens', async () => {
    let openConsole!: (result: { success: true }) => void
    jest.mocked(ipcApi.enableConsole).mockImplementation(
      (() =>
        new Promise((resolve) => {
          openConsole = resolve
        })) as never,
    )

    const view = renderWizard()
    view.unmount()

    // Main answers a disable that arrives first with success and does nothing, so one sent now
    // would be lost and the enable behind it would latch console mode for the session.
    expect(jest.mocked(ipcApi.disableConsole)).not.toHaveBeenCalled()

    openConsole({ success: true })

    await waitFor(() => expect(jest.mocked(ipcApi.disableConsole)).toHaveBeenCalled())
  })

  it('hands DMX output back when the enable rejects after the wizard closes', async () => {
    let failConsole!: (error: Error) => void
    jest.mocked(ipcApi.enableConsole).mockImplementation(
      (() =>
        new Promise((_resolve, reject) => {
          failConsole = reject
        })) as never,
    )

    const view = renderWizard()
    view.unmount()
    expect(jest.mocked(ipcApi.disableConsole)).not.toHaveBeenCalled()

    failConsole(new Error('channel gone'))

    await waitFor(() => expect(jest.mocked(ipcApi.disableConsole)).toHaveBeenCalled())
  })

  it('stays in console mode through the StrictMode remount and leaves it once on unmount', async () => {
    const view = renderWithProviders(<StrictMode>{wizard}</StrictMode>)

    // StrictMode mounts, cleans up and mounts again, so the second enable owns console mode and
    // the first run's hand-back has to stand down.
    await waitFor(() => expect(jest.mocked(ipcApi.enableConsole)).toHaveBeenCalledTimes(2))
    expect(jest.mocked(ipcApi.disableConsole)).not.toHaveBeenCalled()

    view.unmount()

    await waitFor(() => expect(jest.mocked(ipcApi.disableConsole)).toHaveBeenCalledTimes(1))
  })
})
