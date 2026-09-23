/** @jest-environment jsdom */
/**
 * The Lag Compensation card: a slider and a number field per delay, written once the changes stop
 * arriving so a drag does not write on every position it passes through.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { refused, resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { lightingPrefsAtom } from '../atoms'
import LagCompensationSettings from './LagCompensationSettings'

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const savePrefs = jest.mocked(ipcApi.savePrefs)
const QUIET_MS = 300
const GAME = 'lag-compensation-video-ms'
const AUDIO = 'lag-compensation-audio-ms'

function renderWith(prefs: Record<string, unknown> = {}) {
  return renderWithProviders(<LagCompensationSettings />, {
    seed: (set) => set(lightingPrefsAtom, prefs),
  }).store
}

function control<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`no control with id ${id}`)
  return el as T
}

function slider(id: string): HTMLInputElement {
  return control<HTMLInputElement>(`${id}-slider`)
}

function field(id: string): HTMLInputElement {
  return control<HTMLInputElement>(id)
}

/** Let the quiet window elapse so a held write goes out. */
function settle(): void {
  act(() => {
    jest.advanceTimersByTime(QUIET_MS)
  })
}

describe('LagCompensationSettings', () => {
  beforeEach(() => {
    resetIpcApiMock()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    cleanup()
  })

  describe('which fields are shown', () => {
    it('shows only the game delay without Advanced Mode', () => {
      renderWith()
      expect(slider(GAME)).toBeInTheDocument()
      expect(document.getElementById(`${AUDIO}-slider`)).toBeNull()
    })

    it('labels both delays', () => {
      renderWith({ advancedModeEnabled: true })
      expect(screen.getByRole('slider', { name: 'Game (YARG & RB3)' })).toBeInTheDocument()
      expect(screen.getByRole('slider', { name: 'Audio reactive' })).toBeInTheDocument()
    })

    it('shows the audio delay with Advanced Mode on', () => {
      // Audio-reactive lighting is itself an Advanced Mode feature, so its delay follows it.
      renderWith({ advancedModeEnabled: true })
      expect(slider(GAME)).toBeInTheDocument()
      expect(slider(AUDIO)).toBeInTheDocument()
    })
  })

  describe('what it shows', () => {
    it('is off when the preference has never been set', () => {
      renderWith()
      expect(slider(GAME).value).toBe('0')
      expect(field(GAME).value).toBe('0')
    })

    it('shows a stored delay in both controls', () => {
      renderWith({ videoLagCompensationMs: 180 })
      expect(slider(GAME).value).toBe('180')
      expect(field(GAME).value).toBe('180')
    })

    it('shows each stored delay against its own field', () => {
      renderWith({
        advancedModeEnabled: true,
        videoLagCompensationMs: 180,
        audioLagCompensationMs: 40,
      })
      expect(field(GAME).value).toBe('180')
      expect(field(AUDIO).value).toBe('40')
    })

    it('shows an unusable stored delay as off', () => {
      renderWith({ videoLagCompensationMs: 'fast' })
      expect(slider(GAME).value).toBe('0')
    })

    it('offers the whole range', () => {
      renderWith()
      expect(slider(GAME).min).toBe('0')
      expect(slider(GAME).max).toBe('500')
      expect(field(GAME).min).toBe('0')
      expect(field(GAME).max).toBe('500')
    })
  })

  describe('dragging the slider', () => {
    it('writes once for a run of positions', async () => {
      renderWith()

      fireEvent.change(slider(GAME), { target: { value: '100' } })
      fireEvent.change(slider(GAME), { target: { value: '150' } })
      fireEvent.change(slider(GAME), { target: { value: '200' } })
      expect(savePrefs).not.toHaveBeenCalled()

      settle()

      await waitFor(() => expect(savePrefs).toHaveBeenCalledTimes(1))
      expect(savePrefs).toHaveBeenCalledWith({ videoLagCompensationMs: 200 })
    })

    it('shows the position under the hand before any write answers', () => {
      renderWith()
      fireEvent.change(slider(GAME), { target: { value: '275' } })
      expect(slider(GAME).value).toBe('275')
      expect(field(GAME).value).toBe('275')
    })

    it('writes as soon as the drag ends', async () => {
      renderWith()

      fireEvent.change(slider(GAME), { target: { value: '120' } })
      fireEvent.pointerUp(slider(GAME))

      await waitFor(() => expect(savePrefs).toHaveBeenCalledWith({ videoLagCompensationMs: 120 }))
    })

    it('writes nothing when a drag returns to where it started', async () => {
      renderWith({ videoLagCompensationMs: 100 })

      fireEvent.change(slider(GAME), { target: { value: '160' } })
      fireEvent.change(slider(GAME), { target: { value: '100' } })
      settle()

      await waitFor(() => expect(savePrefs).not.toHaveBeenCalled())
    })

    it('writes only its own key, so one delay cannot revert the other', async () => {
      renderWith({
        advancedModeEnabled: true,
        videoLagCompensationMs: 180,
        audioLagCompensationMs: 40,
      })

      fireEvent.change(slider(AUDIO), { target: { value: '90' } })
      settle()

      await waitFor(() => expect(savePrefs).toHaveBeenCalledWith({ audioLagCompensationMs: 90 }))
      expect(savePrefs).toHaveBeenCalledTimes(1)
    })
  })

  describe('typing a delay', () => {
    it('writes the typed value once it is committed', async () => {
      renderWith()

      fireEvent.change(field(GAME), { target: { value: '240' } })
      fireEvent.blur(field(GAME))

      await waitFor(() => expect(savePrefs).toHaveBeenCalledWith({ videoLagCompensationMs: 240 }))
    })

    it('holds a value past the ceiling inside the range', async () => {
      renderWith()

      fireEvent.change(field(GAME), { target: { value: '999' } })
      fireEvent.blur(field(GAME))

      await waitFor(() => expect(savePrefs).toHaveBeenCalledWith({ videoLagCompensationMs: 500 }))
    })
  })

  describe('when the write lands', () => {
    it('records the delay once it is stored', async () => {
      const store = renderWith()

      fireEvent.change(slider(GAME), { target: { value: '210' } })
      settle()

      await waitFor(() => expect(store.get(lightingPrefsAtom).videoLagCompensationMs).toBe(210))
    })

    it('keeps the stored delay and says so when the write is refused', async () => {
      savePrefs.mockResolvedValue(refused('nope'))
      const store = renderWith({ videoLagCompensationMs: 100 })

      fireEvent.change(slider(GAME), { target: { value: '210' } })
      settle()

      expect(await screen.findByRole('alert')).toHaveTextContent(/lag compensation/i)
      expect(store.get(lightingPrefsAtom).videoLagCompensationMs).toBe(100)
      await waitFor(() => expect(slider(GAME).value).toBe('100'))
    })
  })

  it('writes the same delay again after a refusal', async () => {
    savePrefs.mockResolvedValueOnce(refused('nope'))
    renderWith({ videoLagCompensationMs: 100 })

    fireEvent.change(slider(GAME), { target: { value: '210' } })
    settle()
    await waitFor(() => expect(slider(GAME).value).toBe('100'))

    fireEvent.change(slider(GAME), { target: { value: '210' } })
    settle()

    await waitFor(() => expect(savePrefs).toHaveBeenCalledTimes(2))
    expect(savePrefs).toHaveBeenLastCalledWith({ videoLagCompensationMs: 210 })
  })

  it('writes a held change when the card goes away', async () => {
    const { unmount } = renderWithProviders(<LagCompensationSettings />, {
      seed: (set) => set(lightingPrefsAtom, {}),
    })

    fireEvent.change(slider(GAME), { target: { value: '175' } })
    expect(savePrefs).not.toHaveBeenCalled()

    unmount()

    await waitFor(() => expect(savePrefs).toHaveBeenCalledWith({ videoLagCompensationMs: 175 }))
  })
})
