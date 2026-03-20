import { AudioConfig, AudioBandDefinition } from './AudioTypes'

/**
 * Default frequency band definitions (5-band split)
 */
export const DEFAULT_AUDIO_BANDS: AudioBandDefinition[] = [
  {
    id: 'bass',
    name: 'Bass',
    minHz: 20,
    maxHz: 220,
    gain: 1.0,
  },
  {
    id: 'lower-mids',
    name: 'Lower-Mids',
    minHz: 220,
    maxHz: 800,
    gain: 1.0,
  },
  {
    id: 'upper-mids',
    name: 'Upper-Mids',
    minHz: 800,
    maxHz: 2500,
    gain: 1.0,
  },
  {
    id: 'highs',
    name: 'Highs',
    minHz: 2500,
    maxHz: 6000,
    gain: 1.0,
  },
  {
    id: 'air',
    name: 'Air',
    minHz: 6000,
    maxHz: 20000,
    gain: 1.0,
  },
]

/**
 * Default audio configuration for Web Audio API
 *
 * Note: sampleRate is determined by the AudioContext (typically 44100 or 48000)
 * Note: update rate is ~60fps via requestAnimationFrame
 */
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  deviceId: undefined, // undefined = use system default device
  fftSize: 2048,
  sensitivity: 1.0,
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
}

export default DEFAULT_AUDIO_CONFIG
