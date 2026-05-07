import type { AudioBandDefinition } from './AudioTypes'
import { AUDIO_BAND_GAIN_MAX, AUDIO_BAND_GAIN_MIN } from './AudioTypes'

/** Canonical 8-band ids and display names (same for every preset; Hz ranges and gains vary per preset). */
export const BAND_IDS = [
  'sub',
  'kick',
  'bass',
  'low-mid',
  'mid',
  'presence',
  'high',
  'air',
] as const

export const BAND_NAMES = [
  'Sub',
  'Kick',
  'Bass',
  'Low Mid',
  'Mid',
  'Presence',
  'High',
  'Air',
] as const

type HzRange = { minHz: number; maxHz: number }

function bandsFromRangesAndGains(
  ranges: readonly HzRange[],
  gains: readonly number[],
): AudioBandDefinition[] {
  if (ranges.length !== 8) {
    throw new Error('Expected exactly 8 frequency ranges')
  }
  if (gains.length !== 8) {
    throw new Error('Expected exactly 8 band gains')
  }
  return ranges.map((r, i) => {
    const gain = gains[i]!
    if (gain < AUDIO_BAND_GAIN_MIN || gain > AUDIO_BAND_GAIN_MAX) {
      throw new Error(
        `Band gain ${gain} out of range [${AUDIO_BAND_GAIN_MIN}, ${AUDIO_BAND_GAIN_MAX}] at index ${i}`,
      )
    }
    return {
      id: BAND_IDS[i]!,
      name: BAND_NAMES[i]!,
      minHz: r.minHz,
      maxHz: r.maxHz,
      gain,
    }
  })
}

export const RHYTHM_GAME_DEFAULT_GAINS = [1, 0.7, 0.9, 2.8, 4.6, 4.8, 5.4, 7] as const

/** Shipped default: Rock Band / Guitar Hero style instrument lanes. */
export const RHYTHM_GAME_BANDS: AudioBandDefinition[] = bandsFromRangesAndGains(
  [
    { minHz: 20, maxHz: 50 },
    { minHz: 50, maxHz: 130 },
    { minHz: 130, maxHz: 250 },
    { minHz: 250, maxHz: 1000 },
    { minHz: 1000, maxHz: 2500 },
    { minHz: 2500, maxHz: 5000 },
    { minHz: 5000, maxHz: 10000 },
    { minHz: 10000, maxHz: 20000 },
  ],
  RHYTHM_GAME_DEFAULT_GAINS,
)

/** Tuned default per-band gain multipliers for each non–Rhythm Game preset. */
export const GENERAL_DEFAULT_GAINS = [1.1, 1.0, 1.1, 1.6, 2.2, 2.4, 2.2, 2.0] as const
export const ROCK_DEFAULT_GAINS = [1.0, 0.85, 1.1, 2.5, 4.0, 4.5, 5.2, 6.8] as const
export const ELECTRONIC_DEFAULT_GAINS = [1.2, 1.0, 1.2, 2.0, 3.8, 4.8, 6.0, 7.5] as const
export const ACOUSTIC_DEFAULT_GAINS = [0.9, 0.95, 1.0, 1.7, 3.0, 3.2, 3.5, 3.2] as const
export const DJ_DEFAULT_GAINS = [1.3, 1.2, 1.3, 2.2, 3.2, 4.2, 5.8, 8.0] as const
export const VOCAL_FOCUS_DEFAULT_GAINS = [0.55, 0.65, 0.75, 1.4, 3.2, 3.8, 2.8, 2.2] as const

const GENERAL_BANDS: AudioBandDefinition[] = bandsFromRangesAndGains(
  [
    { minHz: 20, maxHz: 60 },
    { minHz: 60, maxHz: 150 },
    { minHz: 150, maxHz: 400 },
    { minHz: 400, maxHz: 1000 },
    { minHz: 1000, maxHz: 2500 },
    { minHz: 2500, maxHz: 5000 },
    { minHz: 5000, maxHz: 10000 },
    { minHz: 10000, maxHz: 20000 },
  ],
  GENERAL_DEFAULT_GAINS,
)

const ROCK_BANDS: AudioBandDefinition[] = bandsFromRangesAndGains(
  [
    { minHz: 20, maxHz: 50 },
    { minHz: 50, maxHz: 120 },
    { minHz: 120, maxHz: 350 },
    { minHz: 350, maxHz: 900 },
    { minHz: 900, maxHz: 2500 },
    { minHz: 2500, maxHz: 5500 },
    { minHz: 5500, maxHz: 11000 },
    { minHz: 11000, maxHz: 20000 },
  ],
  ROCK_DEFAULT_GAINS,
)

const ELECTRONIC_BANDS: AudioBandDefinition[] = bandsFromRangesAndGains(
  [
    { minHz: 20, maxHz: 55 },
    { minHz: 55, maxHz: 130 },
    { minHz: 130, maxHz: 300 },
    { minHz: 300, maxHz: 800 },
    { minHz: 800, maxHz: 2200 },
    { minHz: 2200, maxHz: 5000 },
    { minHz: 5000, maxHz: 10000 },
    { minHz: 10000, maxHz: 20000 },
  ],
  ELECTRONIC_DEFAULT_GAINS,
)

const ACOUSTIC_BANDS: AudioBandDefinition[] = bandsFromRangesAndGains(
  [
    { minHz: 20, maxHz: 65 },
    { minHz: 65, maxHz: 160 },
    { minHz: 160, maxHz: 400 },
    { minHz: 400, maxHz: 1000 },
    { minHz: 1000, maxHz: 3000 },
    { minHz: 3000, maxHz: 7000 },
    { minHz: 7000, maxHz: 13000 },
    { minHz: 13000, maxHz: 20000 },
  ],
  ACOUSTIC_DEFAULT_GAINS,
)

const DJ_BANDS: AudioBandDefinition[] = bandsFromRangesAndGains(
  [
    { minHz: 20, maxHz: 50 },
    { minHz: 50, maxHz: 130 },
    { minHz: 130, maxHz: 300 },
    { minHz: 300, maxHz: 900 },
    { minHz: 900, maxHz: 2000 },
    { minHz: 2000, maxHz: 5000 },
    { minHz: 5000, maxHz: 11000 },
    { minHz: 11000, maxHz: 20000 },
  ],
  DJ_DEFAULT_GAINS,
)

const VOCAL_FOCUS_BANDS: AudioBandDefinition[] = bandsFromRangesAndGains(
  [
    { minHz: 20, maxHz: 80 },
    { minHz: 80, maxHz: 180 },
    { minHz: 180, maxHz: 400 },
    { minHz: 400, maxHz: 900 },
    { minHz: 900, maxHz: 2200 },
    { minHz: 2200, maxHz: 5000 },
    { minHz: 5000, maxHz: 10000 },
    { minHz: 10000, maxHz: 20000 },
  ],
  VOCAL_FOCUS_DEFAULT_GAINS,
)

export type AudioBandPresetId =
  | 'rhythm-game'
  | 'general'
  | 'rock'
  | 'electronic'
  | 'acoustic'
  | 'dj'
  | 'vocal-focus'

export interface AudioBandPreset {
  id: AudioBandPresetId
  label: string
  description: string
  bands: AudioBandDefinition[]
}

export const AUDIO_BAND_PRESETS: AudioBandPreset[] = [
  {
    id: 'rhythm-game',
    label: 'Rhythm Game',
    description:
      'Rock Band / Guitar Hero style: kick, bass, guitar lanes, vocals, and cymbals separated for game-style reactions.',
    bands: RHYTHM_GAME_BANDS,
  },
  {
    id: 'general',
    label: 'General',
    description: 'Broad general-purpose split across the spectrum.',
    bands: GENERAL_BANDS,
  },
  {
    id: 'rock',
    label: 'Rock',
    description: 'Guitar, bass, and drums: rhythm and lead guitar, vocals, and cymbals.',
    bands: ROCK_BANDS,
  },
  {
    id: 'electronic',
    label: 'Electronic',
    description: 'Synth bass, kicks, leads, hi-hats, and FX.',
    bands: ELECTRONIC_BANDS,
  },
  {
    id: 'acoustic',
    label: 'Acoustic',
    description: 'Natural instruments: strings, vocals, and room.',
    bands: ACOUSTIC_BANDS,
  },
  {
    id: 'dj',
    label: 'DJ',
    description: 'Club and EDM: sub drops, kicks, mids, and air.',
    bands: DJ_BANDS,
  },
  {
    id: 'vocal-focus',
    label: 'Vocal Focus',
    description: 'Emphasises vocal fundamentals, presence, and breath.',
    bands: VOCAL_FOCUS_BANDS,
  },
]

function hzRangesEqual(a: AudioBandDefinition[], b: AudioBandDefinition[]): boolean {
  if (a.length !== 8 || b.length !== 8) return false
  for (let i = 0; i < 8; i++) {
    if (a[i]!.id !== b[i]!.id) return false
    if (a[i]!.minHz !== b[i]!.minHz || a[i]!.maxHz !== b[i]!.maxHz) return false
  }
  return true
}

/**
 * Returns the preset id whose Hz layout matches the given bands, or null if unknown/custom.
 */
export function matchAudioBandPresetId(bands: AudioBandDefinition[]): AudioBandPresetId | null {
  for (const preset of AUDIO_BAND_PRESETS) {
    if (hzRangesEqual(bands, preset.bands)) {
      return preset.id
    }
  }
  return null
}

/**
 * Deep copy of preset bands with optional gain values merged from current config.
 */
export function clonePresetBands(
  presetId: AudioBandPresetId,
  currentGains?: readonly number[],
): AudioBandDefinition[] {
  const preset = AUDIO_BAND_PRESETS.find((p) => p.id === presetId)
  if (!preset) {
    throw new Error(`Unknown audio band preset: ${presetId}`)
  }
  return preset.bands.map((band, i) => ({
    ...band,
    gain: currentGains?.[i] ?? band.gain,
  }))
}
