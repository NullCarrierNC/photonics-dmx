import type { AudioCueData } from '../../types/audioCueTypes'
import type { AudioEventNode } from '../../types/nodeCueTypes'

/**
 * Standalone audio event evaluator: turns an analysis frame (`AudioCueData`) into an event
 * triggering/intensity result, advancing the caller-owned edge-detector state. Extracted from
 * BaseAudioNodeCue so any cue-graph runtime (lighting, motion, and later laser) can evaluate audio
 * events identically without inheriting the audio-lighting cue class. Behaviour is unchanged.
 */

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/** Per-event edge-detector state, owned by the cue and passed in so each rig keeps its own history. */
export interface AudioEventState {
  previousValue: number
  active: boolean
}

export interface EdgeEvaluation {
  mode: 'edge'
  triggered: boolean
  intensity: number
}

export interface LevelEvaluation {
  mode: 'level'
  active: boolean
  intensity: number
}

export type AudioEventEvaluation = EdgeEvaluation | LevelEvaluation

/** Normalized 0..1 value an audio event type reads from the analysis frame. */
export function getAudioEventValue(
  eventType: AudioEventNode['eventType'],
  data: AudioCueData,
): number {
  const { audioData } = data
  switch (eventType) {
    case 'cue-started':
      return 0
    case 'cue-called':
      return 0
    case 'beat':
      return audioData.beatDetected ? 1 : 0
    case 'audio-energy':
      return clamp(audioData.energy ?? 0, 0, 1)
    case 'audio-trigger':
      return 0
    case 'audio-centroid':
      return clamp(audioData.spectralCentroid ?? 0, 0, 1)
    case 'audio-flatness':
      return clamp(audioData.spectralFlatness ?? 0, 0, 1)
    case 'audio-hfc':
      return clamp(audioData.hfcOnset ?? 0, 0, 1)
    default:
      return 0
  }
}

/**
 * Evaluate one audio event against the current analysis frame, advancing the passed-in edge state.
 * Edge mode fires on a threshold rising edge (optionally onset-gated); level mode reports active
 * plus a normalized intensity above the threshold.
 */
export function evaluateAudioEvent(
  event: AudioEventNode,
  data: AudioCueData,
  state: AudioEventState,
): AudioEventEvaluation {
  const threshold = clamp(event.threshold ?? 0.5, 0, 1)
  const currentValue = clamp(getAudioEventValue(event.eventType, data), 0, 1)

  if (event.triggerMode === 'edge') {
    let triggered = state.previousValue < threshold && currentValue >= threshold
    if (triggered && event.useOnsetGating) {
      const bandOnsets = data.audioData.bandOnsets
      const onsetThreshold = clamp(event.onsetThreshold ?? 0.3, 0, 1)
      let maxOnset = 0
      if (bandOnsets && Object.keys(bandOnsets).length > 0) {
        maxOnset = Math.max(...Object.values(bandOnsets))
      }
      if (maxOnset < onsetThreshold) {
        triggered = false
      }
    }
    state.previousValue = currentValue
    state.active = triggered
    return {
      mode: 'edge',
      triggered,
      intensity: currentValue,
    }
  }

  const isActive = currentValue >= threshold
  const normalizedRange = threshold >= 1 ? 1 : (currentValue - threshold) / (1 - threshold)
  const intensity = isActive ? clamp(normalizedRange, 0.05, 1) : 0
  state.previousValue = currentValue
  state.active = isActive

  return {
    mode: 'level',
    active: isActive,
    intensity,
  }
}
