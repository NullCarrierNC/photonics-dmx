/** @jest-environment jsdom */
import { describe, expect, it, jest, afterEach, beforeEach } from '@jest/globals'
import { act, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { installWindowApi } from '@renderer/tests/helpers/windowApiStub'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import {
  audioListenerEnabledAtom,
  lightingPrefsAtom,
  rb3eListenerEnabledAtom,
  yargListenerEnabledAtom,
  previewRigIdAtom,
} from '../atoms'
import { LIGHT } from '../../../shared/ipcChannels'
import {
  cueSimulationAnswers,
  listingGroups,
  offeringVerse,
  storingSettings,
  verseGroup,
} from '@renderer/tests/helpers/cueSimulationAnswers'

let simulateAnswer = true

const answers = cueSimulationAnswers()
listingGroups(answers, [verseGroup('alpha', 'Alpha')])
offeringVerse(answers)
storingSettings(answers, {
  registryType: 'YARG',
  groupId: 'alpha',
  effectId: 'Verse',
  venueSize: 'NoVenue',
  bpm: 120,
  instrument: 'guitar',
})
answers[LIGHT.SIMULATE_BEAT] = () => simulateAnswer
answers[LIGHT.SIMULATE_MEASURE] = () => simulateAnswer
answers[LIGHT.SIMULATE_KEYFRAME] = () => simulateAnswer
const api = installWindowApi(answers)

jest.mock('@renderer/hooks/useDmxPreview', () => ({
  useDmxPreview: () => ({ selectedRig: null, rigConfig: null }),
}))

jest.mock('@renderer/components/LiveDmxPreview', () => ({
  LiveLightsDmxPreview: () => null,
  LiveLightsDmxChannelsPreview: () => null,
}))

// The real preview shows its lamps only once a cue has been handled, so this one shows the lamp
// props the page passes down.
jest.mock('@renderer/components/CuePreviewYarg', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => (
    <output>
      {['Beat', 'Measure', 'Keyframe'].filter((kind) => props[`show${kind}Indicator`]).join(' ')}
    </output>
  ),
}))

import CueSimulation from './CueSimulation'

async function renderPage(): Promise<void> {
  renderWithProviders(<CueSimulation />, {
    seed: (set) => {
      set(lightingPrefsAtom, {})
      set(audioListenerEnabledAtom, false)
      set(rb3eListenerEnabledAtom, false)
      set(yargListenerEnabledAtom, false)
      set(previewRigIdAtom, null)
    },
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Simulate Beat' })).not.toBeDisabled(),
  )
}

const EVENTS = [
  ['Beat', LIGHT.SIMULATE_BEAT],
  ['Measure', LIGHT.SIMULATE_MEASURE],
  ['Keyframe', LIGHT.SIMULATE_KEYFRAME],
] as const
const KINDS = EVENTS.map(([kind]) => kind)

describe('Cue Simulation song event lamps', () => {
  beforeEach(() => {
    simulateAnswer = true
    api.invoke.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it.each(KINDS)('lights the %s lamp when main runs the event', async (kind) => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: `Simulate ${kind}` }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(kind))
  })

  it.each(EVENTS)('leaves the %s lamp dark when main refuses the event', async (kind, channel) => {
    simulateAnswer = false
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: `Simulate ${kind}` }))

    await waitFor(() => expect(api.invoke.mock.calls.map(([sent]) => sent)).toContain(channel))
    await act(async () => {})
    expect(screen.getByRole('status').textContent).toBe('')
  })
})
