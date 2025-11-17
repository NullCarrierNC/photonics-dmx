import { AudioConfig } from './audioTypes';

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
  frequencyBands: {
    bandCount: 4,
    ranges: [
      { id: 'range1', name: 'Bass', minHz: 20, maxHz: 220, color: 'red', brightness: 'medium', sensitivity: 1.0 },
      { id: 'range2', name: 'Lower-Mids', minHz: 220, maxHz: 800, color: 'blue', brightness: 'medium', sensitivity: 1.0 },
      { id: 'range3', name: 'Upper-Mids', minHz: 800, maxHz: 2500, color: 'yellow', brightness: 'medium', sensitivity: 1.0 },
      { id: 'range4', name: 'Highs', minHz: 2500, maxHz: 6000, color: 'green', brightness: 'medium', sensitivity: 1.0 },
      { id: 'range5', name: 'Air', minHz: 6000, maxHz: 20000, color: 'cyan', brightness: 'medium', sensitivity: 1.0 },
    ],
  },
  enabled: false,
};

export default DEFAULT_AUDIO_CONFIG;
