import {
  AUDIO_BAND_PRESETS,
  ACOUSTIC_DEFAULT_GAINS,
  clonePresetBands,
  DJ_DEFAULT_GAINS,
  ELECTRONIC_DEFAULT_GAINS,
  GENERAL_DEFAULT_GAINS,
  matchAudioBandPresetId,
  ROCK_DEFAULT_GAINS,
  RHYTHM_GAME_DEFAULT_GAINS,
  VOCAL_FOCUS_DEFAULT_GAINS,
} from '../../listeners/Audio/AudioBandPresets'
import { AUDIO_BAND_GAIN_MAX, AUDIO_BAND_GAIN_MIN } from '../../listeners/Audio/AudioTypes'

const PRESET_EXPECTED_GAINS = {
  'rhythm-game': [...RHYTHM_GAME_DEFAULT_GAINS],
  'general': [...GENERAL_DEFAULT_GAINS],
  'rock': [...ROCK_DEFAULT_GAINS],
  'electronic': [...ELECTRONIC_DEFAULT_GAINS],
  'acoustic': [...ACOUSTIC_DEFAULT_GAINS],
  'dj': [...DJ_DEFAULT_GAINS],
  'vocal-focus': [...VOCAL_FOCUS_DEFAULT_GAINS],
} as const

describe('AudioBandPresets', () => {
  it('defines eight bands per preset with gains in range', () => {
    for (const preset of AUDIO_BAND_PRESETS) {
      expect(preset.bands).toHaveLength(8)
      for (const band of preset.bands) {
        expect(band.gain).toBeGreaterThanOrEqual(AUDIO_BAND_GAIN_MIN)
        expect(band.gain).toBeLessThanOrEqual(AUDIO_BAND_GAIN_MAX)
      }
    }
  })

  it('applies distinct default gain vectors per preset (not all unity)', () => {
    for (const preset of AUDIO_BAND_PRESETS) {
      const gains = preset.bands.map((b) => b.gain)
      expect(gains.some((g) => g !== 1)).toBe(true)
    }
  })

  it('matches each preset id to its canonical gains and Hz layout', () => {
    for (const preset of AUDIO_BAND_PRESETS) {
      const expected = PRESET_EXPECTED_GAINS[preset.id]
      expect(preset.bands.map((b) => b.gain)).toEqual(expected)
      expect(matchAudioBandPresetId(preset.bands)).toBe(preset.id)
    }
  })

  it('clonePresetBands copies preset gains and supports overrides', () => {
    const cloned = clonePresetBands('general')
    expect(cloned.map((b) => b.gain)).toEqual([...GENERAL_DEFAULT_GAINS])
    expect(cloned).not.toBe(AUDIO_BAND_PRESETS.find((p) => p.id === 'general')!.bands)
    expect(cloned[0]).not.toBe(AUDIO_BAND_PRESETS.find((p) => p.id === 'general')!.bands[0])

    const overrides = [2, 2, 2, 2, 2, 2, 2, 2] as const
    const merged = clonePresetBands('rock', overrides)
    expect(merged.map((b) => b.gain)).toEqual([...overrides])
    expect(merged[0]!.minHz).toBe(AUDIO_BAND_PRESETS.find((p) => p.id === 'rock')!.bands[0]!.minHz)
  })
})
