import type { CueData } from '../../photonics-dmx/cues/types/cueTypes'
import type { AudioCueData } from '../../photonics-dmx/cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../photonics-dmx/listeners/Audio/AudioConfig'
import type { AudioLightingData } from '../../photonics-dmx/listeners/Audio/AudioTypes'

export type MockCueDataOptions = {
  venueSize?: 'NoVenue' | 'Small' | 'Large'
  bpm?: number
  effectId?: string | null
  beat?: CueData['beat']
  keyframe?: CueData['keyframe']
  /** When set with trackMode 'simulated', use this group for deterministic cue resolution. */
  simulationCueGroup?: string
}

/**
 * Creates mock cue data for simulation handlers (beat, keyframe, measure, instrument)
 */
export function createMockCueData(options: MockCueDataOptions = {}): CueData {
  const {
    venueSize = 'Small',
    bpm = 120,
    effectId,
    beat = 'Unknown',
    keyframe = 'Off',
    simulationCueGroup,
  } = options

  const base: CueData = {
    datagramVersion: 1,
    platform: 'Unknown',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize,
    beatsPerMinute: bpm,
    songSection: 'Verse',
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: effectId ?? 'None',
    postProcessing: 'Default',
    fogState: false,
    strobeState: 'Strobe_Off',
    performer: 0,
    trackMode: 'simulated',
    simulationCueGroup,
    beat,
    keyframe,
    bonusEffect: false,
    ledPositions: [],
    ledColor: 'off',
  }
  return { ...base, timestamp: Date.now() } as CueData
}

/**
 * Minimal audio analysis frame + config for motion cue simulation (IPC / tests).
 */
export function createMockAudioCueData(executionCount: number): AudioCueData {
  const audioData: AudioLightingData = {
    timestamp: Date.now(),
    overallLevel: 0.55,
    bpm: 120,
    beatDetected: true,
    energy: 0.5,
    rawFrequencyData: new Array(2048).fill(0).map((_, i) => (i % 64) / 255),
    sampleRate: 48000,
    fftSize: 4096,
    peakFrequency: 200,
    amplitude: 0.4,
    spectralCentroid: 0.35,
    spectralFlatness: 0.2,
    spectralRolloff: 0.4,
    spectralCrest: 0.5,
    spectralSpread: 0.3,
    hfcOnset: 0.1,
    zeroCrossingRate: 0.15,
    melBands: new Array(128).fill(0.1),
    chromagram: new Array(12).fill(0.08),
  }
  return {
    audioData,
    config: DEFAULT_AUDIO_CONFIG,
    enabledBandCount: DEFAULT_AUDIO_CONFIG.bands.length,
    timestamp: Date.now(),
    executionCount,
  }
}
