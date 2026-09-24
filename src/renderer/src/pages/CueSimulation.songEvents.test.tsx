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
import { LIGHT, CONFIG } from '../../../shared/ipcChannels'

let simulateAnswer = true

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
    if (
      channel === LIGHT.SIMULATE_BEAT ||
      channel === LIGHT.SIMULATE_MEASURE ||
      channel === LIGHT.SIMULATE_KEYFRAME
    ) {
      return simulateAnswer
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
    invoke.mockClear()
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

    await waitFor(() => expect(invoke.mock.calls.map(([sent]) => sent)).toContain(channel))
    await act(async () => {})
    expect(screen.getByRole('status').textContent).toBe('')
  })
})
