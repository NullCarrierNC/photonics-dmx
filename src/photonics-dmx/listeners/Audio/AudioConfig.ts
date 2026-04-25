import { AudioConfig, AudioBandDefinition, AudioIdleDetectionConfig } from './AudioTypes'
import { RHYTHM_GAME_BANDS } from './AudioBandPresets'

/** Defaults for Game Mode idle/menu detection (overall energy vs threshold). */
export const DEFAULT_AUDIO_IDLE_DETECTION: AudioIdleDetectionConfig = {
  enabled: true,
  thresholdPct: 20,
  minIdleSeconds: 5,
  resumeSeconds: 3,
  idleColor: 'blue',
  idleBrightness: 'low',
}

/**
 * Default frequency band definitions (8-band Rhythm Game preset — shipped default).
 */
export const DEFAULT_AUDIO_BANDS: AudioBandDefinition[] = RHYTHM_GAME_BANDS.map((b) => ({ ...b }))

/**
 * Default audio configuration for Web Audio API
 *
 * Note: sampleRate is determined by the AudioContext (typically 44100 or 48000)
 * Note: update rate is ~60fps via requestAnimationFrame
 */
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  deviceId: undefined, // undefined = use system default device
  fftSize: 4096,
  sensitivity: 2.5,
  noiseFloor: 60,
  bands: DEFAULT_AUDIO_BANDS,
  beatDetection: {
    threshold: 0.3,
    decayRate: 0.8,
    minInterval: 100,
  },
  smoothing: {
    enabled: true,
    alpha: 0.7,
  },
  enabled: false,
  linearResponse: true,
  strobeEnabled: false,
  strobeTriggerThreshold: 0.8,
  strobeProbability: 100,
  idleDetection: { ...DEFAULT_AUDIO_IDLE_DETECTION },
}

export default DEFAULT_AUDIO_CONFIG
