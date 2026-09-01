/** @jest-environment jsdom */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import MasterOutputSidebar from './MasterOutputSidebar'
import { lightingPrefsAtom } from '../atoms'
import { LIGHT, CONFIG } from '../../../shared/ipcChannels'

const invoke = jest.fn() as jest.MockedFunction<
  (channel: string, data: unknown) => Promise<unknown>
>

function mockInvoke(state = { dimmerPercent: 100, blackout: false, strobeOutputEnabled: true }) {
  invoke.mockImplementation((channel: string) => {
    if (channel === LIGHT.GET_MASTER_OUTPUT) return Promise.resolve(state)
    if (channel === LIGHT.SET_MASTER_OUTPUT) return Promise.resolve({ success: true, state })
    if (channel === CONFIG.SAVE_PREFS) return Promise.resolve({ success: true })
    return Promise.resolve(undefined)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockInvoke()
  Object.defineProperty(window, 'api', {
    value: { invoke, send: jest.fn(), receive: jest.fn().mockReturnValue(jest.fn()) },
    configurable: true,
  })
})

async function renderSidebar() {
  const store = createStore()
  store.set(lightingPrefsAtom, { masterDimmerPercent: 100, strobeOutputEnabled: true })
  const utils = render(
    <Provider store={store}>
      <MasterOutputSidebar />
    </Provider>,
  )
  await waitFor(() => expect(invoke).toHaveBeenCalledWith(LIGHT.GET_MASTER_OUTPUT, undefined))
  return { ...utils, store }
}

function setsMasterOutput(): unknown[] {
  return invoke.mock.calls.filter((c) => c[0] === LIGHT.SET_MASTER_OUTPUT).map((c) => c[1])
}

function savedPrefs(): unknown[] {
  return invoke.mock.calls.filter((c) => c[0] === CONFIG.SAVE_PREFS).map((c) => c[1])
}

describe('MasterOutputSidebar', () => {
  it('seeds itself from main rather than from prefs', async () => {
    mockInvoke({ dimmerPercent: 45, blackout: true, strobeOutputEnabled: false })
    await renderSidebar()

    await waitFor(() => expect(screen.getByText('45%')).toBeTruthy())
    // Blackout has no prefs value at all, so main is the only place this could come from.
    expect(screen.getByText('Blacked Out')).toBeTruthy()
    expect(screen.getByText('Strobe Off')).toBeTruthy()
  })

  it('applies a fader move live but only writes prefs when the gesture ends', async () => {
    await renderSidebar()
    const fader = screen.getByLabelText('Master dimmer') as HTMLInputElement

    fireEvent.change(fader, { target: { value: '60' } })

    await waitFor(() => expect(setsMasterOutput()).toContainEqual({ dimmerPercent: 60 }))
    // A drag would otherwise rewrite prefs.json once per pixel.
    expect(savedPrefs()).toHaveLength(0)

    fireEvent.mouseUp(fader)
    await waitFor(() => expect(savedPrefs()).toContainEqual({ masterDimmerPercent: 60 }))
  })

  it('toggles blackout live and never persists it', async () => {
    await renderSidebar()

    fireEvent.click(screen.getByText('Blackout'))

    await waitFor(() => expect(setsMasterOutput()).toContainEqual({ blackout: true }))
    expect(savedPrefs()).toHaveLength(0)
    expect(screen.getByText('Blacked Out')).toBeTruthy()
  })

  it('toggles the strobe gate live and persists it', async () => {
    await renderSidebar()

    fireEvent.click(screen.getByText('Strobe On'))

    await waitFor(() => expect(setsMasterOutput()).toContainEqual({ strobeOutputEnabled: false }))
    await waitFor(() => expect(savedPrefs()).toContainEqual({ strobeOutputEnabled: false }))
    expect(screen.getByText('Strobe Off')).toBeTruthy()
  })
})
