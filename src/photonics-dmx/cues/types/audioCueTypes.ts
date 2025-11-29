import { AudioLightingData, AudioConfig } from '../../listeners/Audio/audioTypes';

/**
 * Audio cue types for audio-reactive lighting
 * Built-in cues are expressed as constants, while user-defined cues can provide any string identifier.
 */
export type AudioCueType = string;

export const BuiltInAudioCues = {
  BasicLayered: 'BasicLayered',
  SpectrumCue: 'SpectrumCue',
} as const;

export type BuiltInAudioCueType = typeof BuiltInAudioCues[keyof typeof BuiltInAudioCues];

export const builtInAudioCueList: BuiltInAudioCueType[] = Object.values(BuiltInAudioCues);

/**
 * Audio cue data structure passed to cue implementations
 */
export interface AudioCueData {
  /** Audio analysis data */
  audioData: AudioLightingData;
  
  /** Audio configuration */
  config: AudioConfig;

  /** Number of enabled bands (3 or 5) currently active */
  enabledBandCount: number;
  
  /** Timestamp of the cue execution */
  timestamp: number;
  
  /** Execution count for this cue */
  executionCount: number;
}

