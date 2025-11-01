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
    /** Bass band: combined sub-bass + bass (0-250 Hz) */
    bass: number;
    /** Mids band: combined low-mids + mids (250-4000 Hz) */
    mids: number;
    /** Highs band: combined upper-mids + highs + super-highs (4000-20000 Hz) */
    highs: number;
  };
  
  /** Energy level (overall intensity) */
  energy: number; // 0.0-1.0
}

/**
 * Audio configuration interface
 * Controls how audio input is processed and mapped to lighting
 * 
 * Updated for Web Audio API (browser-based capture)
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
  
  /** Frequency band ranges in Hz */
  frequencyRanges: {
    bass: [number, number];      // Default: [20, 250]
    mids: [number, number];       // Default: [250, 4000]
    highs: [number, number];      // Default: [4000, 20000]
  };
  
  /** Smoothing settings */
  smoothing: {
    /** Enable exponential smoothing (default: true) */
    enabled: boolean;
    /** Smoothing factor (0.0-1.0, higher = less smoothing, default: 0.7) */
    alpha: number;
  };
  
  /** Color mapping configuration */
  colorMapping: {
    /** Color for bass frequencies */
    bassColor: string;    // Default: 'red'
    /** Color for mids frequencies */
    midsColor: string;    // Default: 'blue'
    /** Color for highs frequencies */
    highsColor: string;   // Default: 'yellow'
  };
  
  /** Enable audio-reactive lighting */
  enabled: boolean;       // Default: false
}

