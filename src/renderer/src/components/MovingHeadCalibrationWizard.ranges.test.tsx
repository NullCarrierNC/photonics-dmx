/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { cleanup, fireEvent, screen } from '@testing-library/react'

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

const renderWizard = (): void => {
  renderWithProviders(
    <MovingHeadCalibrationWizard
      light={light}
      rigId="rig-1"
      lightingConfig={createMockLightingConfig({ frontLights: [] })}
      onClose={() => {}}
      onComplete={() => {}}
    />,
  )
}

/** Clears the box, then types one character at a time onto whatever the box shows. */
const clearAndType = (input: HTMLInputElement, text: string): void => {
  input.focus()
  fireEvent.change(input, { target: { value: '' } })
  for (const char of text) {
    fireEvent.change(input, { target: { value: input.value + char } })
  }
  fireEvent.keyDown(input, { key: 'Enter' })
}

const next = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
}

beforeEach(() => {
  resetIpcApiMock()
})
afterEach(() => cleanup())

describe('MovingHeadCalibrationWizard range boxes', () => {
  it('takes a pan and tilt range typed digit by digit into a cleared box', async () => {
    renderWizard()

    const pan = (await screen.findByLabelText('Pan range (deg)')) as HTMLInputElement
    clearAndType(pan, '540')
    expect(pan.value).toBe('540')
    next()

    const tilt = screen.getByLabelText('Tilt range (deg)') as HTMLInputElement
    clearAndType(tilt, '270')
    expect(tilt.value).toBe('270')
    next()
    next()
    next()

    fireEvent.click(screen.getByRole('button', { name: 'Set upstage' }))
    expect(screen.getByText(/of 540°/)).toBeTruthy()
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Set vertical' }))
    expect(screen.getByText(/of 270°/)).toBeTruthy()
  })

  it('holds a typed range inside its bounds when the box is left', async () => {
    renderWizard()

    const pan = (await screen.findByLabelText('Pan range (deg)')) as HTMLInputElement
    clearAndType(pan, '900')
    expect(pan.value).toBe('720')
    clearAndType(pan, '0')
    expect(pan.value).toBe('1')
  })

  it('shows the committed range again when the box is emptied and left', async () => {
    renderWizard()

    const pan = (await screen.findByLabelText('Pan range (deg)')) as HTMLInputElement
    const shown = pan.value
    clearAndType(pan, '')
    expect(pan.value).toBe(shown)
  })
})
