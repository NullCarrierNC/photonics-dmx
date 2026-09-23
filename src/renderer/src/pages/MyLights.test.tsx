/** @jest-environment jsdom */
/**
 * My Lights opens its editor in a modal. These cover what opens it, that saving and deleting still
 * persist through the same optimistic path, and the discard guard: dismissing an edited light asks
 * first and keeps the editor open when the prompt is declined.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { FixtureTypes, type DmxFixture } from '../../../photonics-dmx/types'
import { myDmxLightsAtom } from './../atoms'
import { randomUUID as nodeRandomUUID } from 'node:crypto'

if (typeof (globalThis.crypto as Crypto | undefined)?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { ...(globalThis.crypto ?? {}), randomUUID: nodeRandomUUID },
  })
}

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const saveMyLights = jest.mocked(ipcApi.saveMyLights)

const confirmMock = jest.fn(async () => true)

jest.mock('../hooks/useConfirm', () => ({
  useConfirm: () => confirmMock,
}))

// Imported after the mocks are set up.
import MyLights from './MyLights'
import { ToastStack } from '../components/Toast'

function fixture(overrides: Partial<DmxFixture> = {}): DmxFixture {
  return {
    id: 'light-1',
    position: 0,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'Front PAR',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as unknown as DmxFixture['channels'],
    ...overrides,
  }
}

function renderPage(lights: DmxFixture[] = [fixture()]) {
  // The window's toast stack renders beside the page, as WindowShell renders it in the app.
  return renderWithProviders(
    <>
      <MyLights />
      <ToastStack />
    </>,
    { seed: (set) => set(myDmxLightsAtom, lights) },
  )
}

/** The light name input inside the modal, which is where edits are made in these tests. */
function nameInput(): HTMLInputElement {
  const dialog = screen.getByRole('dialog')
  return dialog.querySelector('input[type="text"]') as HTMLInputElement
}

beforeEach(() => {
  resetIpcApiMock()
  confirmMock.mockClear()
  confirmMock.mockResolvedValue(true)
})
afterEach(() => cleanup())

describe('MyLights editor modal', () => {
  it('stays closed until a light is chosen', () => {
    renderPage()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on the chosen light when its card is clicked', () => {
    renderPage()
    fireEvent.click(screen.getByText('Front PAR'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Edit Front PAR')).toBeInTheDocument()
  })

  it('opens an empty RGB light from + Light', () => {
    renderPage([])
    fireEvent.click(screen.getByText('+ Light'))
    expect(screen.getByText('Add Light')).toBeInTheDocument()
    // A new light has nothing to delete yet.
    expect(screen.queryByText('Delete')).toBeNull()
  })

  it('persists and closes on save', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Front PAR'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(saveMyLights).toHaveBeenCalledTimes(1)
  })

  it('holds Save while a new light saves, and writes it once under one id', async () => {
    let finishSave!: (result: { success: true }) => void
    saveMyLights.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve
        }),
    )
    const { store } = renderPage([])
    fireEvent.click(screen.getByText('+ Light'))
    const save = await screen.findByRole('button', { name: 'Save' })

    fireEvent.click(save)
    await waitFor(() => expect(save).toBeDisabled())
    fireEvent.click(save)
    await act(async () => finishSave({ success: true }))

    expect(saveMyLights).toHaveBeenCalledTimes(1)
    expect(store.get(myDmxLightsAtom)).toHaveLength(1)
  })

  it('puts the library back when the save rejects', async () => {
    saveMyLights.mockRejectedValueOnce(new Error('channel gone'))
    renderPage()
    fireEvent.click(screen.getByText('Front PAR'))
    fireEvent.change(nameInput(), { target: { value: 'Renamed PAR' } })
    fireEvent.click(screen.getByText('Save'))

    // The optimistic rename is rolled back and the editor stays open, the same as a refusal.
    await screen.findByText('Failed to save the light library.')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(nameInput().value).toBe('Renamed PAR')
  })

  it('closes without prompting when nothing was edited', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Front PAR'))
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('asks before discarding an edited light', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Front PAR'))
    fireEvent.change(nameInput(), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(confirmMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the edit when the discard prompt is declined', async () => {
    confirmMock.mockResolvedValue(false)
    renderPage()
    fireEvent.click(screen.getByText('Front PAR'))
    fireEvent.change(nameInput(), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(nameInput().value).toBe('Renamed')
  })

  it('confirms a delete and drops the light from the library', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Front PAR'))
    fireEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(saveMyLights).toHaveBeenCalledWith([])
  })

  it('leaves the light in place when the delete prompt is declined', async () => {
    confirmMock.mockResolvedValue(false)
    renderPage()
    fireEvent.click(screen.getByText('Front PAR'))
    fireEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(saveMyLights).not.toHaveBeenCalled()
  })
})
