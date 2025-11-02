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
  smoothing: {
    enabled: true,
    alpha: 0.7
  },
  colorMapping: {
    ranges: [
      { id: 'range1', name: 'Bass', minHz: 20, maxHz: 250, color: 'red', brightness: 'medium', sensitivity: 1.0 },
      { id: 'range2', name: 'Low-Mids', minHz: 250, maxHz: 800, color: 'blue', brightness: 'medium', sensitivity: 1.0 },
      { id: 'range3', name: 'Mids', minHz: 800, maxHz: 4000, color: 'yellow', brightness: 'medium', sensitivity: 1.0 },
      { id: 'range4', name: 'Upper-Mids', minHz: 4000, maxHz: 10000, color: 'green', brightness: 'medium', sensitivity: 1.0 },
      { id: 'range5', name: 'Highs', minHz: 10000, maxHz: 20000, color: 'cyan', brightness: 'medium', sensitivity: 1.0 }
    ]
  },
  activeCueType: 'BasicLayered',
  enabled: false
};

