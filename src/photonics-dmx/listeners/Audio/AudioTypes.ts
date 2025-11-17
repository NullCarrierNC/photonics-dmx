/**
 * Audio analysis data structure for lighting control
 * Emitted by AudioInputListener as 'audio:data' events
 */
export interface AudioLightingData {
  /** Timestamp of the audio analysis */
  timestamp: number;
  
  /** Overall audio level (0.0-1.0, normalized) */
  overallLevel: number;
  
  /** Detected BPM (beats per minute), or null if not detected */
  bpm: number | null;
  
  /** Whether a beat was detected in this frame */
  beatDetected: boolean;
  
  /** Frequency band analysis (normalized 0.0-1.0) */
  frequencyBands: {
    /** Range 1: Bass frequencies */
    range1: number;
    /** Range 2: Low-Mids frequencies */
    range2: number;
    /** Range 3: Mids frequencies */
    range3: number;
    /** Range 4: Upper-Mids frequencies */
    range4: number;
    /** Range 5: Highs frequencies */
    range5: number;
  };
  
  /** Energy level (overall intensity) */
  energy: number; // 0.0-1.0
}

/**
 * Audio configuration interface
 * Controls how audio input is processed and mapped to lighting
 */
export interface AudioConfig {
  /** Audio input device ID (string from MediaDeviceInfo.deviceId, undefined = default) */
  deviceId?: string;
  
  /** FFT size (default: 2048, must be power of 2) */
  fftSize: number;
  
  /** Sensitivity/gain multiplier (default: 1.0, range: 0.1-5.0) */
  sensitivity: number;
  
  /** Beat detection settings */
  beatDetection: {
    /** Minimum threshold for beat detection (0.0-1.0, default: 0.3) */
    threshold: number;
    /** Decay rate for beat detection (0.0-1.0, default: 0.95) */
    decayRate: number;
    /** Minimum time between beats in milliseconds (default: 100) */
    minInterval: number;
  };
  
  /** Smoothing settings */
  smoothing: {
    /** Enable exponential smoothing (default: true) */
    enabled: boolean;
    /** Smoothing factor (0.0-1.0, higher = less smoothing, default: 0.7) */
    alpha: number;
  };
  
  /** Frequency band configuration */
  frequencyBands: {
    /** Number of enabled bands (3, 4, or 5) */
    bandCount: 3 | 4 | 5;
    /** Array of frequency range configurations */
    ranges: Array<{
      /** Unique identifier for this range */
      id: string;
      /** Display name for this range */
      name: string;
      /** Lower frequency boundary in Hz */
      minHz: number;
      /** Upper frequency boundary in Hz */
      maxHz: number;
      /** Color for this frequency range */
      color: string;
      /** Brightness level for this frequency range */
      brightness: 'low' | 'medium' | 'high' | 'max';
      /** Sensitivity multiplier for this frequency range (0.0-1.0, default: 1.0) */
      sensitivity: number;
    }>;
  };
  
  /** Active cue type for audio-reactive lighting */
  
  /** Enable audio-reactive lighting */
  enabled: boolean;       // Default: false
}

