import { AudioConfig } from './AudioTypes'

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
