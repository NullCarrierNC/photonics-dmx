/**
 * BPM and timing utility functions for YARG cues
 */

/**
 * Converts BPM to beats per second
 * @param bpm - Beats per minute
 * @returns Beats per second
 */
export function bpmToBps(bpm: number): number {
  return bpm / 60;
}

/**
 * Calculates duration in milliseconds for a single beat
 * @param bpm - Beats per minute
 * @returns Duration of one beat in milliseconds
 */
export function getBeatDuration(bpm: number): number {
  return 1000 / bpmToBps(bpm);
}

/**
 * Calculates duration in milliseconds for a quarter beat
 * @param bpm - Beats per minute
 * @returns Duration of one quarter beat in milliseconds
 */
export function getQuarterBeatDuration(bpm: number): number {
  return getBeatDuration(bpm) / 4;
}

/**
 * Calculates duration in milliseconds for half a beat
 * @param bpm - Beats per minute
 * @returns Duration of half a beat in milliseconds
 */
export function getHalfBeatDuration(bpm: number): number {
  return getBeatDuration(bpm) / 2;
}

/**
 * Calculates duration in milliseconds for multiple beats
 * @param bpm - Beats per minute
 * @param beats - Number of beats
 * @returns Duration of specified beats in milliseconds
 */
export function getBeatsDuration(bpm: number, beats: number): number {
  return getBeatDuration(bpm) * beats;
}

/**
 * Calculates duration with BPM-based adjustment
 * @param bpm - Beats per minute
 * @param baseDuration - Base duration in milliseconds
 * @param adjustment - Adjustment factor (default: 100)
 * @returns Adjusted duration in milliseconds
 */
export function getAdjustedDuration(bpm: number, baseDuration: number, adjustment: number = 100): number {
  return baseDuration + (adjustment - bpm);
}

/**
 * Calculates strobe timing based on BPM division
 * @param bpm - Beats per minute
 * @param division - Division factor (e.g., 8 for BPM/8)
 * @returns Strobe interval in milliseconds
 */
export function getStrobeTiming(bpm: number, division: number = 8): number {
  return bpm / division;
}

/**
 * Common timing presets for different cue types
 */
export const TimingPresets = {
  /**
   * Standard beat duration
   */
  beat: (bpm: number) => getBeatDuration(bpm),
  
  /**
   * Quarter beat duration (for fast effects)
   */
  quarterBeat: (bpm: number) => getQuarterBeatDuration(bpm),
  
  /**
   * Half beat duration
   */
  halfBeat: (bpm: number) => getHalfBeatDuration(bpm),
  
  /**
   * Verse timing with BPM adjustment
   */
  verse: (bpm: number) => getAdjustedDuration(bpm, getBeatDuration(bpm), 100),
  
  /**
   * Chorus timing with BPM adjustment
   */
  chorus: (bpm: number) => getAdjustedDuration(bpm, getBeatDuration(bpm), 200),
  
  /**
   * Dischord timing (half beat)
   */
  dischord: (bpm: number) => getHalfBeatDuration(bpm),
  
  /**
   * Strobe slow timing
   */
  strobeSlow: (bpm: number) => getStrobeTiming(bpm, 8),
  
  /**
   * Strobe medium timing
   */
  strobeMedium: (bpm: number) => getStrobeTiming(bpm, 4),
  
  /**
   * Strobe fast timing
   */
  strobeFast: (bpm: number) => getStrobeTiming(bpm, 2),
  
  /**
   * Strobe fastest timing
   */
  strobeFastest: (bpm: number) => getStrobeTiming(bpm, 1),
} as const;
