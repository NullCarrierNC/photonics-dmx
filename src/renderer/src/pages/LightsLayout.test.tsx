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
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
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

const getDmxRigsMock = jest.fn(async () => [] as DmxRig[])
const getDmxRigMock = jest.fn(async (_id: string) => null as DmxRig | null)
const saveDmxRigMock = jest.fn(
  async (_rig: DmxRig) => ({ success: true }) as { success: boolean; error?: string },
)

jest.mock('../ipcApi', () => ({
  getDmxRigs: () => getDmxRigsMock(),
  getDmxRig: (id: string) => getDmxRigMock(id),
  saveDmxRig: (rig: DmxRig) => saveDmxRigMock(rig),
}))
jest.mock('../hooks/useConfirm', () => ({ useConfirm: () => async () => true }))
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
  getDmxRigsMock.mockReset()
  getDmxRigMock.mockReset()
  saveDmxRigMock.mockReset()
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
  const store = createStore()
  store.set(activeRigIdAtom, 'r1')
  store.set(dmxRigsAtom, [initialRig])
  store.set(activeDmxLightsConfigAtom, initialRig.config)
  // myValidDmxLightsAtom (the editor's usable fixtures) is derived from myDmxLightsAtom, filtering
  // to fixtures whose channels are all > 0 — the fixture below qualifies.
  store.set(myDmxLightsAtom, [fixture])
  store.set(lightingPrefsAtom, {})
  render(
    <Provider store={store}>
      <LightsLayout />
    </Provider>,
  )
  return store
}

describe('LightsLayout — unsaved-changes flag', () => {
  it('clears the flag after a save even when the backend normalizes the saved config', async () => {
    const store = renderPage()

    // Page loads clean: both sides come from the same un-normalized read.
    await waitFor(() => expect(screen.getByText('Save Changes')).toBeTruthy())
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
