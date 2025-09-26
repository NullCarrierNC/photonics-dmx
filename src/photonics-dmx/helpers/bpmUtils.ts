/**
 * BPM and timing utility functions for YARG cues
 */

/**
 * Converts BPM to beats per second
 * 
 * @param bpm - Beats per minute
 * @returns Beats per second
 */
export function bpmToBps(bpm: number): number {
  if (typeof bpm !== 'number' || bpm <= 0) {
    console.warn(`Invalid BPM value: ${bpm}. Using default value of 120.`);
    return 120 / 60;
  }
  return bpm / 60;
}

/**
 * Calculates duration in milliseconds for a single beat
 * 
 * @param bpm - Beats per minute
 * @returns Duration of one beat in milliseconds
 */
export function getBeatDuration(bpm: number): number {
  if (typeof bpm !== 'number' || bpm <= 0) {
    console.warn(`Invalid BPM value: ${bpm}. Using default value of 120.`);
    bpm = 120;
  }
  return 1000 / bpmToBps(bpm);
}

/**
 * Calculates duration in milliseconds for a quarter beat
 * 
 * @param bpm - Beats per minute
 * @returns Duration of one quarter beat in milliseconds
 */
export function getQuarterBeatDuration(bpm: number): number {
  return getBeatDuration(bpm) / 4;
}

/**
 * Calculates duration in milliseconds for half a beat
 * 
 * @param bpm - Beats per minute
 * @returns Duration of half a beat in milliseconds
 */
export function getHalfBeatDuration(bpm: number): number {
  return getBeatDuration(bpm) / 2;
}

/**
 * Calculates duration in milliseconds for multiple beats
 * 
 * @param bpm - Beats per minute
 * @param beats - Number of beats
 * @returns Duration of specified beats in milliseconds
 */
export function getBeatsDuration(bpm: number, beats: number): number {
  if (typeof beats !== 'number' || beats < 0) {
    console.warn(`Invalid beats value: ${beats}. Using default value of 1.`);
    beats = 1;
  }
  return getBeatDuration(bpm) * beats;
}

/**
 * Calculates duration with BPM-based adjustment
 * 
 * @param bpm - Beats per minute
 * @param baseDuration - Base duration in milliseconds
 * @param adjustment - Adjustment factor (default: 100)
 * @returns Adjusted duration in milliseconds
 */
export function getAdjustedDuration(bpm: number, baseDuration: number, adjustment: number = 100): number {
  if (typeof baseDuration !== 'number' || baseDuration < 0) {
    console.warn(`Invalid baseDuration value: ${baseDuration}. Using default value of 0.`);
    baseDuration = 0;
  }
  if (typeof adjustment !== 'number') {
    console.warn(`Invalid adjustment value: ${adjustment}. Using default value of 100.`);
    adjustment = 100;
  }
  return baseDuration + (adjustment - bpm);
}

/**
 * Calculates strobe timing based on BPM division
 * 
 * @param bpm - Beats per minute
 * @param division - Division factor (e.g., 8 for BPM/8)
 * @returns Strobe interval in milliseconds
 */
export function getStrobeTiming(bpm: number, division: number = 8): number {
  if (typeof division !== 'number' || division <= 0) {
    console.warn(`Invalid division value: ${division}. Using default value of 8.`);
    division = 8;
  }
  return getBeatDuration(bpm) / division;
}

/**
 * Common timing presets for different cue types
 */
export const TimingPresets = {
  /**
   * Standard beat duration
   * 
   * @param bpm - Beats per minute
   * @returns Duration of one beat in milliseconds
   */
  beat: (bpm: number): number => getBeatDuration(bpm),
  
  /**
   * Quarter beat duration (for fast effects)
   * 
   * @param bpm - Beats per minute
   * @returns Duration of one quarter beat in milliseconds
   */
  quarterBeat: (bpm: number): number => getQuarterBeatDuration(bpm),
  
  /**
   * Half beat duration
   * 
   * @param bpm - Beats per minute
   * @returns Duration of half a beat in milliseconds
   */
  halfBeat: (bpm: number): number => getHalfBeatDuration(bpm),
  
  /**
   * Verse timing with BPM adjustment
   * 
   * @param bpm - Beats per minute
   * @returns Adjusted verse timing in milliseconds
   */
  verse: (bpm: number): number => getAdjustedDuration(bpm, getBeatDuration(bpm), 100),
  
  /**
   * Chorus timing with BPM adjustment
   * 
   * @param bpm - Beats per minute
   * @returns Adjusted chorus timing in milliseconds
   */
  chorus: (bpm: number): number => getAdjustedDuration(bpm, getBeatDuration(bpm), 200),
  
  /**
   * Dischord timing (half beat)
   * 
   * @param bpm - Beats per minute
   * @returns Dischord timing in milliseconds
   */
  dischord: (bpm: number): number => getHalfBeatDuration(bpm),
  
  /**
   * Strobe slow timing
   * 
   * @param bpm - Beats per minute
   * @returns Slow strobe interval in milliseconds
   */
  strobeSlow: (bpm: number): number => getStrobeTiming(bpm, 8),
  
  /**
   * Strobe medium timing
   * 
   * @param bpm - Beats per minute
   * @returns Medium strobe interval in milliseconds
   */
  strobeMedium: (bpm: number): number => getStrobeTiming(bpm, 4),
  
  /**
   * Strobe fast timing
   * 
   * @param bpm - Beats per minute
   * @returns Fast strobe interval in milliseconds
   */
  strobeFast: (bpm: number): number => getStrobeTiming(bpm, 2),
  
  /**
   * Strobe fastest timing
   * 
   * @param bpm - Beats per minute
   * @returns Fastest strobe interval in milliseconds
   */
  strobeFastest: (bpm: number): number => getStrobeTiming(bpm, 1),
} as const;
