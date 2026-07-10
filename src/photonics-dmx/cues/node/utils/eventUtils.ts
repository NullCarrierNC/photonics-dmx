/**
 * Utility functions for event categories and event UI options.
 * Used by UI components (EventNodeEditor, options.ts).
 */

/**
 * Instrument notes for guitar, bass, keys
 */
const INSTRUMENT_NOTES = ['open', 'green', 'red', 'yellow', 'blue', 'orange'] as const

/**
 * Drum note types
 */
const DRUM_NOTES = [
  'kick',
  'red',
  'yellow',
  'blue',
  'green',
  'yellow-cymbal',
  'blue-cymbal',
  'green-cymbal',
] as const

/**
 * Event category definition for UI
 */
export interface EventCategory {
  category: string
  events: { value: string; label: string }[]
}

/**
 * Generate categorized YARG event options for UI dropdown
 */
export function getYargEventCategories(): EventCategory[] {
  return [
    {
      category: 'Timing',
      events: [
        { value: 'cue-started', label: 'Cue Started (once per lifecycle)' },
        { value: 'cue-called', label: 'Cue Called (every call)' },
        { value: 'beat', label: 'Beat' },
        { value: 'measure', label: 'Measure' },
        { value: 'half-beat', label: 'Half Beat' },
        { value: 'keyframe', label: 'Keyframe (any)' },
        { value: 'keyframe-first', label: 'Keyframe First' },
        { value: 'keyframe-next', label: 'Keyframe Next' },
        { value: 'keyframe-previous', label: 'Keyframe Previous' },
      ],
    },
    {
      category: 'Guitar',
      events: INSTRUMENT_NOTES.map((note) => ({
        value: `guitar-${note}`,
        label: note.charAt(0).toUpperCase() + note.slice(1),
      })),
    },
    {
      category: 'Bass',
      events: INSTRUMENT_NOTES.map((note) => ({
        value: `bass-${note}`,
        label: note.charAt(0).toUpperCase() + note.slice(1),
      })),
    },
    {
      category: 'Keys',
      events: INSTRUMENT_NOTES.map((note) => ({
        value: `keys-${note}`,
        label: note.charAt(0).toUpperCase() + note.slice(1),
      })),
    },
    {
      category: 'Drums',
      events: DRUM_NOTES.map((note) => ({
        value: `drum-${note}`,
        label: note
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
      })),
    },
    {
      category: 'Vocals',
      events: [
        { value: 'vocal-note', label: 'Vocal Note On' },
        { value: 'vocal-note-off', label: 'Vocal Note Off' },
      ],
    },
  ]
}

/** RB3 StageKit LED-on/off and fog edge events (values are valid YargEventType wait conditions). */
function rb3StageKitEvents(): { value: string; label: string }[] {
  return [
    ...Array.from({ length: 8 }, (_, i) => ({
      value: `led-${i + 1}`,
      label: `LED ${i + 1} On`,
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      value: `led-${i + 1}-off`,
      label: `LED ${i + 1} Off`,
    })),
    { value: 'fog-on', label: 'Fog On' },
    { value: 'fog-off', label: 'Fog Off' },
  ]
}

/**
 * Categorized event options for RB3 cue mode. RB3 graphs are YARG-shaped, but the StageKit packet
 * stream only ever yields the lifecycle events plus LED/fog edges — so the vocabulary is curated to
 * exactly those; the beat/measure/instrument events in the YARG set never fire under RB3.
 */
export function getRb3EventCategories(): EventCategory[] {
  return [
    {
      category: 'Timing',
      events: [
        { value: 'cue-started', label: 'Cue Started (once per lifecycle)' },
        { value: 'cue-called', label: 'Cue Called (every call)' },
      ],
    },
    {
      category: 'RB3 StageKit',
      events: rb3StageKitEvents(),
    },
  ]
}
