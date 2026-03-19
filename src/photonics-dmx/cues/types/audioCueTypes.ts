import { AudioLightingData, AudioConfig } from '../../listeners/Audio/AudioTypes'

/**
 * AudioCueType is a free-form string so user-authored (node-based) cues can
 * register arbitrary identifiers from the node editor.
 */
export type AudioCueType = string

/**
 * Context injected when execution was started from an AudioTriggerNode output path.
 * Used by cue-data getter nodes to read trigger-specific values.
 */
export interface TriggerContext {
  triggerLevel: number
  triggerFrequencyMin: number
  triggerFrequencyMax: number
  triggerPeakFrequency: number
  triggerBandAmplitude: number
}

/**
 * Audio cue data structure passed to cue implementations
 */
export interface AudioCueData {
  /** Audio analysis data */
  audioData: AudioLightingData

  /** Audio configuration */
  config: AudioConfig

  /** Number of enabled bands (3 or 5) currently active */
  enabledBandCount: number

  /** Timestamp of the cue execution */
  timestamp: number

  /** Execution count for this cue */
  executionCount: number

  /** Set when execution was started from an AudioTriggerNode (enter/during/exit path) */
  triggerContext?: TriggerContext
}
