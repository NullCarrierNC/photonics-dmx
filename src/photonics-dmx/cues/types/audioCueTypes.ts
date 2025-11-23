import { AudioLightingData, AudioConfig } from '../../listeners/Audio/audioTypes';

/**
 * Audio cue types for audio-reactive lighting
 */
export enum AudioCueType {
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
  GatedLightOrgan = 'GatedLightOrgan',
}

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

