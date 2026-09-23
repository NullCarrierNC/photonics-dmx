/** @jest-environment jsdom */
/**
 * Tests for the routing-UI gate on ActiveRigsSettings.
 *
 * Routing is an advanced multi-rig feature. The Outputs column is gated on
 * `allowMultipleActiveRigs === true && rigs.length > 1` so a single-rig (or
 * single-rig-active-at-a-time) user is never exposed to it. When the UI is about to be hidden
 * via a transition (rig deletion collapses to 1 rig, or the user opts out of multi-rig
 * support), any rig with an explicit `outputs` setting must be cleared so it can't end up
 * silently stuck on a routing decision the user can no longer see.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { refused, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { activeRigIdAtom, dmxRigsAtom, lightingPrefsAtom } from '../atoms'
import {
  ConfigStrobeType,
  type DmxRig,
  type LightingConfiguration,
  type WireSenderId,
} from '../../../photonics-dmx/types'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const getDmxRigsMock = jest.mocked(ipcApi.getDmxRigs)
const saveDmxRigMock = jest.mocked(ipcApi.saveDmxRig)
const deleteDmxRigMock = jest.mocked(ipcApi.deleteDmxRig)
const savePrefsMock = jest.mocked(ipcApi.savePrefs)

// Imported after the mock is set up.
import ActiveRigsSettings from './ActiveRigsSettings'

function emptyConfig(): LightingConfiguration {
  return {
    numLights: 0,
    lightLayout: { id: 'two-rows', label: 'Two Rows' },
    strobeType: ConfigStrobeType.None,
    frontLights: [],
    backLights: [],
    strobeLights: [],
  }
}

function makeRig(id: string, name: string, outputs?: WireSenderId[], active = true): DmxRig {
  const rig: DmxRig = { id, name, active, config: emptyConfig() }
  if (outputs !== undefined) {
    rig.outputs = outputs
  }
  return rig
}

function renderWith(opts: {
  rigs: DmxRig[]
  allowMultipleActiveRigs: boolean
  layoutRigId?: string
}) {
  // Initial getDmxRigs call should return the same set (the component refetches on mount).
  getDmxRigsMock.mockResolvedValueOnce(opts.rigs)
  return renderWithProviders(<ActiveRigsSettings />, {
    seed: (set) => {
      set(dmxRigsAtom, opts.rigs)
      set(lightingPrefsAtom, { allowMultipleActiveRigs: opts.allowMultipleActiveRigs })
      if (opts.layoutRigId) set(activeRigIdAtom, opts.layoutRigId)
    },
  }).store
}

beforeEach(() => {
  resetIpcApiMock()
})

afterEach(() => {
  // Explicit unmount — testing-library's auto-cleanup is opt-in via setup files and isn't
  // wired up in this project; without this each `render` accumulates into the same JSDOM body
  // and causes false multi-match failures in queryByText.
  cleanup()
})

// The "Outputs" column header is a `<th>` (role=columnheader). Matching by role keeps the
// query precise — text-based matching also hits paragraph copy that mentions "Outputs".
function outputsColumnHeader(): HTMLElement | null {
  return screen.queryByRole('columnheader', { name: /Outputs/i })
}

describe('ActiveRigsSettings — routing UI gate', () => {
  it('hides the Outputs column with a single rig (multi-rig pref irrelevant)', async () => {
    renderWith({ rigs: [makeRig('r1', 'Solo')], allowMultipleActiveRigs: true })
    await waitFor(() => expect(screen.queryByText('Solo')).toBeInTheDocument())
    expect(outputsColumnHeader()).toBeNull()
  })

  it('hides the Outputs column with two rigs when allowMultipleActiveRigs is off', async () => {
    renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B')],
      allowMultipleActiveRigs: false,
    })
    await waitFor(() => expect(screen.queryByText('Rig A')).toBeInTheDocument())
    expect(outputsColumnHeader()).toBeNull()
    // Discoverability hint should appear in this state.
    expect(
      screen.queryByText(/Enable this to route specific rigs to specific DMX outputs/i),
    ).toBeInTheDocument()
  })

  it('shows the Outputs column with two rigs and allowMultipleActiveRigs on', async () => {
    renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B')],
      allowMultipleActiveRigs: true,
    })
    await waitFor(() => expect(screen.queryByText('Rig A')).toBeInTheDocument())
    expect(outputsColumnHeader()).toBeInTheDocument()
  })
})

describe('ActiveRigsSettings — clears outputs on UI-hide transitions', () => {
  it("clears the survivor's outputs when deletion collapses to a single rig", async () => {
    const rigA = makeRig('r1', 'Rig A', ['sacn'])
    const rigB = makeRig('r2', 'Rig B', ['opendmx'])
    renderWith({ rigs: [rigA, rigB], allowMultipleActiveRigs: true })
    await waitFor(() => expect(screen.queryByText('Rig A')).toBeInTheDocument())

    // Click delete on Rig B, then confirm.
    const deleteButtons = screen.getAllByText('Delete')
    await act(async () => {
      fireEvent.click(deleteButtons[1]!)
    })
    const yesButton = screen.getByText('Yes')
    await act(async () => {
      fireEvent.click(yesButton)
    })

    await waitFor(() => expect(deleteDmxRigMock).toHaveBeenCalledWith('r2'))

    // The survivor Rig A had outputs: ['sacn']. Once Rig B is gone we're down to a single rig
    // and the routing UI is hidden, so the survivor's outputs must be stripped.
    const survivorSaves = saveDmxRigMock.mock.calls.filter((c) => (c[0] as DmxRig).id === 'r1')
    expect(survivorSaves.length).toBeGreaterThan(0)
    const persisted = survivorSaves[survivorSaves.length - 1]![0] as DmxRig
    expect(persisted.outputs).toBeUndefined()
  })

  it('does not save the survivor when its outputs were already undefined', async () => {
    // Default rig (no explicit outputs) — nothing to clear, so no extra save.
    const rigA = makeRig('r1', 'Rig A') // outputs undefined
    const rigB = makeRig('r2', 'Rig B', ['opendmx'])
    renderWith({ rigs: [rigA, rigB], allowMultipleActiveRigs: true })
    await waitFor(() => expect(screen.queryByText('Rig A')).toBeInTheDocument())

    const deleteButtons = screen.getAllByText('Delete')
    await act(async () => {
      fireEvent.click(deleteButtons[1]!)
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Yes'))
    })

    await waitFor(() => expect(deleteDmxRigMock).toHaveBeenCalledWith('r2'))

    // No save for the survivor since there was no `outputs` to clear.
    expect(saveDmxRigMock.mock.calls.filter((c) => (c[0] as DmxRig).id === 'r1')).toHaveLength(0)
  })

  it('clears outputs on every rig when allowMultipleActiveRigs is toggled off', async () => {
    const rigA = makeRig('r1', 'Rig A', ['sacn'])
    const rigB = makeRig('r2', 'Rig B', ['opendmx'])
    renderWith({ rigs: [rigA, rigB], allowMultipleActiveRigs: true })
    await waitFor(() => expect(screen.queryByText('Rig A')).toBeInTheDocument())

    // Toggle the pref off.
    const checkbox = screen.getByLabelText(/Allow Multiple Active Rigs/i) as HTMLInputElement
    await act(async () => {
      fireEvent.click(checkbox)
    })

    await waitFor(() => expect(savePrefsMock).toHaveBeenCalled())

    // Both rigs should have been re-saved with outputs cleared.
    const saveByRig = new Map<string, DmxRig>()
    for (const call of saveDmxRigMock.mock.calls) {
      const r = call[0] as DmxRig
      saveByRig.set(r.id, r) // last save per rig
    }
    expect(saveByRig.get('r1')?.outputs).toBeUndefined()
    expect(saveByRig.get('r2')?.outputs).toBeUndefined()
  })
})

describe('ActiveRigsSettings — mirror controls', () => {
  function mirrorCheckbox(rigId: string, axis: 'horiz' | 'vert'): HTMLInputElement {
    return document.getElementById(`rig-${rigId}-mirror-${axis}`) as HTMLInputElement
  }

  it('renders Mirror column with Horiz and Vert checkboxes for a single rig (no multi-rig gate)', async () => {
    renderWith({ rigs: [makeRig('r1', 'Solo')], allowMultipleActiveRigs: false })
    await waitFor(() => expect(screen.queryByText('Solo')).toBeInTheDocument())
    expect(screen.queryByRole('columnheader', { name: /Mirror/i })).toBeInTheDocument()
    expect(mirrorCheckbox('r1', 'horiz')).toBeInTheDocument()
    expect(mirrorCheckbox('r1', 'vert')).toBeInTheDocument()
    expect(mirrorCheckbox('r1', 'horiz').checked).toBe(false)
  })

  it('toggling Horiz dispatches a save with mirrorHoriz: true', async () => {
    renderWith({ rigs: [makeRig('r1', 'Solo')], allowMultipleActiveRigs: false })
    await waitFor(() => expect(screen.queryByText('Solo')).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(mirrorCheckbox('r1', 'horiz'))
    })

    await waitFor(() => expect(saveDmxRigMock).toHaveBeenCalled())
    const saved = saveDmxRigMock.mock.calls.at(-1)![0] as DmxRig
    expect(saved.id).toBe('r1')
    expect(saved.mirrorHoriz).toBe(true)
    expect('mirrorVert' in saved).toBe(false)
  })

  it('un-toggling Horiz strips the field from the saved rig', async () => {
    const rig: DmxRig = {
      ...makeRig('r1', 'Solo'),
      mirrorHoriz: true,
    }
    renderWith({ rigs: [rig], allowMultipleActiveRigs: false })
    await waitFor(() => expect(screen.queryByText('Solo')).toBeInTheDocument())
    expect(mirrorCheckbox('r1', 'horiz').checked).toBe(true)

    await act(async () => {
      fireEvent.click(mirrorCheckbox('r1', 'horiz'))
    })

    await waitFor(() => expect(saveDmxRigMock).toHaveBeenCalled())
    const saved = saveDmxRigMock.mock.calls.at(-1)![0] as DmxRig
    expect(saved.id).toBe('r1')
    expect('mirrorHoriz' in saved).toBe(false)
  })

  it('mirrorHoriz and mirrorVert toggles are independent', async () => {
    renderWith({ rigs: [makeRig('r1', 'Solo')], allowMultipleActiveRigs: false })
    await waitFor(() => expect(screen.queryByText('Solo')).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(mirrorCheckbox('r1', 'vert'))
    })

    await waitFor(() => expect(saveDmxRigMock).toHaveBeenCalled())
    const saved = saveDmxRigMock.mock.calls.at(-1)![0] as DmxRig
    expect(saved.mirrorVert).toBe(true)
    expect('mirrorHoriz' in saved).toBe(false)
  })

  it('leaves the rigs alone when the multi-rig preference is refused', async () => {
    jest
      .mocked(ipcApi.savePrefs)
      .mockImplementation((() => Promise.resolve(refused('read only'))) as never)
    const rigs = [makeRig('r1', 'One', ['sacn']), makeRig('r2', 'Two')]
    renderWith({ rigs, allowMultipleActiveRigs: true })

    fireEvent.click(await screen.findByLabelText('Allow Multiple Active Rigs'))

    await screen.findByRole('alert')
    expect(jest.mocked(ipcApi.saveDmxRig)).not.toHaveBeenCalled()
  })
})

describe('ActiveRigsSettings rig writes', () => {
  it('sends only the chosen rig when the active rig changes', async () => {
    renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B', undefined, false)],
      allowMultipleActiveRigs: false,
    })
    await screen.findByText('Rig B')

    await act(async () => {
      fireEvent.click(screen.getAllByRole('radio')[1]!)
    })

    expect(saveDmxRigMock).toHaveBeenCalledTimes(1)
    expect(saveDmxRigMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2', active: true }))
    const [radioA, radioB] = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radioA!.checked).toBe(false)
    expect(radioB!.checked).toBe(true)
  })

  it('keeps the active rig and says why when main refuses the switch', async () => {
    saveDmxRigMock.mockResolvedValue(refused('EPERM: rigs.json') as never)
    renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B', undefined, false)],
      allowMultipleActiveRigs: false,
    })
    await screen.findByText('Rig B')

    await act(async () => {
      fireEvent.click(screen.getAllByRole('radio')[1]!)
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('EPERM: rigs.json')
    const [radioA, radioB] = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radioA!.checked).toBe(true)
    expect(radioB!.checked).toBe(false)
  })

  it('shows the switch and says so when the lights did not restart after it', async () => {
    saveDmxRigMock.mockResolvedValue({ success: true, restartError: 'sACN port busy' } as never)
    renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B', undefined, false)],
      allowMultipleActiveRigs: false,
    })
    await screen.findByText('Rig B')

    await act(async () => {
      fireEvent.click(screen.getAllByRole('radio')[1]!)
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('sACN port busy')
    expect((screen.getAllByRole('radio')[1] as HTMLInputElement).checked).toBe(true)
  })

  it('keeps the row and says why when main refuses the delete', async () => {
    deleteDmxRigMock.mockResolvedValue(refused('EPERM: rigs.json') as never)
    renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B', undefined, false)],
      allowMultipleActiveRigs: false,
    })
    await screen.findByText('Rig B')

    fireEvent.click(screen.getAllByText('Delete')[1]!)
    await act(async () => {
      fireEvent.click(screen.getByText('Yes'))
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('EPERM: rigs.json')
    expect(screen.getByText('Rig B')).toBeInTheDocument()
  })

  it('leaves the mirror box as it was when main refuses the save', async () => {
    saveDmxRigMock.mockResolvedValue(refused('EPERM: rigs.json') as never)
    renderWith({ rigs: [makeRig('r1', 'Solo')], allowMultipleActiveRigs: false })
    await screen.findByText('Solo')
    const horiz = document.getElementById('rig-r1-mirror-horiz') as HTMLInputElement

    await act(async () => {
      fireEvent.click(horiz)
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('EPERM: rigs.json')
    expect(horiz.checked).toBe(false)
  })

  it('leaves the outputs as they were when main refuses the save', async () => {
    saveDmxRigMock.mockResolvedValue(refused('EPERM: rigs.json') as never)
    renderWith({
      rigs: [makeRig('r1', 'Rig A', ['sacn']), makeRig('r2', 'Rig B')],
      allowMultipleActiveRigs: true,
    })
    await screen.findByText('Rig A')
    const artnet = document.getElementById('rig-r1-output-artnet') as HTMLInputElement

    await act(async () => {
      fireEvent.click(artnet)
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('EPERM: rigs.json')
    expect(artnet.checked).toBe(false)
  })

  it('keeps the first active rig through one write when multiple rigs are turned off', async () => {
    renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B'), makeRig('r3', 'Rig C')],
      allowMultipleActiveRigs: true,
    })
    await screen.findByText('Rig A')

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Allow Multiple Active Rigs'))
    })

    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(3))
    expect(saveDmxRigMock).toHaveBeenCalledTimes(1)
    expect(saveDmxRigMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', active: true }))
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((r) => r.checked)).toEqual([true, false, false])
  })
})

describe('ActiveRigsSettings delete and the Lights Layout selection', () => {
  async function deleteRig(index: number): Promise<void> {
    fireEvent.click(screen.getAllByText('Delete')[index]!)
    await act(async () => {
      fireEvent.click(screen.getByText('Yes'))
    })
  }

  it('lets Lights Layout pick again when the rig it has open is deleted', async () => {
    const store = renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B', undefined, false)],
      allowMultipleActiveRigs: false,
      layoutRigId: 'r2',
    })
    await screen.findByText('Rig B')

    await deleteRig(1)

    await waitFor(() => expect(screen.queryByText('Rig B')).toBeNull())
    expect(store.get(activeRigIdAtom)).toBeNull()
  })

  it('leaves the Lights Layout selection alone when another rig is deleted', async () => {
    const store = renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B', undefined, false)],
      allowMultipleActiveRigs: false,
      layoutRigId: 'r1',
    })
    await screen.findByText('Rig B')

    await deleteRig(1)

    await waitFor(() => expect(screen.queryByText('Rig B')).toBeNull())
    expect(store.get(activeRigIdAtom)).toBe('r1')
  })

  it('keeps the Lights Layout selection when the delete is refused', async () => {
    deleteDmxRigMock.mockResolvedValue(refused('EPERM: rigs.json') as never)
    const store = renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B', undefined, false)],
      allowMultipleActiveRigs: false,
      layoutRigId: 'r2',
    })
    await screen.findByText('Rig B')

    await deleteRig(1)

    await screen.findByRole('alert')
    expect(store.get(activeRigIdAtom)).toBe('r2')
  })
})
