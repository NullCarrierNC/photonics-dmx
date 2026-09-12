/** @jest-environment jsdom */
/**
 * The Venue Post-Processing picker only appears where it can do something: YARG cue mode with the
 * preference on. With the preference off the value would be ignored, so showing it would mislead.
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

// Stub the bridge rather than the ipcApi module, so every call the page and its children make
// resolves instead of only the handful this file names.
const invoke = jest.fn<(channel: string, payload?: unknown) => Promise<unknown>>(
  async (channel: string) => {
    if (channel.startsWith('get-')) return []
    if (channel === LIGHT.SIMULATE_POST_PROCESSING) return true
    if (channel === CONFIG.GET_PREFS) return {}
    return undefined
  },
)
;(window as unknown as { api: unknown }).api = {
  invoke,
  // Returns the unsubscribe callback that ipcHelpers expects.
  receive: jest.fn(() => jest.fn()),
  send: jest.fn(),
}

jest.mock('@renderer/hooks/useDmxPreview', () => ({
  useDmxPreview: () => ({ selectedRig: null, rigConfig: null }),
}))

// The preview pulls in a Three.js font asset the test runner cannot resolve, and none of these
// cases look at the rendered rig.
jest.mock('@renderer/components/LiveDmxPreview', () => ({
  LiveLightsDmxPreview: () => null,
  LiveLightsDmxChannelsPreview: () => null,
}))

import CueSimulation from './CueSimulation'

const PICKER_LABEL = 'Effect'

function renderWith(prefs: Record<string, unknown>, options: { yargEnabled?: boolean } = {}) {
  return renderWithProviders(<CueSimulation />, {
    seed: (set) => {
      set(lightingPrefsAtom, prefs)
      set(audioListenerEnabledAtom, false)
      set(rb3eListenerEnabledAtom, false)
      set(yargListenerEnabledAtom, options.yargEnabled ?? false)
      set(previewRigIdAtom, null)
    },
  })
}

function postProcessingCalls(): unknown[] {
  return invoke.mock.calls
    .filter((call) => call[0] === LIGHT.SIMULATE_POST_PROCESSING)
    .map((call) => (call[1] as { state?: unknown } | undefined)?.state)
}

describe('Cue Simulation venue post-processing picker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the picker when the preference has never been set', async () => {
    renderWith({})
    await waitFor(() => expect(screen.getByText('Venue Post-Processing')).toBeInTheDocument())
    expect(screen.getByLabelText(PICKER_LABEL)).toBeInTheDocument()
  })

  it('shows the picker when the preference is on', async () => {
    renderWith({ venuePostProcessingEnabled: true })
    await waitFor(() => expect(screen.getByText('Venue Post-Processing')).toBeInTheDocument())
  })

  it('hides the picker when the preference is off', async () => {
    renderWith({ venuePostProcessingEnabled: false })
    await waitFor(() => expect(screen.queryByText('Venue Post-Processing')).toBeNull())
    expect(screen.queryByLabelText(PICKER_LABEL)).toBeNull()
  })

  it('disables the picker while YARG owns live input', async () => {
    renderWith({}, { yargEnabled: true })
    await waitFor(() => expect(screen.getByLabelText(PICKER_LABEL)).toBeInTheDocument())
    expect((screen.getByLabelText(PICKER_LABEL) as HTMLSelectElement).disabled).toBe(true)
  })

  it('does not clear post-processing on unmount when nothing was simulated', async () => {
    const view = renderWith({ venuePostProcessingEnabled: true })
    await waitFor(() => expect(screen.getByLabelText(PICKER_LABEL)).toBeInTheDocument())
    view.unmount()
    expect(postProcessingCalls()).toEqual([])
  })

  it('clears simulated post-processing on unmount after the picker changed it', async () => {
    const view = renderWith({ venuePostProcessingEnabled: true })
    await waitFor(() => expect(screen.getByLabelText(PICKER_LABEL)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(PICKER_LABEL), { target: { value: 'BlackAndWhite' } })
    await waitFor(() => expect(postProcessingCalls()).toContain('BlackAndWhite'))

    view.unmount()
    await waitFor(() => expect(postProcessingCalls()).toContain('Default'))
  })
})
