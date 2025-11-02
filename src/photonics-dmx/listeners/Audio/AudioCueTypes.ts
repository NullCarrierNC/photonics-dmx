import { AudioLightingData, AudioConfig } from './AudioTypes';

/**
 * Audio cue types for audio-reactive lighting
 */
export enum AudioCueType {
  BasicLayered = 'BasicLayered',
  SpectrumCue = 'SpectrumCue',
}

/**
 * Audio cue data structure passed to cue implementations
 */
export interface AudioCueData {
  /** Audio analysis data */
  audioData: AudioLightingData;
  
  /** Audio configuration */
  config: AudioConfig;
  
  /** Timestamp of the cue execution */
  timestamp: number;
  
  /** Execution count for this cue */
  executionCount: number;
}

