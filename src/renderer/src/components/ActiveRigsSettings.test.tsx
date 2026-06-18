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
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { dmxRigsAtom, lightingPrefsAtom } from '../atoms'
import {
  ConfigStrobeType,
  type DmxRig,
  type LightingConfiguration,
  type WireSenderId,
} from '../../../photonics-dmx/types'

// Mock ipcApi before importing the component under test.
const getDmxRigsMock = jest.fn(async () => [] as DmxRig[])
const saveDmxRigMock = jest.fn(async (_rig: DmxRig) => undefined)
const deleteDmxRigMock = jest.fn(async (_id: string) => undefined)
const savePrefsMock = jest.fn(async (_p: Record<string, unknown>) => undefined)

jest.mock('../ipcApi', () => ({
  getDmxRigs: (...args: unknown[]) => getDmxRigsMock(...(args as [] as [])),
  saveDmxRig: (rig: DmxRig) => saveDmxRigMock(rig),
  deleteDmxRig: (id: string) => deleteDmxRigMock(id),
  savePrefs: (p: Record<string, unknown>) => savePrefsMock(p),
}))

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
}): ReturnType<typeof createStore> {
  const store = createStore()
  store.set(dmxRigsAtom, opts.rigs)
  store.set(lightingPrefsAtom, { allowMultipleActiveRigs: opts.allowMultipleActiveRigs })
  // Initial getDmxRigs call should return the same set (the component refetches on mount).
  getDmxRigsMock.mockResolvedValueOnce(opts.rigs)
  render(
    <Provider store={store}>
      <ActiveRigsSettings />
    </Provider>,
  )
  return store
}

beforeEach(() => {
  getDmxRigsMock.mockReset()
  saveDmxRigMock.mockReset()
  deleteDmxRigMock.mockReset()
  savePrefsMock.mockReset()
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
    await waitFor(() => expect(screen.queryByText('Solo')).toBeTruthy())
    expect(outputsColumnHeader()).toBeNull()
  })

  it('hides the Outputs column with two rigs when allowMultipleActiveRigs is off', async () => {
    renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B')],
      allowMultipleActiveRigs: false,
    })
    await waitFor(() => expect(screen.queryByText('Rig A')).toBeTruthy())
    expect(outputsColumnHeader()).toBeNull()
    // Discoverability hint should appear in this state.
    expect(
      screen.queryByText(/Enable this to route specific rigs to specific DMX outputs/i),
    ).toBeTruthy()
  })

  it('shows the Outputs column with two rigs and allowMultipleActiveRigs on', async () => {
    renderWith({
      rigs: [makeRig('r1', 'Rig A'), makeRig('r2', 'Rig B')],
      allowMultipleActiveRigs: true,
    })
    await waitFor(() => expect(screen.queryByText('Rig A')).toBeTruthy())
    expect(outputsColumnHeader()).toBeTruthy()
  })
})

describe('ActiveRigsSettings — clears outputs on UI-hide transitions', () => {
  it("clears the survivor's outputs when deletion collapses to a single rig", async () => {
    const rigA = makeRig('r1', 'Rig A', ['sacn'])
    const rigB = makeRig('r2', 'Rig B', ['opendmx'])
    renderWith({ rigs: [rigA, rigB], allowMultipleActiveRigs: true })
    await waitFor(() => expect(screen.queryByText('Rig A')).toBeTruthy())

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
    await waitFor(() => expect(screen.queryByText('Rig A')).toBeTruthy())

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
    await waitFor(() => expect(screen.queryByText('Rig A')).toBeTruthy())

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
    await waitFor(() => expect(screen.queryByText('Solo')).toBeTruthy())
    expect(screen.queryByRole('columnheader', { name: /Mirror/i })).toBeTruthy()
    expect(mirrorCheckbox('r1', 'horiz')).toBeTruthy()
    expect(mirrorCheckbox('r1', 'vert')).toBeTruthy()
    expect(mirrorCheckbox('r1', 'horiz').checked).toBe(false)
  })

  it('toggling Horiz dispatches a save with mirrorHoriz: true', async () => {
    renderWith({ rigs: [makeRig('r1', 'Solo')], allowMultipleActiveRigs: false })
    await waitFor(() => expect(screen.queryByText('Solo')).toBeTruthy())

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
    await waitFor(() => expect(screen.queryByText('Solo')).toBeTruthy())
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
    await waitFor(() => expect(screen.queryByText('Solo')).toBeTruthy())

    await act(async () => {
      fireEvent.click(mirrorCheckbox('r1', 'vert'))
    })

    await waitFor(() => expect(saveDmxRigMock).toHaveBeenCalled())
    const saved = saveDmxRigMock.mock.calls.at(-1)![0] as DmxRig
    expect(saved.mirrorVert).toBe(true)
    expect('mirrorHoriz' in saved).toBe(false)
  })
})
