/** @jest-environment jsdom */
/**
 * The console holds DMX output in manual mode for as long as the page says so, so leaving the page
 * has to hand it back, including when the page leaves before main has answered.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { previewRigIdAtom } from '../atoms'
import DmxConsole from './DmxConsole'
import type { DmxRig } from '../../../photonics-dmx/types'

// The page subscribes to live DMX values, which needs the preload bridge that jsdom has no copy of.
jest.mock('../utils/ipcHelpers', () => ({
  addIpcListener: jest.fn(),
  removeIpcListener: jest.fn(),
  registerIpcListener: jest.fn(() => () => undefined),
}))

// The 3D preview pulls in three.js and a font asset, neither of which this page's behaviour needs.
jest.mock('../components/LightsDmxPreview', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const rig = {
  id: 'rig-1',
  name: 'Rig one',
  active: true,
  config: {
    frontLights: [
      {
        id: 'light-1',
        name: 'Front 1',
        fixture: 'RGB',
        fixtureId: 'fixture-1',
        universe: 1,
        channels: { red: 1, green: 2, blue: 3 },
      },
    ],
    backLights: [],
    strobeLights: [],
  },
} as unknown as DmxRig

function renderConsole(): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(<DmxConsole />, {
    seed: (set) => set(previewRigIdAtom, rig.id),
  })
}

describe('DmxConsole', () => {
  beforeEach(() => {
    resetIpcApiMock()
    jest.mocked(ipcApi.getDmxRigs).mockImplementation((() => Promise.resolve([rig])) as never)
    jest.mocked(ipcApi.getDmxRig).mockImplementation((() => Promise.resolve(rig)) as never)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('hands DMX output back when the page closes with the console open', async () => {
    const view = renderConsole()
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)
    await screen.findByRole('button', { name: 'Disable console' })

    view.unmount()

    await waitFor(() => expect(jest.mocked(ipcApi.disableConsole)).toHaveBeenCalled())
  })

  it('hands DMX output back when the page closes before the console opens', async () => {
    let openConsole!: (result: { success: true }) => void
    jest.mocked(ipcApi.enableConsole).mockImplementation(
      (() =>
        new Promise((resolve) => {
          openConsole = resolve
        })) as never,
    )

    const view = renderConsole()
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)

    view.unmount()
    openConsole({ success: true })

    await waitFor(() => expect(jest.mocked(ipcApi.disableConsole)).toHaveBeenCalled())
  })

  it('hands DMX output back when the enable rejects after the page closes', async () => {
    let failConsole!: (error: Error) => void
    jest.mocked(ipcApi.enableConsole).mockImplementation(
      (() =>
        new Promise((_resolve, reject) => {
          failConsole = reject
        })) as never,
    )

    const view = renderConsole()
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)

    view.unmount()
    // Main can have stored the restore state before whatever went wrong, so console mode is open
    // even though the enable reports a failure.
    failConsole(new Error('channel gone'))

    await waitFor(() => expect(jest.mocked(ipcApi.disableConsole)).toHaveBeenCalled())
  })
})
