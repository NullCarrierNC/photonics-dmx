/** @jest-environment jsdom */
/**
 * The cue information grid: the venue post-processing it names, and the pill above it that carries
 * tracked and auto-generated state.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { act, screen, cleanup } from '@testing-library/react'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../ipcApi'
import { currentCueStateAtom, lightingPrefsAtom, yargListenerEnabledAtom } from '../atoms'
import type { CueData } from '../../../photonics-dmx/cues/types/cueTypes'
import { DrumNoteType, InstrumentNoteType } from '../../../photonics-dmx/cues/types/cueTypes'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

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

/** Every case runs with motion switched off, whatever order the suite runs in. */
beforeEach(() => {
  resetIpcApiMock()
  jest.mocked(ipcApi.getActiveYargMotionCue).mockResolvedValue(null)
  jest.mocked(ipcApi.getAvailableYargMotionCues).mockResolvedValue([])
  jest.mocked(ipcApi.getMotionEnabled).mockResolvedValue(false)
  jest.mocked(ipcApi.getYargMotionCueGroups).mockResolvedValue([])
})

import CuePreviewYarg from './CuePreviewYarg'
import { emitIpc, resetIpcListenerStub } from '@renderer/tests/helpers/ipcListenerStub'

function cueData(overrides: Partial<CueData> = {}): CueData {
  return {
    datagramVersion: 5,
    platform: 'Windows',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize: 'Large',
    beatsPerMinute: 120,
    songSection: 'Verse',
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: 'None',
    postProcessing: 'Default',
    fogState: false,
    strobeState: 'Strobe_Off',
    performer: 0,
    trackMode: 'tracked',
    beat: 'Off',
    keyframe: 'Off',
    bonusEffect: false,
    ...overrides,
  } as CueData
}

async function renderWithCueData(
  data: CueData,
  venuePostProcessingEnabled?: boolean,
): Promise<void> {
  renderWithProviders(<CuePreviewYarg />, {
    seed: (set) => {
      set(yargListenerEnabledAtom, true)
      if (venuePostProcessingEnabled !== undefined) {
        set(lightingPrefsAtom, { venuePostProcessingEnabled })
      }
    },
  })
  await act(async () => {
    emitIpc(RENDERER_RECEIVE.CUE_HANDLED, data)
  })
}

describe('CuePreviewYarg post-processing field', () => {
  beforeEach(() => {
    resetIpcListenerStub()
    jest.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the state YARG reports, spelled out', async () => {
    await renderWithCueData(cueData({ postProcessing: 'Scanlines_Blue' }))

    expect(screen.getByText('Post-Processing:')).toBeInTheDocument()
    expect(screen.getByText('Scanlines Blue')).toBeInTheDocument()
  })

  it('shows Default when no effect is running', async () => {
    await renderWithCueData(cueData())
    expect(screen.getByText('Default')).toBeInTheDocument()
  })

  it('no longer carries the Auto-Gen field, which the pill above already reports', async () => {
    await renderWithCueData(cueData({ trackMode: 'autogen' }))

    expect(screen.queryByText('Auto-Gen:')).toBeNull()
    expect(screen.getByText('Auto-Generated')).toBeInTheDocument()
  })
})

describe('CuePreviewYarg post-processing chip', () => {
  beforeEach(() => {
    resetIpcListenerStub()
    jest.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('goes green while a look alters the rig', async () => {
    await renderWithCueData(cueData({ postProcessing: 'SepiaTone' }), true)

    const chip = screen.getByText('Sepia Tone').parentElement
    expect(chip?.className).toContain('bg-emerald-200')
  })

  it('stays on the light background with no look running', async () => {
    await renderWithCueData(cueData({ postProcessing: 'Default' }), true)

    const chip = screen.getByText('Default').parentElement
    expect(chip?.className).toContain('bg-gray-100')
    expect(chip?.className).not.toContain('bg-emerald-200')
  })

  it('stays light for a look with no lighting analogue, while still naming it', async () => {
    await renderWithCueData(cueData({ postProcessing: 'Mirror' }), true)

    const chip = screen.getByText('Mirror').parentElement
    expect(chip?.className).toContain('bg-gray-100')
  })

  it('drops the chip when the lights ignore post-processing', async () => {
    await renderWithCueData(cueData({ postProcessing: 'SepiaTone' }), false)

    const value = screen.getByText('Sepia Tone')
    expect(value.parentElement?.className).not.toContain('rounded')
    expect(value.parentElement?.className).not.toContain('bg-emerald-200')
  })
})

/** The pips under one instrument heading, in render order. */
function pipsUnder(instrument: string): HTMLElement[] {
  const heading = screen.getByText(instrument)
  const container = heading.parentElement
  if (!container) throw new Error(`no container for ${instrument}`)
  return Array.from(container.querySelectorAll<HTMLElement>('div.w-6'))
}

/** A pip is lit when it carries the white note text rather than the dimmed background. */
const litUnder = (instrument: string): string[] =>
  pipsUnder(instrument)
    .filter((pip) => pip.className.includes('text-white'))
    .map((pip) => pip.textContent ?? '')

describe('CuePreviewYarg instrument notes', () => {
  // The pips clear 100 ms after the last note, so a real clock lets a slow run clear them first.
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it.each([
    ['Guitar', 'guitarNotes'],
    ['Bass', 'bassNotes'],
    ['Keys', 'keysNotes'],
  ] as const)('lights the %s frets the cue reports', async (instrument, field) => {
    await renderWithCueData(
      cueData({ [field]: [InstrumentNoteType.Red, InstrumentNoteType.Blue] } as Partial<CueData>),
    )

    expect(litUnder(instrument)).toEqual(['R', 'B'])
  })

  it('offers all five frets whether lit or not', async () => {
    await renderWithCueData(cueData({ guitarNotes: [InstrumentNoteType.Green] }))

    expect(pipsUnder('Guitar').map((pip) => pip.textContent)).toEqual(['G', 'R', 'Y', 'B', 'O'])
  })

  it('lights nothing when no notes are reported', async () => {
    await renderWithCueData(cueData())

    expect(litUnder('Guitar')).toEqual([])
    expect(litUnder('Bass')).toEqual([])
    expect(litUnder('Keys')).toEqual([])
  })

  it('keeps one instrument dark while another plays', async () => {
    await renderWithCueData(cueData({ guitarNotes: [InstrumentNoteType.Green] }))

    expect(litUnder('Guitar')).toEqual(['G'])
    expect(litUnder('Bass')).toEqual([])
  })
})

describe('CuePreviewYarg drum notes', () => {
  // The pips clear 100 ms after the last note, so a real clock lets a slow run clear them first.
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows the pads and the cymbals with the kick', async () => {
    await renderWithCueData(cueData())

    expect(pipsUnder('Drums').map((pip) => pip.textContent)).toEqual([
      'G',
      'R',
      'Y',
      'B',
      'GC',
      'YC',
      'BC',
      'KD',
    ])
  })

  it('lights a pad without lighting its cymbal', async () => {
    await renderWithCueData(cueData({ drumNotes: [DrumNoteType.YellowDrum] }))

    expect(litUnder('Drums')).toEqual(['Y'])
  })

  it('lights a cymbal without lighting its pad', async () => {
    await renderWithCueData(cueData({ drumNotes: [DrumNoteType.YellowCymbal] }))

    expect(litUnder('Drums')).toEqual(['YC'])
  })

  it('lights the kick', async () => {
    await renderWithCueData(cueData({ drumNotes: [DrumNoteType.Kick] }))

    expect(litUnder('Drums')).toEqual(['KD'])
  })
})

describe('CuePreviewYarg primary cue row', () => {
  beforeEach(() => {
    resetIpcListenerStub()
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    jest.useRealTimers()
  })

  it('clears the cue name once and leaves it clear while the state still holds it', () => {
    const { store } = renderWithProviders(<CuePreviewYarg />, {
      seed: (set) => set(yargListenerEnabledAtom, true),
    })

    // The grid only renders once a cue frame has arrived.
    act(() => {
      emitIpc(RENDERER_RECEIVE.CUE_HANDLED, cueData())
    })
    act(() => {
      store.set(currentCueStateAtom, {
        cueType: 'Chorus',
        groupId: null,
        groupName: null,
        isFallback: false,
        cueStyle: 'primary',
        counter: 0,
        limit: 0,
      })
    })
    expect(screen.queryByText('Chorus')).toBeInTheDocument()

    // The clear timer fires. The atom still holds the cue, so a row that re-read its own state
    // here would set the name straight back and keep flipping.
    act(() => {
      jest.advanceTimersByTime(400)
    })
    expect(screen.queryByText('Chorus')).toBeNull()

    act(() => {
      jest.advanceTimersByTime(2000)
    })
    expect(screen.queryByText('Chorus')).toBeNull()
  })
})

describe('CuePreviewYarg beat indicator', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('stays lit while beats keep arriving faster than the clear', async () => {
    // Each beat schedules its own clear and cancels the one before it, so a stream arriving
    // inside the window holds the indicator lit rather than blinking it.
    renderWithProviders(<CuePreviewYarg />, {
      seed: (set) => set(yargListenerEnabledAtom, true),
    })
    const send = (beat: CueData['beat']): void => {
      emitIpc(RENDERER_RECEIVE.CUE_HANDLED, cueData({ beat }))
    }

    await act(async () => {
      send('Strong')
    })
    // Beats 100ms apart, which is inside the 200ms clear the first one armed.
    for (const beat of ['Weak', 'Strong', 'Weak'] as const) {
      await act(async () => {
        jest.advanceTimersByTime(100)
        send(beat)
      })
    }
    await act(async () => {
      jest.advanceTimersByTime(100)
    })

    // Still showing the beat rather than having been blanked by an older beat's clear.
    expect(screen.queryByText('Waiting for beat...')).toBeNull()
  })
})

/** The panel, plus a way to hand it one cue frame. */
function renderPanelWithSender(): (data: CueData) => Promise<void> {
  renderWithProviders(<CuePreviewYarg />, {
    seed: (set) => set(yargListenerEnabledAtom, true),
  })
  return async (data: CueData) => {
    await act(async () => {
      emitIpc(RENDERER_RECEIVE.CUE_HANDLED, data)
    })
  }
}

describe('CuePreviewYarg indicators against a note stream', () => {
  beforeEach(() => {
    resetIpcListenerStub()
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    jest.useRealTimers()
  })

  it('clears the beat once the beats stop, while notes keep arriving', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ beat: 'Strong' }))

    // A played note carries no beat of its own, so the beat it follows still has to expire.
    await act(async () => {
      jest.advanceTimersByTime(100)
    })
    await send(cueData({ guitarNotes: [InstrumentNoteType.Green] }))
    await act(async () => {
      jest.advanceTimersByTime(300)
    })

    expect(screen.getByText('Waiting for beat...')).toBeInTheDocument()
  })

  it('clears the measure once the measures stop, while notes keep arriving', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ beat: 'Measure' }))

    await act(async () => {
      jest.advanceTimersByTime(100)
    })
    await send(cueData({ guitarNotes: [InstrumentNoteType.Red] }))
    await act(async () => {
      jest.advanceTimersByTime(400)
    })

    expect(screen.getByText('Waiting for measure...')).toBeInTheDocument()
  })

  it('clears the keyframe once the keyframes stop, while notes keep arriving', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ keyframe: 'Next' }))

    await act(async () => {
      jest.advanceTimersByTime(100)
    })
    await send(cueData({ guitarNotes: [InstrumentNoteType.Blue] }))
    await act(async () => {
      jest.advanceTimersByTime(400)
    })

    expect(screen.queryByText('Next')).toBeNull()
  })
})

describe('CuePreviewYarg when the cue data stops', () => {
  beforeEach(() => {
    resetIpcListenerStub()
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    jest.useRealTimers()
  })

  const yargError = async (payload: { type: string; autoDisabled?: boolean }): Promise<void> => {
    await act(async () => {
      emitIpc(RENDERER_RECEIVE.YARG_ERROR, { message: '', ...payload })
    })
  }

  it('holds the details through a long quiet stretch in a song', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ postProcessing: 'Scanlines_Blue' }))

    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000)
    })

    expect(screen.getByText('Scanlines Blue')).toBeInTheDocument()
  })

  it('holds the details while the song is paused', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ pauseState: 'Paused', postProcessing: 'Scanlines_Blue' }))

    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000)
    })

    expect(screen.getByText('Scanlines Blue')).toBeInTheDocument()
  })

  it('goes back to waiting a minute after the last frame outside a song', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ currentScene: 'Score', postProcessing: 'Scanlines_Blue' }))

    await act(async () => {
      jest.advanceTimersByTime(59_000)
    })
    expect(screen.getByText('Scanlines Blue')).toBeInTheDocument()

    await act(async () => {
      jest.advanceTimersByTime(2000)
    })
    expect(screen.getByText('No active YARG cue')).toBeInTheDocument()
  })

  it('goes back to waiting as soon as YARG shuts down', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ postProcessing: 'Scanlines_Blue' }))

    await yargError({ type: 'yarg-shutdown' })

    expect(screen.getByText('No active YARG cue')).toBeInTheDocument()
  })

  it('goes back to waiting when the listener stops on an error', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ postProcessing: 'Scanlines_Blue' }))

    await yargError({ type: 'runtime-error', autoDisabled: true })

    expect(screen.getByText('No active YARG cue')).toBeInTheDocument()
  })

  it('keeps the details through a warning', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ postProcessing: 'Scanlines_Blue' }))

    await yargError({ type: 'datagram-version-newer' })

    expect(screen.getByText('Scanlines Blue')).toBeInTheDocument()
  })

  it('holds the details while frames keep arriving', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ postProcessing: 'Scanlines_Blue' }))

    for (let frame = 0; frame < 3; frame += 1) {
      await act(async () => {
        jest.advanceTimersByTime(4000)
      })
      await send(cueData({ postProcessing: 'Scanlines_Blue' }))
    }

    expect(screen.getByText('Scanlines Blue')).toBeInTheDocument()
  })

  it('shows a beat the next song opens on, after YARG restarts', async () => {
    const send = renderPanelWithSender()
    await send(cueData({ beat: 'Strong' }))

    await yargError({ type: 'yarg-shutdown' })
    await act(async () => {
      jest.advanceTimersByTime(300)
    })
    await send(cueData({ beat: 'Strong' }))

    expect(screen.getByText('Strong')).toBeInTheDocument()
  })
})
