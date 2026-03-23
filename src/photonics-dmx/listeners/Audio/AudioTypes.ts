/**
 * Audio analysis data structure for lighting control
 * Emitted by AudioInputListener as 'audio:data' events
 */
export interface AudioLightingData {
  /** Timestamp of the audio analysis */
  timestamp: number

  /** Overall audio level (0.0-1.0, normalized) */
  overallLevel: number

  /** Detected BPM (beats per minute), or null if not detected */
  bpm: number | null

  /** Confidence in current BPM estimate (0–1), when available */
  bpmConfidence?: number

  /** Whether a beat was detected in this frame */
  beatDetected: boolean

  /** Energy level (overall intensity) */
  energy: number // 0.0-1.0

  /** Raw FFT bin data for per-node band computation (IPC-safe array) */
  rawFrequencyData?: number[]
  /** Sample rate in Hz, needed to map bins to Hz */
  sampleRate?: number
  /** FFT size (e.g. 4096), needed to compute bin width */
  fftSize?: number
  /** Dominant frequency in Hz for this frame */
  peakFrequency?: number
  /** Overall signal amplitude (0.0-1.0) */
  amplitude?: number

  /** Spectral centroid 0–1 (perceived brightness, normalised against Nyquist) */
  spectralCentroid?: number
  /** Spectral flatness 0–1 (noise vs tonal) */
  spectralFlatness?: number
  /** Spectral rolloff 0–1 (normalised frequency below which 85% energy sits) */
  spectralRolloff?: number
  /** Spectral crest 0–1 (peakiness) */
  spectralCrest?: number
  /** Spectral spread 0–1 (bandwidth around centroid) */
  spectralSpread?: number
  /** High-frequency content onset 0–1 (percussive detection) */
  hfcOnset?: number
  /** Zero-crossing rate 0–1 (percussive vs sustained) */
  zeroCrossingRate?: number

  /** Mel band energies (perceptually spaced), normalised 0–1 */
  melBands?: number[]
  /** 12 pitch class energies (C=0 … B=11), normalised max 1 */
  chromagram?: number[]
  /** Detected key e.g. "C major", "A minor" */
  detectedKey?: string
  /** Key detection confidence 0–1 */
  detectedKeyStrength?: number

  /** Per-band spectral features, keyed by band id (matches audio config bands) */
  bandSpectralFeatures?: Record<
    string,
    {
      flatness: number
      crest: number
      centroid: number
    }
  >

  /** Per-band onset strength (0–1), keyed by band id */
  bandOnsets?: Record<string, number>
}

/** Minimum value for per-band gain multiplier (Audio Settings frequency bands). */
export const AUDIO_BAND_GAIN_MIN = 0.1

/** Maximum value for per-band gain multiplier (Audio Settings frequency bands). */
export const AUDIO_BAND_GAIN_MAX = 10

/**
 * Frequency band definition for audio analysis
 */
export interface AudioBandDefinition {
  /** Unique identifier for the band */
  id: string
  /** Display name for the band */
  name: string
  /** Minimum frequency in Hz (20-20000) */
  minHz: number
  /** Maximum frequency in Hz (20-20000, must be > minHz) */
  maxHz: number
  /** Per-band gain multiplier (AUDIO_BAND_GAIN_MIN–AUDIO_BAND_GAIN_MAX) */
  gain: number
}

/**
 * Audio configuration interface
 * Controls how audio input is processed and mapped to lighting
 */
export interface AudioConfig {
  /** Audio input device ID (string from MediaDeviceInfo.deviceId, undefined = default) */
  deviceId?: string

  /** FFT size (default: 4096, must be power of 2) */
  fftSize: number

  /** Sensitivity/gain multiplier (default: 2.5, range: 0.1-5.0) */
  sensitivity: number

  /** Noise floor gate threshold (0-255 raw FFT value, default: 60).
   *  Bins below this level are zeroed before any gain or analysis is applied. */
  noiseFloor: number

  /** Frequency band definitions (exactly 8 bands) */
  bands: AudioBandDefinition[]

  /** Beat detection settings */
  beatDetection: {
    /** Minimum threshold for beat detection (0.0-1.0, default: 0.3) */
    threshold: number
    /** Decay rate for beat detection (0.0-1.0, default: 0.95) */
    decayRate: number
    /** Minimum time between beats in milliseconds (default: 100) */
    minInterval: number
  }

  /** Smoothing settings */
  smoothing: {
    /** Enable exponential smoothing (default: true) */
    enabled: boolean
    /** Smoothing factor (0.0-1.0, higher = less smoothing, default: 0.7) */
    alpha: number
  }

  /** Enable audio-reactive lighting */
  enabled: boolean // Default: false

  /** Whether to treat cue brightness as linear (true) or discrete DMX steps (false) */
  linearResponse?: boolean
}

/**
 * Settings for audio-reactive Game Mode (automatic cue cycling and optional strobes).
 */
export interface AudioGameModeConfig {
  /** When true, cues cycle automatically instead of using the manual selection */
  enabled: boolean
  /** Minimum seconds before the next cue switch is scheduled */
  cueDurationMin: number
  /** Maximum seconds before the next cue switch is scheduled */
  cueDurationMax: number
  /** When true, secondary slot uses a strobe cue when energy exceeds the threshold */
  strobeEnabled: boolean
  /** Normalised total energy (0–1) required to activate the strobe secondary cue */
  strobeTriggerThreshold: number
}

export const DEFAULT_AUDIO_GAME_MODE: AudioGameModeConfig = {
  enabled: false,
  cueDurationMin: 5,
  cueDurationMax: 20,
  strobeEnabled: false,
  strobeTriggerThreshold: 0.8,
}
