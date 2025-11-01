import { AudioConfig } from './AudioTypes';

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
    decayRate: 0.95,
    minInterval: 100
  },
  frequencyRanges: {
    bass: [20, 250],
    mids: [250, 4000],
    highs: [4000, 20000]
  },
  smoothing: {
    enabled: true,
    alpha: 0.7
  },
  colorMapping: {
    bassColor: 'red',
    midsColor: 'blue',
    highsColor: 'yellow'
  },
  enabled: false
};

