/** @jest-environment jsdom */
/**
 * The page remembers what was last simulated. A change made just before leaving the page is
 * written rather than dropped, and a refused write says so.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { installWindowApi, emitWindowApi } from '@renderer/tests/helpers/windowApiStub'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import {
  audioListenerEnabledAtom,
  lightingPrefsAtom,
  rb3eListenerEnabledAtom,
  yargListenerEnabledAtom,
  previewRigIdAtom,
} from '../atoms'
import { LIGHT, CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'

let savePrefsAnswer: unknown = undefined
let prefsAnswer: unknown = {}
let cueGroupsAnswer: unknown[] = []
let availableCuesAnswer: unknown[] = []

const invoke = jest.fn<(channel: string, payload?: unknown) => Promise<unknown>>(
  async (channel: string) => {
    if (channel === CONFIG.SAVE_PREFS) return savePrefsAnswer
    if (channel === CONFIG.GET_PREFS) return prefsAnswer
    if (channel === LIGHT.GET_CUE_GROUPS) return cueGroupsAnswer
    if (channel === CONFIG.GET_ENABLED_CUE_GROUPS) {
      return (cueGroupsAnswer as Array<{ id: string }>).map((g) => g.id)
    }
    if (channel === LIGHT.GET_AVAILABLE_CUES) return availableCuesAnswer
    if (channel.startsWith('get-')) return []
    if (channel === LIGHT.SIMULATE_POST_PROCESSING) return true
    if (channel === CONFIG.GET_PREFS) return {}
    return undefined
  },
)
installWindowApi(invoke)

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
  return invoke.mock.calls
    .filter(([channel]) => channel === CONFIG.SAVE_PREFS)
    .map(([, payload]) => payload as { simulationSettings?: Record<string, unknown> })
    .filter((p) => p.simulationSettings !== undefined)
    .map((p) => p.simulationSettings as Record<string, unknown>)
}

const STORED = {
  registryType: 'YARG',
  groupId: 'zeta',
  effectId: 'Verse',
  venueSize: 'Large',
  bpm: 120,
  instrument: 'guitar',
}

const ALPHA = { id: 'alpha', name: 'Alpha', description: '', cueTypes: ['Verse'] }
const ZETA = { id: 'zeta', name: 'Zeta', description: '', cueTypes: ['Verse'] }

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function registryFills(groups: unknown[]): Promise<void> {
  cueGroupsAnswer = groups
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
    invoke.mockClear()
    savePrefsAnswer = undefined
    prefsAnswer = {}
    cueGroupsAnswer = []
    availableCuesAnswer = []
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
    prefsAnswer = {
      simulationSettings: {
        registryType: 'YARG',
        groupId: 'zeta',
        effectId: 'Verse',
        venueSize: 'Large',
        bpm: 120,
        instrument: 'guitar',
      },
    }
    cueGroupsAnswer = [
      { id: 'alpha', name: 'Alpha', description: '', cueTypes: ['Verse'] },
      { id: 'zeta', name: 'Zeta', description: '', cueTypes: ['Verse'] },
    ]
    availableCuesAnswer = [{ id: 'Verse', yargDescription: 'Verse', rb3Description: '' }]
    const view = renderPage()

    await screen.findByRole('option', { name: 'Zeta' })
    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('zeta'))
    await new Promise((resolve) => setTimeout(resolve, 700))
    view.unmount()

    expect(savedSettings()).toEqual([])
  })

  it('keeps the stored group while the registry does not list it and selects it once listed', async () => {
    prefsAnswer = { simulationSettings: STORED }
    availableCuesAnswer = [{ id: 'Verse', yargDescription: 'Verse', rb3Description: '' }]
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
    prefsAnswer = { simulationSettings: STORED }
    cueGroupsAnswer = [ALPHA]
    availableCuesAnswer = [{ id: 'Verse', yargDescription: 'Verse', rb3Description: '' }]
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
    prefsAnswer = { simulationSettings: STORED }
    cueGroupsAnswer = [ALPHA]
    availableCuesAnswer = [{ id: 'Verse', yargDescription: 'Verse', rb3Description: '' }]
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('alpha'))
    const verse = await screen.findByRole('option', { name: 'Verse' })
    fireEvent.change(verse.closest('select') as HTMLSelectElement, { target: { value: 'Verse' } })

    await waitFor(() =>
      expect(savedSettings()).toContainEqual({ ...STORED, groupId: 'alpha', effectId: 'Verse' }),
    )
  })

  it('writes nothing when the stored settings cannot be read', async () => {
    prefsAnswer = { success: false, error: 'unreadable' }
    cueGroupsAnswer = [ALPHA]
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('alpha'))
    await settle(700)

    expect(savedSettings()).toEqual([])
  })

  it.each([
    [240, 240],
    [1000, 120],
  ])('reopens with a stored BPM of %s showing %s', async (bpm, shown) => {
    prefsAnswer = { simulationSettings: { ...STORED, bpm } }
    cueGroupsAnswer = [ALPHA, ZETA]
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('zeta'))

    expect(screen.getByLabelText('BPM')).toHaveValue(shown)
  })

  it('says so when the settings cannot be stored', async () => {
    savePrefsAnswer = { success: false, error: 'read only' }
    renderPage()

    await changeBpm('140')

    await screen.findByRole('alert', {}, { timeout: 3000 })
  })
})
