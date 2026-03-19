/**
 * Data extraction utilities for the node execution engine.
 * Extracts values from CueData, AudioCueData, and configuration.
 */

import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CueData } from '../../types/cueTypes'
import { AudioCueData } from '../../types/audioCueTypes'
import { TrackedLight, LightTarget } from '../../../types'
import { YargCueDataProperty, AudioCueDataProperty } from '../../types/nodeCueTypes'
import { parsePatternPropertyId, configLightGroupToLocationGroups } from '../utils/patternUtils'

/**
 * Extract cue data value based on property (YARG or Audio mode).
 */
export function extractCueDataValue(
  property: string,
  cueData: CueData | AudioCueData,
  cueId: string,
): number | string | boolean {
  // Mode detection (YARG vs Audio)
  const isYargMode = 'lightingCue' in cueData

  if (isYargMode) {
    return extractYargCueDataValue(property as YargCueDataProperty, cueData as CueData, cueId)
  } else {
    return extractAudioCueDataValue(
      property as AudioCueDataProperty,
      cueData as AudioCueData,
      cueId,
    )
  }
}

/**
 * Extract YARG-specific cue data.
 */
export function extractYargCueDataValue(
  property: YargCueDataProperty,
  cueData: CueData,
  cueId: string,
): number | string | boolean {
  switch (property) {
    case 'cue-name':
      return cueId
    case 'cue-type':
      return cueData.lightingCue
    case 'previous-cue':
      return cueData.previousCue ?? ''
    case 'execution-count':
      return cueData.executionCount ?? 0
    case 'bpm':
      return cueData.beatsPerMinute
    case 'beat-duration-ms':
      return cueData.beatsPerMinute > 0 ? Math.round(60000 / cueData.beatsPerMinute) : 500
    case 'song-section':
      return cueData.songSection
    case 'current-scene':
      return cueData.currentScene
    case 'beat-type':
      return cueData.beat
    case 'keyframe':
      return cueData.keyframe
    case 'venue-size':
      return cueData.venueSize
    case 'guitar-note-count':
      return cueData.guitarNotes.length
    case 'bass-note-count':
      return cueData.bassNotes.length
    case 'drum-note-count':
      return cueData.drumNotes.length
    case 'keys-note-count':
      return cueData.keysNotes.length
    case 'total-score':
      return cueData.totalScore ?? 0
    case 'performer':
      return cueData.performer
    case 'bonus-effect':
      return cueData.bonusEffect
    case 'fog-state':
      return cueData.fogState
    case 'time-since-cue-start':
      return Date.now() - (cueData.cueStartTime ?? Date.now())
    case 'time-since-last-cue':
      return cueData.timeSinceLastCue ?? 0
    default:
      return 0
  }
}

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
    default:
      return 0
  }
}

/**
 * Extract config data value based on property.
 * Returns either a number (for counts) or TrackedLight[] (for arrays).
 * Uses shared constants for DRY pattern filter handling.
 */
export function extractConfigDataValue(
  property: string,
  lightManager: DmxLightManager,
): number | TrackedLight[] {
  // Handle base properties
  switch (property) {
    case 'total-lights':
      return lightManager.getLightsInGroup(['front', 'back']).length
    case 'front-lights-count':
      return lightManager.getLightsInGroup('front').length
    case 'back-lights-count':
      return lightManager.getLightsInGroup('back').length
    case 'all-lights-array':
      return lightManager.getLightsInGroup(['front', 'back'])
    case 'front-lights-array':
      return lightManager.getLightsInGroup('front')
    case 'back-lights-array':
      return lightManager.getLightsInGroup('back')
    case 'strobe-lights-array':
      return lightManager.getLightsInGroup('strobe')
  }

  // Try to parse as a pattern filter property (DRY approach)
  const parsed = parsePatternPropertyId(property)
  if (parsed) {
    const locationGroups = configLightGroupToLocationGroups(parsed.group)
    return lightManager.getLights(locationGroups, parsed.target as LightTarget)
  }

  return 0
}
