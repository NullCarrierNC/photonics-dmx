/**
 * Utility functions for event categories and event UI options.
 * Used by UI components (EventNodeEditor, options.ts).
 */

/**
 * Instrument notes for guitar, bass, keys
 */
const INSTRUMENT_NOTES = ['open', 'green', 'red', 'yellow', 'blue', 'orange'] as const;

/**
 * Drum note types
 */
const DRUM_NOTES = ['kick', 'red', 'yellow', 'blue', 'green', 'yellow-cymbal', 'blue-cymbal', 'green-cymbal'] as const;

/**
 * Event category definition for UI
 */
export interface EventCategory {
  category: string;
  events: { value: string; label: string }[];
}

/**
 * Generate categorized YARG event options for UI dropdown
 */
export function getYargEventCategories(): EventCategory[] {
  return [
    {
      category: 'Timing',
      events: [
        { value: 'cue-started', label: 'Cue Started' },
        { value: 'beat', label: 'Beat' },
        { value: 'measure', label: 'Measure' },
        { value: 'half-beat', label: 'Half Beat' },
        { value: 'keyframe', label: 'Keyframe' }
      ]
    },
    {
      category: 'Guitar',
      events: INSTRUMENT_NOTES.map(note => ({
        value: `guitar-${note}`,
        label: note.charAt(0).toUpperCase() + note.slice(1)
      }))
    },
    {
      category: 'Bass',
      events: INSTRUMENT_NOTES.map(note => ({
        value: `bass-${note}`,
        label: note.charAt(0).toUpperCase() + note.slice(1)
      }))
    },
    {
      category: 'Keys',
      events: INSTRUMENT_NOTES.map(note => ({
        value: `keys-${note}`,
        label: note.charAt(0).toUpperCase() + note.slice(1)
      }))
    },
    {
      category: 'Drums',
      events: DRUM_NOTES.map(note => ({
        value: `drum-${note}`,
        label: note.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      }))
    }
  ];
}
