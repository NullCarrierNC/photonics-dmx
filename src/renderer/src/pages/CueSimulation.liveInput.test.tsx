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
import { LIGHT, CONFIG } from '../../../shared/ipcChannels'

const invoke = jest.fn<(channel: string, payload?: unknown) => Promise<unknown>>(
  async (channel: string) => {
    if (channel === CONFIG.GET_PREFS) {
      return { simulationSettings: { registryType: 'YARG', groupId: 'alpha', effectId: 'Verse' } }
    }
    if (channel === LIGHT.GET_CUE_GROUPS) {
      return [{ id: 'alpha', name: 'Alpha', description: '', cueTypes: ['Verse'] }]
    }
    if (channel === CONFIG.GET_ENABLED_CUE_GROUPS) return ['alpha']
    if (channel === LIGHT.GET_AVAILABLE_CUES) {
      return [{ id: 'Verse', yargDescription: 'Verse', rb3Description: '' }]
    }
    if (channel.startsWith('get-')) return []
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
