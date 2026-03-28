import type { AudioBandDefinition } from './AudioTypes'

/** Canonical 8-band ids and display names (same for every preset; only Hz ranges change). */
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

function bandsFromHz(ranges: readonly { minHz: number; maxHz: number }[]): AudioBandDefinition[] {
  if (ranges.length !== 8) {
    throw new Error('Expected exactly 8 frequency ranges')
  }
  return ranges.map((r, i) => ({
    id: BAND_IDS[i]!,
    name: BAND_NAMES[i]!,
    minHz: r.minHz,
    maxHz: r.maxHz,
    gain: 1.0,
  }))
}

const RHYTHM_GAME_DEFAULT_GAINS = [1, 0.7, 0.9, 2.8, 4.6, 4.8, 5.4, 7] as const

/** Shipped default: Rock Band / Guitar Hero style instrument lanes. */
export const RHYTHM_GAME_BANDS: AudioBandDefinition[] = bandsFromHz([
  { minHz: 20, maxHz: 50 },
  { minHz: 50, maxHz: 130 },
  { minHz: 130, maxHz: 250 },
  { minHz: 250, maxHz: 1000 },
  { minHz: 1000, maxHz: 2500 },
  { minHz: 2500, maxHz: 5000 },
  { minHz: 5000, maxHz: 10000 },
  { minHz: 10000, maxHz: 20000 },
]).map((band, i) => ({
  ...band,
  gain: RHYTHM_GAME_DEFAULT_GAINS[i]!,
}))

const GENERAL_BANDS: AudioBandDefinition[] = bandsFromHz([
  { minHz: 20, maxHz: 60 },
  { minHz: 60, maxHz: 150 },
  { minHz: 150, maxHz: 400 },
  { minHz: 400, maxHz: 1000 },
  { minHz: 1000, maxHz: 2500 },
  { minHz: 2500, maxHz: 5000 },
  { minHz: 5000, maxHz: 10000 },
  { minHz: 10000, maxHz: 20000 },
])

const ROCK_BANDS: AudioBandDefinition[] = bandsFromHz([
  { minHz: 20, maxHz: 50 },
  { minHz: 50, maxHz: 120 },
  { minHz: 120, maxHz: 350 },
  { minHz: 350, maxHz: 900 },
  { minHz: 900, maxHz: 2500 },
  { minHz: 2500, maxHz: 5500 },
  { minHz: 5500, maxHz: 11000 },
  { minHz: 11000, maxHz: 20000 },
])

const ELECTRONIC_BANDS: AudioBandDefinition[] = bandsFromHz([
  { minHz: 20, maxHz: 55 },
  { minHz: 55, maxHz: 130 },
  { minHz: 130, maxHz: 300 },
  { minHz: 300, maxHz: 800 },
  { minHz: 800, maxHz: 2200 },
  { minHz: 2200, maxHz: 5000 },
  { minHz: 5000, maxHz: 10000 },
  { minHz: 10000, maxHz: 20000 },
])

const ACOUSTIC_BANDS: AudioBandDefinition[] = bandsFromHz([
  { minHz: 20, maxHz: 65 },
  { minHz: 65, maxHz: 160 },
  { minHz: 160, maxHz: 400 },
  { minHz: 400, maxHz: 1000 },
  { minHz: 1000, maxHz: 3000 },
  { minHz: 3000, maxHz: 7000 },
  { minHz: 7000, maxHz: 13000 },
  { minHz: 13000, maxHz: 20000 },
])

const DJ_BANDS: AudioBandDefinition[] = bandsFromHz([
  { minHz: 20, maxHz: 50 },
  { minHz: 50, maxHz: 130 },
  { minHz: 130, maxHz: 300 },
  { minHz: 300, maxHz: 900 },
  { minHz: 900, maxHz: 2000 },
  { minHz: 2000, maxHz: 5000 },
  { minHz: 5000, maxHz: 11000 },
  { minHz: 11000, maxHz: 20000 },
])

const VOCAL_FOCUS_BANDS: AudioBandDefinition[] = bandsFromHz([
  { minHz: 20, maxHz: 80 },
  { minHz: 80, maxHz: 180 },
  { minHz: 180, maxHz: 400 },
  { minHz: 400, maxHz: 900 },
  { minHz: 900, maxHz: 2200 },
  { minHz: 2200, maxHz: 5000 },
  { minHz: 5000, maxHz: 10000 },
  { minHz: 10000, maxHz: 20000 },
])

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
