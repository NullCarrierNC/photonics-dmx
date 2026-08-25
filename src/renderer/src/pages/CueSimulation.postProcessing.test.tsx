/** @jest-environment jsdom */
/**
 * The Venue Post-Processing picker only appears where it can do something: YARG cue mode with the
 * preference on. With the preference off the value would be ignored, so showing it would mislead.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
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

function renderWith(
  prefs: Record<string, unknown>,
  options: { yargEnabled?: boolean } = {},
): ReturnType<typeof render> {
  const store = createStore()
  store.set(lightingPrefsAtom, prefs)
  store.set(audioListenerEnabledAtom, false)
  store.set(rb3eListenerEnabledAtom, false)
  store.set(yargListenerEnabledAtom, options.yargEnabled ?? false)
  store.set(previewRigIdAtom, null)
  return render(
    <Provider store={store}>
      <CueSimulation />
    </Provider>,
  )
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
    await waitFor(() => expect(screen.getByText('Venue Post-Processing')).toBeTruthy())
    expect(screen.getByLabelText(PICKER_LABEL)).toBeTruthy()
  })

  it('shows the picker when the preference is on', async () => {
    renderWith({ venuePostProcessingEnabled: true })
    await waitFor(() => expect(screen.getByText('Venue Post-Processing')).toBeTruthy())
  })

  it('hides the picker when the preference is off', async () => {
    renderWith({ venuePostProcessingEnabled: false })
    await waitFor(() => expect(screen.queryByText('Venue Post-Processing')).toBeNull())
    expect(screen.queryByLabelText(PICKER_LABEL)).toBeNull()
  })

  it('disables the picker while YARG owns live input', async () => {
    renderWith({}, { yargEnabled: true })
    await waitFor(() => expect(screen.getByLabelText(PICKER_LABEL)).toBeTruthy())
    expect((screen.getByLabelText(PICKER_LABEL) as HTMLSelectElement).disabled).toBe(true)
  })

  it('does not clear post-processing on unmount when nothing was simulated', async () => {
    const view = renderWith({ venuePostProcessingEnabled: true })
    await waitFor(() => expect(screen.getByLabelText(PICKER_LABEL)).toBeTruthy())
    view.unmount()
    expect(postProcessingCalls()).toEqual([])
  })

  it('clears simulated post-processing on unmount after the picker changed it', async () => {
    const view = renderWith({ venuePostProcessingEnabled: true })
    await waitFor(() => expect(screen.getByLabelText(PICKER_LABEL)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(PICKER_LABEL), { target: { value: 'BlackAndWhite' } })
    await waitFor(() => expect(postProcessingCalls()).toContain('BlackAndWhite'))

    view.unmount()
    await waitFor(() => expect(postProcessingCalls()).toContain('Default'))
  })
})
