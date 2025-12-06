import { AudioLightingData, AudioConfig } from '../../listeners/Audio/AudioTypes';

/**
 * Audio cue types for audio-reactive lighting.
 * Built-in cues are enumerated constants while user-defined cues can use any string identifier.
 */
export enum BuiltInAudioCues {
  BasicLayered = 'BasicLayered',
  SpectrumCue = 'SpectrumCue',
  PulseChaser = 'PulseChaser',
  BeatSplitPulse = 'BeatSplitPulse',
  BassSnareRipple = 'BassSnareRipple',
  EnergyStrobePulse = 'EnergyStrobePulse',
  MirrorBandBounce = 'MirrorBandBounce',
  BandShell = 'BandShell',
  PrismSweep = 'PrismSweep',
  TrebleSpark = 'TrebleSpark',
  SubHarmonicWave = 'SubHarmonicWave',
  SpectrumStepper = 'SpectrumStepper',
  BeatSpectrumMorph = 'BeatSpectrumMorph',
  TriadCascade = 'TriadCascade',
  AuroraDrift = 'AuroraDrift',
  TempoFlutter = 'TempoFlutter',
  DynamicSurge = 'DynamicSurge',
  LinearLightOrgan = 'LinearLightOrgan',
  SplitLightOrgan = 'SplitLightOrgan',
  StackedLightOrgan = 'StackedLightOrgan',
  DiagonalLightOrgan = 'DiagonalLightOrgan',
  GatedLightOrgan = 'GatedLightOrgan'
}

/**
 * AudioCueType is a free-form string so user-authored cues can
 * register arbitrary identifiers from the node editor.
 */
export type AudioCueType = string;

export type BuiltInAudioCueType = `${BuiltInAudioCues}`;

export const builtInAudioCueList: BuiltInAudioCueType[] = Object.values(BuiltInAudioCues) as BuiltInAudioCueType[];

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

