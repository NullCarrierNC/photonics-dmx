/** @jest-environment jsdom */
/**
 * The RB3E "LED Position Mapping" indicator derives its four colour banks from each cue frame via
 * the pure `nextColorBanks` reducer. Every source now emits a full `ledBanks` snapshot (the direct
 * StageKit processor accumulates its per-packet updates), so the reducer replaces all four banks each
 * frame and never leaves an LED stuck ON.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { act, screen } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { rb3eListenerEnabledAtom, rb3RunningModeAtom } from '../atoms'
import type { Rb3RunningMode } from '../../../shared/ipc/listenerTypes'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import CuePreviewRb3e, { nextColorBanks } from './CuePreviewRb3e'
import { defaultCueData, type CueData } from '../../../photonics-dmx/cues/types/cueTypes'
import { emitIpc, resetIpcListenerStub } from '@renderer/tests/helpers/ipcListenerStub'
import { useListenerEnabledSync } from '../hooks/useListenerEnabledSync'

jest.mock(
  '../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)
jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

type Banks = { red: number[]; green: number[]; blue: number[]; yellow: number[] }
const EMPTY: Banks = { red: [], green: [], blue: [], yellow: [] }

const frame = (partial: Partial<CueData>): CueData => ({ ...defaultCueData, ...partial })

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

  it('clears a bank on the next snapshot', () => {
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

  it('retains the previous banks on a frame that carries no ledBanks', () => {
    // Every emitter now sends a full snapshot, but on the rare absent frame the banks are kept.
    const lit: Banks = { red: [0], green: [], blue: [], yellow: [] }
    const out = nextColorBanks(lit, frame({ ledBanks: undefined }))
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
    emitIpc(channel, payload)
  })
}

/** The preview beside the hook that keeps the listener atoms on main, as WindowShell mounts it. */
function PreviewFollowingMain() {
  useListenerEnabledSync()
  return <CuePreviewRb3e />
}

function renderEnabled(mode: Rb3RunningMode = 'cue') {
  return renderWithProviders(<CuePreviewRb3e />, {
    seed: (set) => {
      set(rb3eListenerEnabledAtom, true)
      set(rb3RunningModeAtom, mode)
    },
  }).store
}

async function setSession(
  store: ReturnType<typeof renderEnabled>,
  enabled: boolean,
  mode: Rb3RunningMode,
): Promise<void> {
  await act(async () => {
    store.set(rb3eListenerEnabledAtom, enabled)
    store.set(rb3RunningModeAtom, mode)
  })
}

describe('CuePreviewRb3e game-mode display', () => {
  beforeEach(() => {
    resetIpcListenerStub()
    resetIpcApiMock()
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

    expect(await screen.findByText('StageKit Mirror')).toBeInTheDocument()
    expect(await screen.findByText(/Next cue in \d+s/)).toBeInTheDocument()
    expect(await screen.findByText('RB3 Default motion')).toBeInTheDocument()
    expect(await screen.findByText('Wave')).toBeInTheDocument()
  })

  it('shows "Waiting for Light 1…" while a switch is pending', async () => {
    renderEnabled()
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    await fire(RENDERER_RECEIVE.RB3_GAME_MODE_DEADLINE, {
      deadlineMs: Date.now() + 5000,
      pending: true,
    })
    expect(await screen.findByText('Waiting for Light 1…')).toBeInTheDocument()
  })

  it('hides the motion block when motion is disabled', async () => {
    jest.mocked(ipcApi.getMotionEnabled).mockResolvedValue(false)
    renderEnabled()
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    await act(async () => {}) // let loadMotionLabels resolve
    expect(screen.queryByText('Motion Cue Group:')).toBeNull()
  })

  it('hides the motion block when the motion setting cannot be read', async () => {
    jest.mocked(ipcApi.getMotionEnabled).mockRejectedValue(new Error('offline'))
    renderEnabled()
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    await act(async () => {})
    expect(screen.queryByText('Motion Cue Group:')).toBeNull()
  })

  it('hides the motion block until the motion setting is read', async () => {
    jest.mocked(ipcApi.getMotionEnabled).mockReturnValue(new Promise(() => {}))
    renderEnabled()
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    expect(screen.queryByText('Motion Cue Group:')).toBeNull()
  })

  it('reads DIRECT MODE for the primary cue in direct mode, with no motion rows', async () => {
    renderEnabled('direct')
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())

    expect(await screen.findByText('DIRECT MODE')).toBeInTheDocument()
    expect(screen.queryByText('Motion Cue Group:')).toBeNull()
  })

  it('shows the primary group again once the session comes back in cue mode', async () => {
    const store = renderEnabled('direct')
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    expect(await screen.findByText('DIRECT MODE')).toBeInTheDocument()

    await setSession(store, false, 'none')
    await setSession(store, true, 'cue')
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    await fire(RENDERER_RECEIVE.RB3_GAME_MODE_CUE_CHANGE, { groupId: 'rb3-stagekit' })

    expect(await screen.findByText('StageKit Mirror')).toBeInTheDocument()
    expect(screen.queryByText('DIRECT MODE')).toBeNull()
  })

  it('follows a mode switch whose stop and start reach one render', async () => {
    jest.mocked(ipcApi.getRb3Mode).mockResolvedValue('direct')
    jest.mocked(ipcApi.getSystemStatus).mockResolvedValue({
      success: true,
      isYargEnabled: false,
      isRb3Enabled: true,
      rb3Mode: 'direct',
    } as never)
    renderWithProviders(<PreviewFollowingMain />)
    await act(async () => {}) // let the status read land
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    expect(await screen.findByText('DIRECT MODE')).toBeInTheDocument()

    jest.mocked(ipcApi.getRb3Mode).mockResolvedValue('cue')
    await act(async () => {
      emitIpc(RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED, {
        listener: 'rb3',
        enabled: false,
        mode: 'none',
      })
      emitIpc(RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED, {
        listener: 'rb3',
        enabled: true,
        mode: 'cue',
      })
    })
    await fire(RENDERER_RECEIVE.CUE_HANDLED, gameplayFrame())
    await fire(RENDERER_RECEIVE.RB3_GAME_MODE_CUE_CHANGE, { groupId: 'rb3-stagekit' })

    expect(await screen.findByText('StageKit Mirror')).toBeInTheDocument()
    expect(screen.queryByText('DIRECT MODE')).toBeNull()
  })
})
