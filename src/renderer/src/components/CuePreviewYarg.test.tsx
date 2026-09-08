/** @jest-environment jsdom */
/**
 * The cue information grid: the venue post-processing it names, and the pill above it that carries
 * tracked and auto-generated state.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { act, render, screen, cleanup } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { lightingPrefsAtom, yargListenerEnabledAtom } from '../atoms'
import type { CueData } from '../../../photonics-dmx/cues/types/cueTypes'
import { DrumNoteType, InstrumentNoteType } from '../../../photonics-dmx/cues/types/cueTypes'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

const listeners = new Map<string, (payload: unknown) => void>()

jest.mock('../utils/ipcHelpers', () => ({
  addIpcListener: (channel: string, handler: (payload: unknown) => void) => {
    listeners.set(channel, handler)
  },
  removeIpcListener: (channel: string) => {
    listeners.delete(channel)
  },
}))

jest.mock('../ipcApi', () => ({
  getActiveYargMotionCue: async () => null,
  getAvailableYargMotionCues: async () => [],
  getMotionEnabled: async () => false,
  getYargMotionCueGroups: async () => [],
  setListenCueData: jest.fn(),
}))

import CuePreviewYarg from './CuePreviewYarg'

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
  const store = createStore()
  store.set(yargListenerEnabledAtom, true)
  if (venuePostProcessingEnabled !== undefined) {
    store.set(lightingPrefsAtom, { venuePostProcessingEnabled })
  }
  render(
    <Provider store={store}>
      <CuePreviewYarg />
    </Provider>,
  )
  await act(async () => {
    listeners.get(RENDERER_RECEIVE.CUE_HANDLED)?.(data)
  })
}

describe('CuePreviewYarg post-processing field', () => {
  beforeEach(() => {
    listeners.clear()
    jest.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the state YARG reports, spelled out', async () => {
    await renderWithCueData(cueData({ postProcessing: 'Scanlines_Blue' }))

    expect(screen.getByText('Post-Processing:')).toBeTruthy()
    expect(screen.getByText('Scanlines Blue')).toBeTruthy()
  })

  it('shows Default when no effect is running', async () => {
    await renderWithCueData(cueData())
    expect(screen.getByText('Default')).toBeTruthy()
  })

  it('no longer carries the Auto-Gen field, which the pill above already reports', async () => {
    await renderWithCueData(cueData({ trackMode: 'autogen' }))

    expect(screen.queryByText('Auto-Gen:')).toBeNull()
    expect(screen.getByText('Auto-Generated')).toBeTruthy()
  })
})

describe('CuePreviewYarg post-processing chip', () => {
  beforeEach(() => {
    listeners.clear()
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
