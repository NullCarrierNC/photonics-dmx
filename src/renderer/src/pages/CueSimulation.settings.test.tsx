/** @jest-environment jsdom */
/**
 * The page remembers what was last simulated. A change made just before leaving the page is
 * written rather than dropped, and a refused write says so.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import {
  audioListenerEnabledAtom,
  lightingPrefsAtom,
  rb3eListenerEnabledAtom,
  yargListenerEnabledAtom,
  previewRigIdAtom,
} from '../atoms'
import { LIGHT, CONFIG } from '../../../shared/ipcChannels'

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
;(window as unknown as { api: unknown }).api = {
  invoke,
  receive: jest.fn(() => jest.fn()),
  send: jest.fn(),
}

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

  it('says so when the settings cannot be stored', async () => {
    savePrefsAnswer = { success: false, error: 'read only' }
    renderPage()

    await changeBpm('140')

    await screen.findByRole('alert', {}, { timeout: 3000 })
  })
})
