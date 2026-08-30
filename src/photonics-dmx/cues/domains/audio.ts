/**
 * Runtime behaviour for the audio family: cue identity is derived from signal analysis rather than
 * arriving from outside, so an audio cue resolves its entry nodes in `BaseAudioNodeCue` instead of
 * through the per-frame condition gate the net family uses.
 */

import type { AudioCueData } from '../types/audioCueTypes'
import type { AudioCueDataProperty } from '../types/nodeCueTypes'

/**
 * Extract Audio-specific cue data.
 */
export function extractAudioCueDataValue(
  property: AudioCueDataProperty,
  cueData: AudioCueData,
  cueId: string,
): number | string | boolean {
  switch (property) {
    case 'cue-name':
      return cueId
    case 'cue-type-id':
      return '' // Audio cues have cueTypeId
    case 'execution-count':
      return cueData.executionCount
    case 'timestamp':
      return cueData.timestamp
    case 'overall-level':
      return cueData.audioData.overallLevel
    case 'bpm':
      return cueData.audioData.bpm ?? 0
    case 'beat-detected':
      return cueData.audioData.beatDetected
    case 'energy':
      return cueData.audioData.energy
    case 'enabled-band-count':
      return cueData.enabledBandCount
    case 'audio-amplitude':
      return cueData.audioData.amplitude ?? cueData.audioData.overallLevel
    case 'audio-energy':
      return cueData.audioData.energy
    case 'audio-peak-frequency':
      return cueData.audioData.peakFrequency ?? 0
    case 'audio-bpm':
      return cueData.audioData.bpm ?? 0
    case 'audio-beat-duration-ms': {
      const bpm = cueData.audioData.bpm ?? 0
      return bpm > 0 ? Math.round(60000 / bpm) : 500
    }
    case 'audio-beat-detected':
      return cueData.audioData.beatDetected
    case 'audio-overall-level':
      return cueData.audioData.overallLevel
    case 'trigger-level':
      return cueData.triggerContext?.triggerLevel ?? 0
    case 'trigger-frequency-min':
      return cueData.triggerContext?.triggerFrequencyMin ?? 0
    case 'trigger-frequency-max':
      return cueData.triggerContext?.triggerFrequencyMax ?? 0
    case 'trigger-peak-frequency':
      return cueData.triggerContext?.triggerPeakFrequency ?? 0
    case 'trigger-band-amplitude':
      return cueData.triggerContext?.triggerBandAmplitude ?? 0
    case 'trigger-band-flatness':
      return cueData.triggerContext?.triggerBandFlatness ?? cueData.audioData.spectralFlatness ?? 0
    case 'trigger-band-crest':
      return cueData.triggerContext?.triggerBandCrest ?? cueData.audioData.spectralCrest ?? 0
    case 'trigger-band-centroid':
      return cueData.triggerContext?.triggerBandCentroid ?? 0
    case 'trigger-band-onset':
      return cueData.triggerContext?.triggerBandOnset ?? 0
    case 'event-raw-value':
      return cueData.eventContext?.eventRawValue ?? 0
    case 'spectral-centroid':
      return cueData.audioData.spectralCentroid ?? 0
    case 'spectral-flatness':
      return cueData.audioData.spectralFlatness ?? 0
    case 'spectral-rolloff':
      return cueData.audioData.spectralRolloff ?? 0
    case 'spectral-crest':
      return cueData.audioData.spectralCrest ?? 0
    case 'spectral-spread':
      return cueData.audioData.spectralSpread ?? 0
    case 'hfc-onset':
      return cueData.audioData.hfcOnset ?? 0
    case 'zero-crossing-rate':
      return cueData.audioData.zeroCrossingRate ?? 0
    case 'chromagram-c':
      return cueData.audioData.chromagram?.[0] ?? 0
    case 'chromagram-cs':
      return cueData.audioData.chromagram?.[1] ?? 0
    case 'chromagram-d':
      return cueData.audioData.chromagram?.[2] ?? 0
    case 'chromagram-ds':
      return cueData.audioData.chromagram?.[3] ?? 0
    case 'chromagram-e':
      return cueData.audioData.chromagram?.[4] ?? 0
    case 'chromagram-f':
      return cueData.audioData.chromagram?.[5] ?? 0
    case 'chromagram-fs':
      return cueData.audioData.chromagram?.[6] ?? 0
    case 'chromagram-g':
      return cueData.audioData.chromagram?.[7] ?? 0
    case 'chromagram-gs':
      return cueData.audioData.chromagram?.[8] ?? 0
    case 'chromagram-a':
      return cueData.audioData.chromagram?.[9] ?? 0
    case 'chromagram-as':
      return cueData.audioData.chromagram?.[10] ?? 0
    case 'chromagram-b':
      return cueData.audioData.chromagram?.[11] ?? 0
    case 'detected-key':
      return cueData.audioData.detectedKey ?? ''
    case 'detected-key-strength':
      return cueData.audioData.detectedKeyStrength ?? 0
    default:
      return 0
  }
}
