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
  /** FFT size (e.g. 2048), needed to compute bin width */
  fftSize?: number
  /** Dominant frequency in Hz for this frame */
  peakFrequency?: number
  /** Overall signal amplitude (0.0-1.0) */
  amplitude?: number
}

/**
 * Audio configuration interface
 * Controls how audio input is processed and mapped to lighting
 */
export interface AudioConfig {
  /** Audio input device ID (string from MediaDeviceInfo.deviceId, undefined = default) */
  deviceId?: string

  /** FFT size (default: 2048, must be power of 2) */
  fftSize: number

  /** Sensitivity/gain multiplier (default: 1.0, range: 0.1-5.0) */
  sensitivity: number

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
