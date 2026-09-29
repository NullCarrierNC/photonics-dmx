/** @jest-environment jsdom */
/**
 * The page remembers what was last simulated. A change made just before leaving the page is
 * written rather than dropped, and a refused write says so.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import {
  installWindowApi,
  emitWindowApi,
  type WindowApiAnswers,
  type WindowApiStub,
} from '@renderer/tests/helpers/windowApiStub'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import {
  audioListenerEnabledAtom,
  lightingPrefsAtom,
  rb3eListenerEnabledAtom,
  yargListenerEnabledAtom,
  previewRigIdAtom,
} from '../atoms'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  cueSimulationAnswers,
  listingGroups,
  offeringVerse,
  storingSettings,
  verseGroup,
  type CueGroupListing,
  type SimulationSettings,
} from '@renderer/tests/helpers/cueSimulationAnswers'

// `ipcHelpers` subscribes to the bridge once per channel and keeps it across tests, so the bridge
// stays installed and each test resets the answers in place.
const answers: WindowApiAnswers = cueSimulationAnswers()
const api: WindowApiStub = installWindowApi(answers)

jest.mock('@renderer/hooks/useDmxPreview', () => ({
  useDmxPreview: () => ({ selectedRig: null, rigConfig: null }),
}))

jest.mock('@renderer/components/LiveDmxPreview', () => ({
  LiveLightsDmxPreview: () => null,
  LiveLightsDmxChannelsPreview: () => null,
}))

import CueSimulation from './CueSimulation'

function renderPage() {
  return renderWithProviders(<CueSimulation />, {
    seed: (set) => {
      set(lightingPrefsAtom, {})
      set(audioListenerEnabledAtom, false)
      set(rb3eListenerEnabledAtom, false)
      set(yargListenerEnabledAtom, false)
      set(previewRigIdAtom, null)
    },
  })
}

/** The simulation settings each save-prefs call carried, in order. */
function savedSettings(): Record<string, unknown>[] {
  return api.invoke.mock.calls
    .filter(([channel]) => channel === CONFIG.SAVE_PREFS)
    .map(([, payload]) => payload as { simulationSettings?: Record<string, unknown> })
    .filter((p) => p.simulationSettings !== undefined)
    .map((p) => p.simulationSettings as Record<string, unknown>)
}

const STORED: SimulationSettings = {
  registryType: 'YARG',
  groupId: 'zeta',
  effectId: 'Verse',
  venueSize: 'Large',
  bpm: 120,
  instrument: 'guitar',
}

const ALPHA = verseGroup('alpha', 'Alpha')
const ZETA = verseGroup('zeta', 'Zeta')

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function registryFills(groups: CueGroupListing[]): Promise<void> {
  listingGroups(answers, groups)
  await act(async () => {
    emitWindowApi(RENDERER_RECEIVE.NODE_CUES_CHANGED, {
      loaded: groups.length,
      failed: 0,
      errors: [],
    })
  })
}

async function changeBpm(value: string): Promise<void> {
  const field = await screen.findByLabelText('BPM')
  fireEvent.change(field, { target: { value } })
  fireEvent.blur(field)
}

describe('CueSimulation settings', () => {
  beforeEach(() => {
    api.invoke.mockClear()
    Object.assign(answers, cueSimulationAnswers())
  })

  afterEach(() => {
    cleanup()
  })

  it('writes a change made just before the page is left', async () => {
    const view = renderPage()
    await changeBpm('140')

    view.unmount()

    await waitFor(() => expect(savedSettings().some((s) => s.bpm === 140)).toBe(true))
  })

  it('reopens on the saved group and writes nothing when nothing changed', async () => {
    storingSettings(answers, STORED)
    listingGroups(answers, [ALPHA, ZETA])
    offeringVerse(answers)
    const view = renderPage()

    await screen.findByRole('option', { name: 'Zeta' })
    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('zeta'))
    await new Promise((resolve) => setTimeout(resolve, 700))
    view.unmount()

    expect(savedSettings()).toEqual([])
  })

  it('keeps the stored group while the registry does not list it and selects it once listed', async () => {
    storingSettings(answers, STORED)
    offeringVerse(answers)
    const view = renderPage()

    await settle(700)
    expect(savedSettings()).toEqual([])

    await registryFills([ALPHA, ZETA])
    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('zeta'))
    await settle(700)
    view.unmount()

    expect(savedSettings()).toEqual([])
  })

  it('shows the first group in place of an unlisted stored one without storing it', async () => {
    storingSettings(answers, STORED)
    listingGroups(answers, [ALPHA])
    offeringVerse(answers)
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('alpha'))
    await settle(700)
    expect(savedSettings()).toEqual([])

    await registryFills([ALPHA, ZETA])
    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('zeta'))
    await settle(700)
    expect(savedSettings()).toEqual([])
  })

  it('stores the shown group once the user picks a cue in it', async () => {
    storingSettings(answers, STORED)
    listingGroups(answers, [ALPHA])
    offeringVerse(answers)
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('alpha'))
    const verse = await screen.findByRole('option', { name: 'Verse' })
    fireEvent.change(verse.closest('select') as HTMLSelectElement, { target: { value: 'Verse' } })

    await waitFor(() =>
      expect(savedSettings()).toContainEqual({ ...STORED, groupId: 'alpha', effectId: 'Verse' }),
    )
  })

  it('writes nothing when the stored settings cannot be read', async () => {
    answers[CONFIG.GET_PREFS] = () => ({ success: false, error: 'unreadable' })
    listingGroups(answers, [ALPHA])
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('alpha'))
    await settle(700)

    expect(savedSettings()).toEqual([])
  })

  it.each([
    [240, 240],
    [1000, 120],
  ])('reopens with a stored BPM of %s showing %s', async (bpm, shown) => {
    storingSettings(answers, { ...STORED, bpm })
    listingGroups(answers, [ALPHA, ZETA])
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('zeta'))

    expect(screen.getByLabelText('BPM')).toHaveValue(shown)
  })

  it('says so when the settings cannot be stored', async () => {
    answers[CONFIG.SAVE_PREFS] = () => ({ success: false, error: 'read only' })
    renderPage()

    await changeBpm('140')

    await screen.findByRole('alert', {}, { timeout: 3000 })
  })
})
