/** @jest-environment jsdom */
/**
 * Behaviour of the audio cue selector: what it loads on mount, which cue and group it settles on,
 * what it saves, and how it reacts to the audio events the main process pushes.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { DEFAULT_AUDIO_GAME_MODE } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

type LoadedCueState = Extract<
  Awaited<ReturnType<typeof ipcApi.getAudioReactiveCues>>,
  { success: true }
>
type Cue = LoadedCueState['cues'][number]

jest.mock(
  '../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const api = jest.mocked(ipcApi)
jest.mock('../utils/ipcHelpers', () => ({
  addIpcListener: jest.fn(),
  removeIpcListener: jest.fn(),
}))

import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import AudioCueSelectorPanel from './AudioCueSelectorPanel'

type Listener = (payload: unknown) => void
const added = addIpcListener as unknown as jest.Mock<(c: string, f: Listener) => void>
const removed = removeIpcListener as unknown as jest.Mock<(c: string, f: Listener) => void>

/** The handlers registered for one channel, newest last. */
const handlersFor = (channel: string): Listener[] =>
  added.mock.calls.filter((call) => call[0] === channel).map((call) => call[1])

/** Delivers one main-process event to every handler listening on its channel. */
async function emit(channel: string, payload: unknown): Promise<void> {
  await act(async () => {
    for (const handler of handlersFor(channel)) {
      await handler(payload)
    }
  })
}

function cue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'pulse',
    label: 'Pulse',
    description: 'A pulse',
    groupId: 'core',
    groupName: 'Core',
    groupDescription: '',
    ...overrides,
  }
}

/** The cue state main reports, with nothing active unless a case names a cue. */
function cueState(state: Partial<LoadedCueState> = {}): LoadedCueState {
  return { success: true, activeCueType: '', secondaryCueType: null, cues: [], ...state }
}

/** Game mode as main reports it, switched on or off. */
const gameModeConfig = (enabled: boolean) => ({ ...DEFAULT_AUDIO_GAME_MODE, enabled })

const selects = () => screen.getAllByRole('combobox') as HTMLSelectElement[]
const audioGroupSelect = () => selects()[0]
const audioCueSelect = () => selects()[1]

const totalIpcCalls = (): number =>
  Object.values(api).reduce((sum, fn) => sum + fn.mock.calls.length, 0)

/**
 * Renders and settles the mount load, which reads a different number of channels depending on
 * whether audio and motion are on, so it flushes until no new call arrives.
 */
async function renderPanel(): Promise<void> {
  renderWithProviders(<AudioCueSelectorPanel />)
  let previous = -1
  for (let guard = 0; guard < 10 && totalIpcCalls() !== previous; guard += 1) {
    previous = totalIpcCalls()
    await act(async () => {})
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  resetIpcApiMock()
  jest.useRealTimers()
  api.getAudioEnabled.mockResolvedValue(true)
  api.getMotionEnabled.mockResolvedValue(true)
  api.getAudioGameMode.mockResolvedValue(gameModeConfig(false))
  api.getAudioMotionCueGroups.mockResolvedValue([])
  api.getActiveAudioMotionCue.mockResolvedValue(null)
  api.getAvailableAudioMotionCues.mockResolvedValue([])
  api.getAudioReactiveCues.mockResolvedValue(cueState({ cues: [] }))
  api.setActiveAudioCue.mockResolvedValue({ success: true })
  api.setActiveAudioMotionCue.mockResolvedValue({ success: true })
})

afterEach(() => cleanup())

describe('AudioCueSelectorPanel load', () => {
  it('points at Preferences when audio is off', async () => {
    api.getAudioEnabled.mockResolvedValue(false)
    await renderPanel()

    expect(screen.getByText(/Enable Audio Reactive mode in Preferences/)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('says so when audio is on but no group offers a cue', async () => {
    await renderPanel()

    expect(
      screen.getByText('No audio cues are available in the enabled groups.'),
    ).toBeInTheDocument()
  })

  it('shows the pickers once cues arrive', async () => {
    api.getAudioReactiveCues.mockResolvedValue(cueState({ cues: [cue()] }))
    await renderPanel()

    expect(selects().length).toBeGreaterThanOrEqual(2)
  })

  it('reports the error the cue state carries', async () => {
    api.getAudioReactiveCues.mockResolvedValue({
      success: false,
      error: 'registry offline',
      activeCueType: null,
      secondaryCueType: null,
      cues: [],
    })
    await renderPanel()

    expect(screen.getByText('registry offline')).toBeInTheDocument()
  })

  it('reports a generic failure when the load throws', async () => {
    api.getAudioReactiveCues.mockRejectedValue(new Error('boom'))
    await renderPanel()

    expect(screen.getByText('Failed to load audio cue state')).toBeInTheDocument()
  })

  it('treats motion as on when the motion-enabled read fails', async () => {
    api.getMotionEnabled.mockRejectedValue(new Error('no'))
    api.getAudioReactiveCues.mockResolvedValue(cueState({ cues: [cue()] }))
    api.getAudioMotionCueGroups.mockResolvedValue([{ id: 'g1', name: 'Sweeps', cueCount: 2 }])
    await renderPanel()

    expect(screen.getByText('Motion Cue')).toBeInTheDocument()
  })

  it('treats game mode as off when the game-mode read fails', async () => {
    api.getAudioGameMode.mockRejectedValue(new Error('no'))
    api.getAudioReactiveCues.mockResolvedValue(cueState({ cues: [cue()] }))
    await renderPanel()

    // Game mode swaps the summary over to primary/secondary/strobe.
    expect(screen.queryByText('Primary cue')).toBeNull()
    expect(screen.getByText('Lighting Cue Group')).toBeInTheDocument()
  })
})

describe('AudioCueSelectorPanel cue list', () => {
  const spread = [
    cue({ id: 'z', label: 'Zeta', groupId: 'b', groupName: 'Beta' }),
    cue({ id: 'a', label: 'Alpha', groupId: 'b', groupName: 'Beta' }),
    cue({ id: 'm', label: 'Mu', groupId: 'a', groupName: 'Alpha' }),
  ]

  it('orders by group name, then by label', async () => {
    api.getAudioReactiveCues.mockResolvedValue(cueState({ cues: spread }))
    await renderPanel()

    // The first cue of the first group wins the initial selection.
    expect(audioGroupSelect().value).toBe('a')
    expect(audioCueSelect().value).toBe('m')
  })

  it('settles on the cue the backend reports active', async () => {
    api.getAudioReactiveCues.mockResolvedValue(
      cueState({
        cues: spread,
        activeCueType: 'z',
      }),
    )
    await renderPanel()

    expect(audioCueSelect().value).toBe('z')
    expect(audioGroupSelect().value).toBe('b')
  })
})

describe('AudioCueSelectorPanel selection', () => {
  const two = [
    cue({ id: 'one', label: 'One', groupId: 'g', groupName: 'G' }),
    cue({ id: 'two', label: 'Two', groupId: 'g', groupName: 'G' }),
  ]

  it('saves a cue the user picks', async () => {
    api.getAudioReactiveCues.mockResolvedValue(cueState({ cues: two, activeCueType: 'one' }))
    await renderPanel()

    fireEvent.change(audioCueSelect(), { target: { value: 'two' } })

    await waitFor(() => expect(api.setActiveAudioCue).toHaveBeenCalledWith('two'))
  })

  it('does not save the cue that is already active', async () => {
    api.getAudioReactiveCues.mockResolvedValue(cueState({ cues: two, activeCueType: 'one' }))
    await renderPanel()

    fireEvent.change(audioCueSelect(), { target: { value: 'one' } })

    await act(async () => {})
    expect(api.setActiveAudioCue).not.toHaveBeenCalled()
  })

  it('reports a refused save', async () => {
    api.getAudioReactiveCues.mockResolvedValue(cueState({ cues: two, activeCueType: 'one' }))
    api.setActiveAudioCue.mockResolvedValue({ success: false, error: 'cue is gone' })
    await renderPanel()

    fireEvent.change(audioCueSelect(), { target: { value: 'two' } })

    await waitFor(() => expect(screen.getByText('cue is gone')).toBeInTheDocument())
  })

  it('saves the first cue of a group the user switches to', async () => {
    const across = [
      cue({ id: 'a1', label: 'A1', groupId: 'a', groupName: 'A' }),
      cue({ id: 'b1', label: 'B1', groupId: 'b', groupName: 'B' }),
      cue({ id: 'b2', label: 'B2', groupId: 'b', groupName: 'B' }),
    ]
    api.getAudioReactiveCues.mockResolvedValue(cueState({ cues: across, activeCueType: 'a1' }))
    await renderPanel()

    fireEvent.change(audioGroupSelect(), { target: { value: 'b' } })

    await waitFor(() => expect(api.setActiveAudioCue).toHaveBeenCalledWith('b1'))
  })
})

describe('AudioCueSelectorPanel motion picker', () => {
  const withMotion = async (motionOn = true): Promise<void> => {
    api.getMotionEnabled.mockResolvedValue(motionOn)
    api.getAudioReactiveCues.mockResolvedValue(cueState({ cues: [cue()] }))
    api.getAudioMotionCueGroups.mockResolvedValue([
      { id: 'g1', name: 'Sweeps', cueCount: 2 },
      { id: 'g2', name: 'Spins', cueCount: 1 },
    ])
    api.getAvailableAudioMotionCues.mockResolvedValue([
      { id: 'c1', name: 'Sweep One', description: '' },
      { id: 'c2', name: 'Sweep Two', description: '' },
    ])
    await renderPanel()
  }

  it('saves the first cue of a motion group the user picks', async () => {
    await withMotion()

    fireEvent.change(selects()[2], { target: { value: 'g1' } })

    await waitFor(() =>
      expect(api.setActiveAudioMotionCue).toHaveBeenCalledWith({ groupId: 'g1', cueId: 'c1' }),
    )
  })

  it('clears the motion selection when the group goes back to auto', async () => {
    api.getActiveAudioMotionCue.mockResolvedValue({ groupId: 'g1', cueId: 'c1' })
    await withMotion()

    fireEvent.change(selects()[2], { target: { value: '' } })

    await waitFor(() => expect(api.setActiveAudioMotionCue).toHaveBeenCalledWith(null))
  })

  it('saves a motion cue picked inside the group', async () => {
    api.getActiveAudioMotionCue.mockResolvedValue({ groupId: 'g1', cueId: 'c1' })
    await withMotion()

    fireEvent.change(selects()[3], { target: { value: 'c2' } })

    await waitFor(() =>
      expect(api.setActiveAudioMotionCue).toHaveBeenCalledWith({ groupId: 'g1', cueId: 'c2' }),
    )
  })

  it('offers no motion picker while motion is globally off', async () => {
    await withMotion(false)

    expect(screen.queryByText('Motion Cue')).toBeNull()
  })
})

describe('AudioCueSelectorPanel main process events', () => {
  it('reloads when audio configuration changes', async () => {
    await renderPanel()
    const before = api.getAudioReactiveCues.mock.calls.length

    await emit(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, undefined)

    expect(api.getAudioReactiveCues.mock.calls.length).toBeGreaterThan(before)
  })

  it('follows a game mode cue change without reloading', async () => {
    api.getAudioGameMode.mockResolvedValue(gameModeConfig(true))
    api.getAudioReactiveCues.mockResolvedValue(
      cueState({
        cues: [cue({ id: 'one', label: 'One' }), cue({ id: 'two', label: 'Two' })],
        activeCueType: 'one',
      }),
    )
    await renderPanel()
    const before = api.getAudioReactiveCues.mock.calls.length

    await emit(RENDERER_RECEIVE.AUDIO_GAME_MODE_CUE_CHANGE, { activeCueType: 'two' })

    expect(screen.getByText('Two')).toBeInTheDocument()
    expect(api.getAudioReactiveCues.mock.calls.length).toBe(before)
  })

  it('drops every listener it added on unmount', async () => {
    await renderPanel()
    const addedChannels = added.mock.calls.map((call) => call[0]).sort()

    cleanup()

    expect(removed.mock.calls.map((call) => call[0]).sort()).toEqual(addedChannels)
  })
})

describe('AudioCueSelectorPanel strobe indicator', () => {
  const gameMode = async (): Promise<void> => {
    api.getAudioGameMode.mockResolvedValue(gameModeConfig(true))
    api.getAudioReactiveCues.mockResolvedValue(
      cueState({
        cues: [cue({ id: 'strobe', label: 'Strobe Fast' })],
        activeCueType: 'strobe',
      }),
    )
    await renderPanel()
  }

  const strobeReadout = (): string =>
    screen.getByText('Strobe').parentElement?.querySelectorAll('p')[1]?.textContent ?? ''

  it('names the firing cue as soon as it goes active', async () => {
    await gameMode()

    await emit(RENDERER_RECEIVE.AUDIO_STROBE_STATE, { active: true, strobeCueType: 'strobe' })

    expect(strobeReadout()).toBe('Strobe Fast')
  })

  it('holds the readout after the strobe goes inactive', async () => {
    jest.useFakeTimers()
    await gameMode()
    await emit(RENDERER_RECEIVE.AUDIO_STROBE_STATE, { active: true, strobeCueType: 'strobe' })

    await emit(RENDERER_RECEIVE.AUDIO_STROBE_STATE, { active: false, strobeCueType: 'strobe' })
    expect(strobeReadout()).toBe('Strobe Fast')

    act(() => {
      jest.advanceTimersByTime(200)
    })
    expect(strobeReadout()).toBe('Inactive')
  })

  it('stays lit when the strobe fires again inside the hold', async () => {
    jest.useFakeTimers()
    await gameMode()
    await emit(RENDERER_RECEIVE.AUDIO_STROBE_STATE, { active: true, strobeCueType: 'strobe' })
    await emit(RENDERER_RECEIVE.AUDIO_STROBE_STATE, { active: false, strobeCueType: 'strobe' })

    act(() => {
      jest.advanceTimersByTime(150)
    })
    await emit(RENDERER_RECEIVE.AUDIO_STROBE_STATE, { active: true, strobeCueType: 'strobe' })
    act(() => {
      jest.advanceTimersByTime(500)
    })

    expect(strobeReadout()).toBe('Strobe Fast')
  })
})
