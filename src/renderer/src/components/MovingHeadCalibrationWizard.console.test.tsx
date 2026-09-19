/** @jest-environment jsdom */
/**
 * What the wizard shows when main will not put it into console mode, whether main refuses or the
 * call rejects.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { screen, waitFor } from '@testing-library/react'

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
  FixtureTypes,
  type DmxLight,
  type LightingConfiguration,
} from '../../../photonics-dmx/types'

const light = {
  id: 'mh-1',
  name: 'Moving head',
  label: 'Moving head',
  position: 0,
  fixture: FixtureTypes.RGBMH,
  universe: 1,
  channels: { masterDimmer: 1, pan: 2, tilt: 3 },
  config: {},
} as unknown as DmxLight

const renderWizard = (): void => {
  renderWithProviders(
    <MovingHeadCalibrationWizard
      light={light}
      rigId="rig-1"
      lightingConfig={{ frontLights: [], backLights: [] } as unknown as LightingConfiguration}
      onClose={() => {}}
      onComplete={() => {}}
    />,
  )
}

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
})
