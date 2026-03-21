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
 * Context injected when execution was started from a non-trigger audio event (edge mode).
 * Used by cue-data getter nodes to read the raw feature value at fire time.
 */
export interface EventContext {
  /** Raw 0–1 source value at edge-fire time */
  eventRawValue: number
}

/**
 * Audio cue data structure passed to cue implementations
 */
export interface AudioCueData {
  /** Audio analysis data */
  audioData: AudioLightingData

  /** Audio configuration */
  config: AudioConfig

  /** Number of configured frequency bands (8) */
  enabledBandCount: number

  /** Timestamp of the cue execution */
  timestamp: number

  /** Execution count for this cue */
  executionCount: number

  /** Set when execution was started from an AudioTriggerNode (enter/during/exit path) */
  triggerContext?: TriggerContext

  /** Set when execution was started from a non-trigger audio event (edge mode) */
  eventContext?: EventContext
}
