/** @jest-environment jsdom */
/**
 * The console holds DMX output in manual mode for as long as the page says so, so leaving the page
 * has to hand it back, including when the page leaves before main has answered.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { lightingPrefsAtom, previewRigIdAtom } from '../atoms'
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

  it('shows the channel again when an entry cannot move it', async () => {
    renderConsole()
    const toggle = await screen.findByRole('button', { name: 'Enable console' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)
    await screen.findByRole('button', { name: 'Disable console' })
    const box = (screen.getAllByRole('spinbutton') as HTMLInputElement[]).find(
      (input) => input.value === '1',
    )!

    fireEvent.change(box, { target: { value: '0' } })
    fireEvent.blur(box)

    expect(box.value).toBe('1')
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

describe('DmxConsole rig choice', () => {
  const inactiveRig = { ...rig, id: 'rig-2', name: 'Rig two', active: false } as DmxRig
  const rigById = (id: string) => [rig, inactiveRig].find((r) => r.id === id)

  beforeEach(() => {
    resetIpcApiMock()
    localStorage.clear()
    jest
      .mocked(ipcApi.getDmxRigs)
      .mockImplementation((() => Promise.resolve([rig, inactiveRig])) as never)
    jest
      .mocked(ipcApi.getDmxRig)
      .mockImplementation(((id: string) => Promise.resolve(rigById(id))) as never)
  })

  afterEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  async function rigSelect(): Promise<HTMLSelectElement> {
    const option = await screen.findByRole('option', { name: 'Rig two (inactive)' })
    return option.closest('select') as HTMLSelectElement
  }

  it('keeps its own rig when a preview page moves the preview rig', async () => {
    const { store } = renderWithProviders(<DmxConsole />, {
      seed: (set) => {
        set(lightingPrefsAtom, { advancedModeEnabled: true })
        set(previewRigIdAtom, rig.id)
      },
    })
    const select = await rigSelect()

    fireEvent.change(select, { target: { value: inactiveRig.id } })
    await waitFor(() => expect(select.value).toBe(inactiveRig.id))
    act(() => store.set(previewRigIdAtom, rig.id))

    expect(select.value).toBe(inactiveRig.id)
  })

  it('follows the preview rig while it has no rig of its own', async () => {
    const { store } = renderWithProviders(<DmxConsole />, {
      seed: (set) => {
        set(lightingPrefsAtom, { advancedModeEnabled: true })
        set(previewRigIdAtom, inactiveRig.id)
      },
    })
    const select = await rigSelect()
    await waitFor(() => expect(select.value).toBe(inactiveRig.id))

    act(() => store.set(previewRigIdAtom, rig.id))

    await waitFor(() => expect(select.value).toBe(rig.id))
  })
})
