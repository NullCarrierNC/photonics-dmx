/**
 * Property metadata for cue data nodes.
 * Single source of truth for labels, types, and valid values (for constrained dropdowns).
 */

import {
  CueType,
  BEAT_TYPES,
  SCENE_VALUES,
  SONG_SECTIONS,
  VENUE_SIZES,
} from '../cues/types/cueTypes'

export interface CueDataPropertyMeta {
  id: string
  label: string
  type: 'number' | 'boolean' | 'string' | 'cue-type'
  validValues?: readonly string[]
  category?: string
}

const CUE_TYPE_VALUES = Object.values(CueType) as string[]

export const YARG_CUE_DATA_PROPERTY_META: CueDataPropertyMeta[] = [
  { id: 'cue-name', label: 'Cue Name', type: 'string' },
  { id: 'cue-type', label: 'Cue Type', type: 'cue-type', validValues: CUE_TYPE_VALUES },
  { id: 'previous-cue', label: 'Previous Cue', type: 'cue-type', validValues: CUE_TYPE_VALUES },
  { id: 'execution-count', label: 'Execution Count', type: 'number' },
  { id: 'bpm', label: 'BPM', type: 'number' },
  { id: 'beat-duration-ms', label: 'Beat Duration (ms)', type: 'number' },
  { id: 'song-section', label: 'Song Section', type: 'string', validValues: [...SONG_SECTIONS] },
  {
    id: 'current-scene',
    label: 'Current Scene',
    type: 'string',
    validValues: [...SCENE_VALUES],
  },
  { id: 'beat-type', label: 'Beat Type', type: 'string', validValues: [...BEAT_TYPES] },
  { id: 'keyframe', label: 'Keyframe', type: 'string' },
  { id: 'venue-size', label: 'Venue Size', type: 'string', validValues: [...VENUE_SIZES] },
  { id: 'guitar-note-count', label: 'Guitar Note Count', type: 'number' },
  { id: 'bass-note-count', label: 'Bass Note Count', type: 'number' },
  { id: 'drum-note-count', label: 'Drum Note Count', type: 'number' },
  { id: 'keys-note-count', label: 'Keys Note Count', type: 'number' },
  { id: 'total-score', label: 'Total Score', type: 'number' },
  { id: 'performer', label: 'Performer', type: 'number' },
  { id: 'bonus-effect', label: 'Bonus Effect', type: 'boolean' },
  { id: 'fog-state', label: 'Fog State', type: 'boolean' },
  { id: 'time-since-cue-start', label: 'Time Since Cue Start', type: 'number' },
  { id: 'time-since-last-cue', label: 'Time Since Last Cue', type: 'number' },
]

/** Lookup map: property id -> metadata */
export const YARG_CUE_DATA_PROPERTY_MAP = new Map<string, CueDataPropertyMeta>(
  YARG_CUE_DATA_PROPERTY_META.map((m) => [m.id, m]),
)

/** Audio cue data properties have numeric/boolean types; no constrained string enums in the current schema. */
export const AUDIO_CUE_DATA_PROPERTY_META: CueDataPropertyMeta[] = [
  { id: 'cue-name', label: 'Cue Name', type: 'string' },
  { id: 'cue-type-id', label: 'Cue Type ID', type: 'string' },
  { id: 'execution-count', label: 'Execution Count', type: 'number' },
  { id: 'timestamp', label: 'Timestamp', type: 'number' },
  { id: 'overall-level', label: 'Overall Audio Level', type: 'number' },
  { id: 'bpm', label: 'BPM', type: 'number' },
  { id: 'beat-detected', label: 'Beat Detected', type: 'boolean' },
  { id: 'energy', label: 'Energy', type: 'number' },
  { id: 'freq-range1', label: 'Frequency Range 1', type: 'number' },
  { id: 'freq-range2', label: 'Frequency Range 2', type: 'number' },
  { id: 'freq-range3', label: 'Frequency Range 3', type: 'number' },
  { id: 'freq-range4', label: 'Frequency Range 4', type: 'number' },
  { id: 'freq-range5', label: 'Frequency Range 5', type: 'number' },
  { id: 'enabled-band-count', label: 'Enabled Band Count', type: 'number' },
]

/** Lookup map: property id -> metadata */
export const AUDIO_CUE_DATA_PROPERTY_MAP = new Map<string, CueDataPropertyMeta>(
  AUDIO_CUE_DATA_PROPERTY_META.map((m) => [m.id, m]),
)

/** Get metadata for a YARG cue data property id. */
export function getYargCueDataPropertyMeta(propertyId: string): CueDataPropertyMeta | undefined {
  return YARG_CUE_DATA_PROPERTY_MAP.get(propertyId)
}

/** Get metadata for an Audio cue data property id. */
export function getAudioCueDataPropertyMeta(propertyId: string): CueDataPropertyMeta | undefined {
  return AUDIO_CUE_DATA_PROPERTY_MAP.get(propertyId)
}
