/** @jest-environment jsdom */
/**
 * Light Layout clears its unsaved-changes flag after a successful save.
 *
 * `isDirty` deep-compares the editor's working config (from `activeDmxLightsConfigAtom`) against the
 * saved rig (from `dmxRigsAtom`). `getDmxRigs()` returns backend-canonical rigs: migration +
 * template-sync materialize defaults (e.g. `strobeValues`) the editor never sets. After a save the
 * `dmxRigsAtom` is reloaded from that canonical read (App.tsx's CONTROLLERS_RESTARTED handler), so
 * `handleSaveChanges` must adopt the same canonical shape for `activeDmxLightsConfigAtom` — otherwise
 * the raw working config never equals the normalized saved rig and the flag stays stuck true.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { randomUUID as nodeRandomUUID } from 'node:crypto'
import {
  activeDmxLightsConfigAtom,
  activeRigIdAtom,
  dmxRigsAtom,
  lightingPrefsAtom,
  lightsLayoutHasUnsavedChangesAtom,
  myDmxLightsAtom,
} from './../atoms'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxFixture,
  type DmxLight,
  type DmxRig,
} from '../../../photonics-dmx/types'

// jsdom may not expose crypto.randomUUID; mapLightsToNewIdsForSave needs it on the save path.
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

const getDmxRigsMock = jest.mocked(ipcApi.getDmxRigs)
const getDmxRigMock = jest.mocked(ipcApi.getDmxRig)
const saveDmxRigMock = jest.mocked(ipcApi.saveDmxRig)
// Presentational children are irrelevant to the save/dirty flow; stub them to keep the test focused.
jest.mock('../components/LightLayoutPreview', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/Toast', () => ({ __esModule: true, default: () => null }))
jest.mock('./LightsLayout/LightsLayoutForm', () => ({ __esModule: true, default: () => null }))
jest.mock('./LightsLayout/LightChannelAssignmentSection', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('./LightsLayout/LightsLayoutIntro', () => ({ __esModule: true, default: () => null }))
jest.mock('./LightsLayout/LightsLayoutRigSection', () => ({
  __esModule: true,
  default: () => null,
}))

// Imported after the mocks are set up.
const importRigModalRenders: Array<{ defaultName: string }> = []
jest.mock('./LightsLayout/components/ImportRigModal', () => ({
  __esModule: true,
  default: (props: { defaultName: string }) => {
    importRigModalRenders.push({ defaultName: props.defaultName })
    return null
  },
}))

import LightsLayout from './LightsLayout'

const fixture = {
  id: 'f1',
  position: 0,
  fixture: FixtureTypes.RGB,
  label: 'PAR',
  name: 'PAR',
  isStrobeEnabled: false,
  group: '',
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
  universe: 0,
} as unknown as DmxFixture

// The settled editor shape for a single-light, front-only, strobe-None layout: group 'front',
// position 1, strobeMode 'disabled' (added by the None-strobe effect), and NO strobeValues.
const initialFront = {
  id: 'l1',
  fixtureId: 'f1',
  position: 1,
  fixture: FixtureTypes.RGB,
  label: 'PAR',
  name: 'PAR',
  isStrobeEnabled: false,
  group: 'front',
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
  universe: 0,
  mount: 'floor',
  strobeMode: 'disabled',
} as unknown as DmxLight

const initialRig: DmxRig = {
  id: 'r1',
  name: 'Rig A',
  active: true,
  config: {
    numLights: 1,
    lightLayout: { id: 'front', label: 'Front only' },
    strobeType: ConfigStrobeType.None,
    frontLights: [initialFront],
    backLights: [],
    strobeLights: [],
  },
}

// Mimics backend normalization on read: materialize a strobeValues default onto every light. The
// editor's raw config lacks this key, so raw-vs-normalized compares unequal.
function normalizeForTest(rig: DmxRig): DmxRig {
  const addStrobeValues = (lights: DmxLight[]): DmxLight[] =>
    lights.map((l) => ({ ...l, strobeValues: { value: 128 } }) as unknown as DmxLight)
  return {
    ...rig,
    config: {
      ...rig.config,
      frontLights: addStrobeValues(rig.config.frontLights),
      backLights: addStrobeValues(rig.config.backLights),
      strobeLights: addStrobeValues(rig.config.strobeLights),
    },
  }
}

let lastSavedRig: DmxRig | null = null

beforeEach(() => {
  lastSavedRig = null
  resetIpcApiMock()
  // Reads return the un-normalized rig until a save happens (page loads clean), then the normalized
  // rig (strobeValues materialized) — the canonical shape the dirty check compares against.
  getDmxRigsMock.mockImplementation(async () => [
    lastSavedRig ? normalizeForTest(lastSavedRig) : initialRig,
  ])
  getDmxRigMock.mockImplementation(async () =>
    lastSavedRig ? normalizeForTest(lastSavedRig) : initialRig,
  )
  saveDmxRigMock.mockImplementation(async (rig: DmxRig) => {
    lastSavedRig = rig
    return { success: true }
  })
})

afterEach(() => cleanup())

function renderPage() {
  return renderWithProviders(<LightsLayout />, {
    seed: (set) => {
      set(activeRigIdAtom, 'r1')
      set(dmxRigsAtom, [initialRig])
      set(activeDmxLightsConfigAtom, initialRig.config)
      // myValidDmxLightsAtom (the editor's usable fixtures) is derived from myDmxLightsAtom,
      // filtering to fixtures whose channels are all above 0, and the fixture below qualifies.
      set(myDmxLightsAtom, [fixture])
      set(lightingPrefsAtom, {})
    },
  }).store
}

describe('LightsLayout — unsaved-changes flag', () => {
  it('clears the flag after a save even when the backend normalizes the saved config', async () => {
    const store = renderPage()

    // Page loads clean: both sides come from the same un-normalized read.
    await waitFor(() => expect(screen.getByText('Save Changes')).toBeInTheDocument())
    await waitFor(() => expect(store.get(lightsLayoutHasUnsavedChangesAtom)).toBe(false))

    await act(async () => {
      fireEvent.click(screen.getByText('Save Changes'))
    })
    await waitFor(() => expect(saveDmxRigMock).toHaveBeenCalled())

    // Mimic App.tsx's CONTROLLERS_RESTARTED handler reloading only dmxRigsAtom from the (now
    // normalized) backend. Without the fix, activeDmxLightsConfigAtom stays raw and the flag is
    // stuck true; with the fix, handleSaveChanges already adopted the normalized config for both.
    await act(async () => {
      store.set(dmxRigsAtom, await getDmxRigsMock())
    })

    await waitFor(() => expect(store.get(lightsLayoutHasUnsavedChangesAtom)).toBe(false))
  })
})

describe('LightsLayout save confirmation', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('hides the confirmation after three seconds and leaves no timer once the page closes', async () => {
    jest.useFakeTimers()
    const view = renderWithProviders(<LightsLayout />, {
      seed: (set) => {
        set(activeRigIdAtom, 'r1')
        set(dmxRigsAtom, [initialRig])
        set(activeDmxLightsConfigAtom, initialRig.config)
        set(myDmxLightsAtom, [fixture])
        set(lightingPrefsAtom, {})
      },
    })
    await waitFor(() => expect(screen.getByText('Save Changes')).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(screen.getByText('Save Changes'))
    })
    await screen.findByText('Changes saved successfully!')
    act(() => jest.advanceTimersByTime(3000))
    expect(screen.queryByText('Changes saved successfully!')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByText('Save Changes'))
    })
    await screen.findByText('Changes saved successfully!')
    view.unmount()

    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('LightsLayout save that answers after a rig switch', () => {
  const otherRig: DmxRig = {
    id: 'r2',
    name: 'Rig B',
    active: false,
    config: {
      numLights: 3,
      lightLayout: { id: 'front', label: 'Front only' },
      strobeType: ConfigStrobeType.None,
      frontLights: [1, 2, 3].map(
        (position) =>
          ({
            ...initialFront,
            id: `b${position}`,
            position,
            channels: { masterDimmer: 100 + position * 4, red: 0, green: 0, blue: 0 },
          }) as unknown as DmxLight,
      ),
      backLights: [],
      strobeLights: [],
    },
  }

  it('keeps the rig the user switched to in the editor and holds Save while it waits', async () => {
    let answerSave!: () => void
    saveDmxRigMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          answerSave = () => resolve({ success: true })
        }) as never,
    )
    getDmxRigsMock.mockImplementation(async () => [initialRig, otherRig])
    getDmxRigMock.mockImplementation(async (id: string) => (id === 'r2' ? otherRig : initialRig))
    const { store } = renderWithProviders(<LightsLayout />, {
      seed: (set) => {
        set(activeRigIdAtom, 'r1')
        set(dmxRigsAtom, [initialRig, otherRig])
        set(activeDmxLightsConfigAtom, initialRig.config)
        set(myDmxLightsAtom, [fixture])
        set(lightingPrefsAtom, {})
      },
    })
    const save = await screen.findByText('Save Changes')

    await act(async () => {
      fireEvent.click(save)
    })
    expect(save).toBeDisabled()
    act(() => {
      store.set(activeRigIdAtom, 'r2')
      store.set(activeDmxLightsConfigAtom, otherRig.config)
    })
    await act(async () => answerSave())

    expect(store.get(activeRigIdAtom)).toBe('r2')
    expect(store.get(activeDmxLightsConfigAtom)?.numLights).toBe(3)
    await waitFor(() => expect(save).toBeEnabled())
  })
})

describe('LightsLayout import dialog', () => {
  it('does not build the import dialog until there is an import to name', async () => {
    // The dialog seeds its name field when it mounts. Kept mounted behind an isOpen prop it
    // seeded from nothing, so it later opened empty with Import unavailable. Rendering null while
    // closed hides that from the DOM, so the check is whether it was built at all.
    renderPage()
    await act(async () => {})

    expect(importRigModalRenders).toHaveLength(0)
  })
})
