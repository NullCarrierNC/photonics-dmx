/** @jest-environment jsdom */
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { screen, cleanup, waitFor } from '@testing-library/react'
import { installWindowApi } from '@renderer/tests/helpers/windowApiStub'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import {
  audioListenerEnabledAtom,
  lightingPrefsAtom,
  rb3eListenerEnabledAtom,
  yargListenerEnabledAtom,
  previewRigIdAtom,
} from '../atoms'
import {
  cueSimulationAnswers,
  listingGroups,
  offeringVerse,
  storingSettings,
  verseGroup,
} from '@renderer/tests/helpers/cueSimulationAnswers'

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
installWindowApi(answers)

jest.mock('@renderer/hooks/useDmxPreview', () => ({
  useDmxPreview: () => ({ selectedRig: null, rigConfig: null }),
}))

jest.mock('@renderer/components/LiveDmxPreview', () => ({
  LiveLightsDmxPreview: () => null,
  LiveLightsDmxChannelsPreview: () => null,
}))

import CueSimulation from './CueSimulation'

function renderWithLive(live: { yarg?: boolean; rb3?: boolean }) {
  return renderWithProviders(<CueSimulation />, {
    seed: (set) => {
      set(lightingPrefsAtom, { advancedModeEnabled: true })
      set(audioListenerEnabledAtom, false)
      set(rb3eListenerEnabledAtom, live.rb3 ?? false)
      set(yargListenerEnabledAtom, live.yarg ?? false)
      set(previewRigIdAtom, null)
    },
  })
}

const startButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: 'Start Test Cue' }) as HTMLButtonElement

describe('Cue Simulation while a live input owns the lights', () => {
  afterEach(() => {
    cleanup()
  })

  it('offers the simulate buttons with no live input', async () => {
    renderWithLive({})

    await waitFor(() => expect(startButton().disabled).toBe(false))
    expect(screen.queryByText(/owns the lights/)).toBeNull()
  })

  it.each([
    ['YARG', { yarg: true }],
    ['RB3E', { rb3: true }],
  ])('holds every simulate button while %s runs', async (listener, live) => {
    renderWithLive(live)

    await screen.findByText(
      `${listener} is enabled and owns the lights. Disable ${listener} to simulate cues.`,
    )
    await waitFor(() => expect(screen.getByLabelText('Cue Group')).toHaveValue('alpha'))
    expect(startButton().disabled).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Simulate Beat' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    const stopMotion = screen.getByRole('button', { name: 'Stop simulating motion cue' })
    expect((stopMotion as HTMLButtonElement).disabled).toBe(true)
  })
})
