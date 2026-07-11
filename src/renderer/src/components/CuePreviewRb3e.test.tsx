/** @jest-environment jsdom */
/**
 * The RB3E "LED Position Mapping" indicator derives its four colour banks from each cue frame via
 * the pure `nextColorBanks` reducer. It must never leave an LED stuck ON: a full `ledBanks` snapshot
 * (cue mode + simulation) replaces every bank each frame, and direct-mode off frames clear the banks.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { act, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import * as ipcApi from '../ipcApi'
import { rb3eListenerEnabledAtom } from '../atoms'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import CuePreviewRb3e, { nextColorBanks } from './CuePreviewRb3e'
import { defaultCueData, type CueData } from '../../../photonics-dmx/cues/types/cueTypes'

// Capture registered IPC handlers so tests can push game-mode events.
const mockHandlers: Record<string, Array<(p: unknown) => void>> = {}
jest.mock('../utils/ipcHelpers', () => ({
  addIpcListener: (ch: string, h: (p: unknown) => void) => {
    ;(mockHandlers[ch] ||= []).push(h)
  },
  removeIpcListener: (ch: string, h: (p: unknown) => void) => {
    mockHandlers[ch] = (mockHandlers[ch] || []).filter((x) => x !== h)
  },
}))
jest.mock('../ipcApi', () => {
  const actual = jest.requireActual<typeof import('../ipcApi')>('../ipcApi')
  return {
    ...actual,
    setListenCueData: jest.fn(),
    getMotionEnabled: jest.fn(),
    getActiveRb3MotionCue: jest.fn(),
    getRb3CueGroups: jest.fn(),
    getRb3MotionCueGroups: jest.fn(),
    getAvailableRb3MotionCues: jest.fn(),
  }
})

type Banks = { red: number[]; green: number[]; blue: number[]; yellow: number[] }
const EMPTY: Banks = { red: [], green: [], blue: [], yellow: [] }

const frame = (partial: Partial<CueData>): CueData => ({ ...defaultCueData, ...partial })
// Direct-mode frames carry no ledBanks snapshot (one colour per packet).
const directFrame = (partial: Partial<CueData>): CueData =>
  frame({ ...partial, ledBanks: undefined })

describe('nextColorBanks', () => {
  it('replaces all four banks from a ledBanks snapshot (cue mode / simulation)', () => {
    const out = nextColorBanks(
      EMPTY,
      frame({ ledBanks: { red: 0b0101, green: 0, blue: 0, yellow: 0 } }),
    )
    expect(out.red).toEqual([0, 2])
    expect(out.green).toEqual([])
    expect(out.blue).toEqual([])
    expect(out.yellow).toEqual([])
  })

  it('clears a bank on the next snapshot — the stuck-ON regression', () => {
    const lit = nextColorBanks(
      EMPTY,
      frame({ ledBanks: { red: 0b0101, green: 0, blue: 0, yellow: 0 } }),
    )
    const off = nextColorBanks(lit, frame({ ledBanks: { red: 0, green: 0, blue: 0, yellow: 0 } }))
    expect(off).toEqual(EMPTY)
  })

  it('does not misassign the aggregate: each snapshot bank shows only its own positions', () => {
    // red bit0 + yellow bit2 lit; red must NOT pick up yellow's position.
    const out = nextColorBanks(
      EMPTY,
      frame({ ledBanks: { red: 0b0001, green: 0, blue: 0, yellow: 0b0100 } }),
    )
    expect(out.red).toEqual([0])
    expect(out.yellow).toEqual([2])
    expect(out.green).toEqual([])
  })

  it('cue-mode all-off (ledColor "off") clears via the empty snapshot', () => {
    const lit = nextColorBanks(
      EMPTY,
      frame({ ledBanks: { red: 0b1111, green: 0, blue: 0, yellow: 0 } }),
    )
    const off = nextColorBanks(
      lit,
      frame({
        ledBanks: { red: 0, green: 0, blue: 0, yellow: 0 },
        ledColor: 'off',
        ledPositions: [],
      }),
    )
    expect(off).toEqual(EMPTY)
  })

  it('direct mode sets one colour bank and retains the others', () => {
    const withRed: Banks = { ...EMPTY, red: [7] }
    const out = nextColorBanks(withRed, directFrame({ ledColor: 'green', ledPositions: [1, 3] }))
    expect(out.green).toEqual([1, 3])
    expect(out.red).toEqual([7]) // untouched
  })

  it('direct mode clears a single bank when its packet has empty positions', () => {
    const withGreen: Banks = { ...EMPTY, green: [1, 3], red: [0] }
    const out = nextColorBanks(withGreen, directFrame({ ledColor: 'green', ledPositions: [] }))
    expect(out.green).toEqual([])
    expect(out.red).toEqual([0]) // other banks persist
  })

  it('direct mode global off ("" and "off") clears every bank', () => {
    const lit: Banks = { red: [0], green: [1], blue: [2], yellow: [3] }
    expect(nextColorBanks(lit, directFrame({ ledColor: '', ledPositions: [] }))).toEqual(EMPTY)
    expect(nextColorBanks(lit, directFrame({ ledColor: 'off' }))).toEqual(EMPTY)
  })

  it('leaves banks untouched on a frame carrying no LED info', () => {
    const lit: Banks = { red: [0], green: [], blue: [], yellow: [] }
    const out = nextColorBanks(lit, directFrame({ ledColor: null }))
    expect(out).toBe(lit) // same reference — no update
  })
})

const gameplayFrame = (p: Partial<CueData> = {}): CueData => ({
  ...defaultCueData,
  currentScene: 'Gameplay',
  ...p,
})

async function fire(channel: string, payload?: unknown): Promise<void> {
  await act(async () => {
    await Promise.all((mockHandlers[channel] || []).map((h) => h(payload)))
  })
}

function renderEnabled(): void {
  const store = createStore()
  store.set(rb3eListenerEnabledAtom, true)
  render(
    <Provider store={store}>
      <CuePreviewRb3e />
    </Provider>,
  )
}

describe('CuePreviewRb3e game-mode display', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockHandlers)) delete mockHandlers[k]
    jest.clearAllMocks()
    jest.mocked(ipcApi.getMotionEnabled).mockResolvedValue(true)
    jest.mocked(ipcApi.getActiveRb3MotionCue).mockResolvedValue(null as never)
    jest
      .mocked(ipcApi.getRb3CueGroups)
      .mockResolvedValue([{ id: 'rb3-stagekit', name: 'StageKit Mirror' }] as never)
    jest
      .mocked(ipcApi.getRb3MotionCueGroups)
      .mockResolvedValue([{ id: 'rb3-motion-default', name: 'RB3 Default motion' }] as never)
    jest
      .mocked(ipcApi.getAvailableRb3MotionCues)
      .mockResolvedValue([{ id: 'rb3-motion-wave', name: 'Wave' }] as never)
  })

  it('shows the active primary group, a live countdown, and the motion labels', async () => {
    renderEnabled()
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    await fire(RENDERER_RECEIVE.RB3_GAME_MODE_CUE_CHANGE, { groupId: 'rb3-stagekit' })
    await fire(RENDERER_RECEIVE.RB3_GAME_MODE_DEADLINE, {
      deadlineMs: Date.now() + 5000,
      pending: false,
    })
    await fire(RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE, {
      ref: { groupId: 'rb3-motion-default', cueId: 'rb3-motion-wave' },
    })

    expect(await screen.findByText('StageKit Mirror')).toBeTruthy()
    expect(await screen.findByText(/Next cue in \d+s/)).toBeTruthy()
    expect(await screen.findByText('RB3 Default motion')).toBeTruthy()
    expect(await screen.findByText('Wave')).toBeTruthy()
  })

  it('shows "Waiting for Light 1…" while a switch is pending', async () => {
    renderEnabled()
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    await fire(RENDERER_RECEIVE.RB3_GAME_MODE_DEADLINE, {
      deadlineMs: Date.now() + 5000,
      pending: true,
    })
    expect(await screen.findByText('Waiting for Light 1…')).toBeTruthy()
  })

  it('hides the motion block when motion is disabled', async () => {
    jest.mocked(ipcApi.getMotionEnabled).mockResolvedValue(false)
    renderEnabled()
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    await act(async () => {}) // let loadMotionLabels resolve
    expect(screen.queryByText('Motion Cue Group:')).toBeNull()
  })
})
