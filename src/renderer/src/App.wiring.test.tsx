/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { ipcApiMock, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import { resetIpcListenerStub } from '@renderer/tests/helpers/ipcListenerStub'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import {
  activeDmxLightsConfigAtom,
  currentPageAtom,
  dmxLightsLibraryAtom,
  dmxRigsAtom,
  myDmxLightsAtom,
} from './atoms'
import { Pages } from './types'

jest.mock('./services/AudioCaptureManager', () => ({
  AudioCaptureManager: class {
    start(): Promise<void> {
      return Promise.resolve()
    }
    stop(): void {}
    updateConfig(): void {}
  },
}))
jest.mock(
  './ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)
jest.mock(
  './utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)
jest.mock('./components/LeftMenu', () => ({
  __esModule: true,
  default: ({ onToggleCollapse }: { onToggleCollapse: () => void }) => (
    <button onClick={onToggleCollapse}>Collapse menu</button>
  ),
}))
jest.mock('./components/Header', () => ({ __esModule: true, default: () => 'header' }))
jest.mock('./components/StatusBar', () => ({ __esModule: true, default: () => 'status bar' }))
jest.mock('./components/LifecycleFailedBanner', () => ({ __esModule: true, default: () => null }))
jest.mock('./components/MasterOutputSidebar', () => ({
  __esModule: true,
  default: () => 'master output',
  MASTER_OUTPUT_SIDEBAR_WIDTH_PX: 99,
}))
jest.mock('./components/AppPageRouter', () => ({
  AppPageRouter: ({ currentPage }: { currentPage: string }) => `route:${currentPage}`,
}))
jest.mock('./assets/images/photonics-icon.png', () => 'photonics-icon.png')

import App from './App'
import { DarkModeProvider } from './DarkModeProvider'

const library = [{ id: 'library-light' }]
const myLights = [{ id: 'my-light' }]
const layout = { numLights: 4 }
const rigs = [{ id: 'rig-1' }]

function renderApp(page: Pages = Pages.Status) {
  return renderWithProviders(
    <DarkModeProvider>
      <App />
    </DarkModeProvider>,
    { seed: (set) => set(currentPageAtom, page) },
  )
}

beforeEach(() => {
  resetIpcApiMock()
  resetIpcListenerStub()
  ipcApiMock.getAppVersion.mockResolvedValue('1.2.3' as never)
  ipcApiMock.getPrefs.mockResolvedValue({} as never)
  ipcApiMock.getValidationErrors.mockResolvedValue([] as never)
  ipcApiMock.getCorruptRecoveryEvents.mockResolvedValue({ files: [] } as never)
  ipcApiMock.getAudioEnabled.mockResolvedValue(false as never)
  ipcApiMock.getLightLibrary.mockResolvedValue(library as never)
  ipcApiMock.getMyLights.mockResolvedValue(myLights as never)
  ipcApiMock.getLightLayout.mockResolvedValue(layout as never)
  ipcApiMock.getDmxRigs.mockResolvedValue(rigs as never)
})

afterEach(() => cleanup())

describe('App', () => {
  it('loads the light library, my lights, the layout and the rigs into their atoms', async () => {
    const { store } = renderApp()

    await waitFor(() => expect(store.get(dmxRigsAtom)).toEqual(rigs))
    expect(store.get(dmxLightsLibraryAtom)).toEqual(library)
    expect(store.get(myDmxLightsAtom)).toEqual(myLights)
    expect(store.get(activeDmxLightsConfigAtom)).toEqual(layout)
  })

  it('routes the current page and follows a page change', async () => {
    const { store } = renderApp(Pages.About)

    expect(screen.getByText('route:About')).toBeInTheDocument()

    act(() => store.set(currentPageAtom, Pages.Preferences))

    expect(screen.getByText('route:Preferences')).toBeInTheDocument()
    await waitFor(() => expect(ipcApiMock.getDmxRigs).toHaveBeenCalled())
  })

  it('lays out the header, status bar and master output around the page', async () => {
    renderApp()

    expect(screen.getByText('header')).toBeInTheDocument()
    expect(screen.getByText('status bar')).toBeInTheDocument()
    expect(screen.getByText('master output')).toBeInTheDocument()
    expect(await screen.findByText('Photonics 1.2.3')).toBeInTheDocument()
  })

  it('collapses the left menu and saves that it is collapsed', async () => {
    renderApp()
    await screen.findByText('Photonics 1.2.3')

    fireEvent.click(screen.getByRole('button', { name: 'Collapse menu' }))

    await waitFor(() =>
      expect(ipcApiMock.savePrefs).toHaveBeenCalledWith({ leftMenuCollapsed: true }),
    )
    expect(screen.queryByText('Photonics 1.2.3')).not.toBeInTheDocument()
  })
})
