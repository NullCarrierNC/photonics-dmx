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

/**
 * RB3 StageKit LED / effect state. Authored only in RB3 cues (the StageKit packet stream fills these);
 * shared here so the RB3 dropdown list and the YARG lookup map both reference the same definitions.
 */
const LED_STATE_PROPERTIES: CueDataPropertyMeta[] = [
  { id: 'led-color', label: 'LED Colour', type: 'string' },
  { id: 'led-states', label: 'LED States (mask 0-255)', type: 'number' },
  { id: 'led-count', label: 'LED Count (lit)', type: 'number' },
  { id: 'led-red-states', label: 'LED Red Mask', type: 'number' },
  { id: 'led-green-states', label: 'LED Green Mask', type: 'number' },
  { id: 'led-blue-states', label: 'LED Blue Mask', type: 'number' },
  { id: 'led-yellow-states', label: 'LED Yellow Mask', type: 'number' },
  { id: 'led-1-on', label: 'LED 1 On', type: 'boolean' },
  { id: 'led-2-on', label: 'LED 2 On', type: 'boolean' },
  { id: 'led-3-on', label: 'LED 3 On', type: 'boolean' },
  { id: 'led-4-on', label: 'LED 4 On', type: 'boolean' },
  { id: 'led-5-on', label: 'LED 5 On', type: 'boolean' },
  { id: 'led-6-on', label: 'LED 6 On', type: 'boolean' },
  { id: 'led-7-on', label: 'LED 7 On', type: 'boolean' },
  { id: 'led-8-on', label: 'LED 8 On', type: 'boolean' },
  { id: 'led-1-color', label: 'LED 1 Colour', type: 'string' },
  { id: 'led-2-color', label: 'LED 2 Colour', type: 'string' },
  { id: 'led-3-color', label: 'LED 3 Colour', type: 'string' },
  { id: 'led-4-color', label: 'LED 4 Colour', type: 'string' },
  { id: 'led-5-color', label: 'LED 5 Colour', type: 'string' },
  { id: 'led-6-color', label: 'LED 6 Colour', type: 'string' },
  { id: 'led-7-color', label: 'LED 7 Colour', type: 'string' },
  { id: 'led-8-color', label: 'LED 8 Colour', type: 'string' },
]

/**
 * YARG cue-data properties shown in the YARG editor's cue-data dropdown. The LED/StageKit state is
 * deliberately excluded (it never populates from a YARG datagram) — it lives on RB3 cues instead.
 */
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
  { id: 'strobe-state', label: 'Strobe State', type: 'string' },
]

/**
 * RB3 cue-data properties shown in the RB3 editor's cue-data dropdown: the StageKit LED/effect state
 * plus the generic frame fields that carry meaning under an RB3 gameplay frame. The YARG-song
 * properties (bpm, note counts, score, venue, beat/keyframe, …) are excluded — they never populate.
 */
export const RB3_CUE_DATA_PROPERTY_META: CueDataPropertyMeta[] = [
  { id: 'cue-name', label: 'Cue Name', type: 'string' },
  { id: 'cue-type', label: 'Cue Type', type: 'cue-type', validValues: CUE_TYPE_VALUES },
  { id: 'previous-cue', label: 'Previous Cue', type: 'cue-type', validValues: CUE_TYPE_VALUES },
  { id: 'execution-count', label: 'Execution Count', type: 'number' },
  {
    id: 'current-scene',
    label: 'Current Scene',
    type: 'string',
    validValues: [...SCENE_VALUES],
  },
  { id: 'fog-state', label: 'Fog State', type: 'boolean' },
  { id: 'time-since-cue-start', label: 'Time Since Cue Start', type: 'number' },
  { id: 'time-since-last-cue', label: 'Time Since Last Cue', type: 'number' },
  ...LED_STATE_PROPERTIES,
  { id: 'strobe-state', label: 'Strobe State', type: 'string' },
]

/**
 * Lookup map: property id -> metadata. The UNION of the YARG and RB3 lists (the LED block resolves
 * even though it's hidden from the YARG dropdown), so `getYargCueDataPropertyMeta` resolves any id a
 * mode-`yarg`/`rb3` file may carry — validValues sync and legacy nodes keep working. The lists drive
 * the per-mode dropdowns; this map is the resolution superset.
 */
export const YARG_CUE_DATA_PROPERTY_MAP = new Map<string, CueDataPropertyMeta>(
  [...YARG_CUE_DATA_PROPERTY_META, ...LED_STATE_PROPERTIES].map((m) => [m.id, m]),
)

/** Audio cue data properties: global frame data and trigger-specific context. */
export const AUDIO_CUE_DATA_PROPERTY_META: CueDataPropertyMeta[] = [
  { id: 'cue-name', label: 'Cue Name', type: 'string' },
  { id: 'cue-type-id', label: 'Cue Type ID', type: 'string' },
  { id: 'execution-count', label: 'Execution Count', type: 'number' },
  { id: 'timestamp', label: 'Timestamp', type: 'number' },
  { id: 'overall-level', label: 'Overall Audio Level', type: 'number' },
  { id: 'bpm', label: 'BPM', type: 'number' },
  { id: 'beat-detected', label: 'Beat Detected', type: 'boolean' },
  { id: 'energy', label: 'Energy', type: 'number' },
  { id: 'enabled-band-count', label: 'Enabled Band Count', type: 'number' },
  { id: 'audio-amplitude', label: 'Amplitude', type: 'number' },
  { id: 'audio-energy', label: 'Energy', type: 'number' },
  { id: 'audio-peak-frequency', label: 'Peak Frequency (Hz)', type: 'number' },
  { id: 'audio-bpm', label: 'BPM', type: 'number' },
  { id: 'audio-beat-duration-ms', label: 'Beat Duration (ms)', type: 'number' },
  { id: 'audio-beat-detected', label: 'Beat Detected', type: 'boolean' },
  { id: 'audio-overall-level', label: 'Overall Level', type: 'number' },
  { id: 'trigger-level', label: 'Trigger Level', type: 'number' },
  { id: 'trigger-frequency-min', label: 'Trigger Freq Min', type: 'number' },
  { id: 'trigger-frequency-max', label: 'Trigger Freq Max', type: 'number' },
  { id: 'trigger-peak-frequency', label: 'Trigger Peak Freq (Hz)', type: 'number' },
  { id: 'trigger-band-amplitude', label: 'Trigger Band Amplitude', type: 'number' },
  {
    id: 'trigger-band-flatness',
    label: 'Trigger Band Flatness (matched band)',
    type: 'number',
    category: 'trigger',
  },
  {
    id: 'trigger-band-crest',
    label: 'Trigger Band Crest (matched band)',
    type: 'number',
    category: 'trigger',
  },
  {
    id: 'trigger-band-centroid',
    label: 'Trigger Band Centroid (matched band)',
    type: 'number',
    category: 'trigger',
  },
  {
    id: 'trigger-band-onset',
    label: 'Trigger Band Onset (matched band)',
    type: 'number',
    category: 'trigger',
  },
  { id: 'event-raw-value', label: 'Event Raw Value', type: 'number', category: 'event' },
  {
    id: 'spectral-centroid',
    label: 'Spectral Centroid (Brightness)',
    type: 'number',
    category: 'spectral',
  },
  {
    id: 'spectral-flatness',
    label: 'Spectral Flatness (Noise/Tonal)',
    type: 'number',
    category: 'spectral',
  },
  { id: 'spectral-rolloff', label: 'Spectral Rolloff', type: 'number', category: 'spectral' },
  { id: 'spectral-crest', label: 'Spectral Crest', type: 'number', category: 'spectral' },
  { id: 'spectral-spread', label: 'Spectral Spread', type: 'number', category: 'spectral' },
  { id: 'hfc-onset', label: 'HFC Onset', type: 'number', category: 'spectral' },
  { id: 'zero-crossing-rate', label: 'Zero-Crossing Rate', type: 'number', category: 'spectral' },
  { id: 'chromagram-c', label: 'Chromagram C', type: 'number', category: 'chroma' },
  { id: 'chromagram-cs', label: 'Chromagram C#', type: 'number', category: 'chroma' },
  { id: 'chromagram-d', label: 'Chromagram D', type: 'number', category: 'chroma' },
  { id: 'chromagram-ds', label: 'Chromagram D#', type: 'number', category: 'chroma' },
  { id: 'chromagram-e', label: 'Chromagram E', type: 'number', category: 'chroma' },
  { id: 'chromagram-f', label: 'Chromagram F', type: 'number', category: 'chroma' },
  { id: 'chromagram-fs', label: 'Chromagram F#', type: 'number', category: 'chroma' },
  { id: 'chromagram-g', label: 'Chromagram G', type: 'number', category: 'chroma' },
  { id: 'chromagram-gs', label: 'Chromagram G#', type: 'number', category: 'chroma' },
  { id: 'chromagram-a', label: 'Chromagram A', type: 'number', category: 'chroma' },
  { id: 'chromagram-as', label: 'Chromagram A#', type: 'number', category: 'chroma' },
  { id: 'chromagram-b', label: 'Chromagram B', type: 'number', category: 'chroma' },
  { id: 'detected-key', label: 'Detected Key', type: 'string' },
  { id: 'detected-key-strength', label: 'Detected Key Strength', type: 'number' },
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
