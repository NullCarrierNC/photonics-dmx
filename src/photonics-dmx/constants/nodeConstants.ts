/**
 * Shared constants for the node system.
 * Single source of truth for pattern filters, event categories, and config data properties.
 */

import type { LocationGroup } from '../types';

// ============================================================================
// Light Pattern Filters
// ============================================================================

/**
 * Light targets used for pattern filtering (static filters only, excludes linear/random)
 */
export const PATTERN_TARGETS = [
  'all', 'even', 'odd',
  'half-1', 'half-2',
  'outter-half-major', 'outter-half-minor',
  'inner-half-major', 'inner-half-minor',
  'third-1', 'third-2', 'third-3',
  'quarter-1', 'quarter-2', 'quarter-3', 'quarter-4'
] as const;

export type PatternTarget = typeof PATTERN_TARGETS[number];

/**
 * Location groups for light patterns
 */
export const PATTERN_GROUPS = ['front', 'back', 'front-back'] as const;
export type PatternGroup = typeof PATTERN_GROUPS[number];

/**
 * Generate a pattern property ID from group and target
 */
export function getPatternPropertyId(group: PatternGroup, target: PatternTarget): string {
  return `${group}-lights-${target}`;
}

/**
 * Parse a pattern property ID into group and target
 */
export function parsePatternPropertyId(propertyId: string): { group: PatternGroup; target: PatternTarget } | null {
  for (const group of PATTERN_GROUPS) {
    const prefix = `${group}-lights-`;
    if (propertyId.startsWith(prefix)) {
      const target = propertyId.slice(prefix.length) as PatternTarget;
      if (PATTERN_TARGETS.includes(target)) {
        return { group, target };
      }
    }
  }
  return null;
}

/**
 * All pattern filter property IDs, generated from groups × targets
 */
export const PATTERN_FILTER_PROPERTIES = PATTERN_GROUPS.flatMap(group =>
  PATTERN_TARGETS.map(target => getPatternPropertyId(group, target))
);

/**
 * Map pattern group to LocationGroup array
 */
export function patternGroupToLocationGroups(group: PatternGroup): LocationGroup[] {
  switch (group) {
    case 'front': return ['front'];
    case 'back': return ['back'];
    case 'front-back': return ['front', 'back'];
  }
}

// ============================================================================
// Config Data Properties
// ============================================================================

/**
 * Base config data properties (counts and arrays)
 */
export const BASE_CONFIG_DATA_PROPERTIES = [
  'total-lights',
  'front-lights-count',
  'back-lights-count',
  'front-lights-array',
  'back-lights-array',
  'front-back-lights-array'
] as const;

/**
 * All config data properties including pattern filters
 */
export const ALL_CONFIG_DATA_PROPERTIES = [
  ...BASE_CONFIG_DATA_PROPERTIES,
  ...PATTERN_FILTER_PROPERTIES
] as const;

/**
 * Config data property metadata for UI display
 */
export interface ConfigDataPropertyMeta {
  id: string;
  label: string;
  type: 'number' | 'light-array';
  category?: string;
}

/**
 * Generate UI metadata for config data properties
 */
export function getConfigDataPropertiesMeta(): ConfigDataPropertyMeta[] {
  const result: ConfigDataPropertyMeta[] = [
    { id: 'total-lights', label: 'Total Lights', type: 'number' },
    { id: 'front-lights-count', label: 'Front Lights Count', type: 'number' },
    { id: 'back-lights-count', label: 'Back Lights Count', type: 'number' },
    { id: 'front-lights-array', label: 'Front Lights Array', type: 'light-array' },
    { id: 'back-lights-array', label: 'Back Lights Array', type: 'light-array' },
    { id: 'front-back-lights-array', label: 'Front & Back Lights Array', type: 'light-array' }
  ];

  // Add pattern filter properties
  for (const group of PATTERN_GROUPS) {
    const groupLabel = group === 'front-back' ? 'Front & Back' : group.charAt(0).toUpperCase() + group.slice(1);
    
    for (const target of PATTERN_TARGETS) {
      const targetLabel = target.charAt(0).toUpperCase() + target.slice(1).replace(/-/g, ' ');
      result.push({
        id: getPatternPropertyId(group, target),
        label: `${groupLabel} Lights - ${targetLabel}`,
        type: 'light-array',
        category: `${groupLabel} Patterns`
      });
    }
  }

  return result;
}

// ============================================================================
// Event Categories
// ============================================================================

/**
 * Instrument event types for guitar, bass, keys
 */
export const INSTRUMENT_NOTES = ['open', 'green', 'red', 'yellow', 'blue', 'orange'] as const;
export type InstrumentNote = typeof INSTRUMENT_NOTES[number];

/**
 * Drum event types
 */
export const DRUM_NOTES = ['kick', 'red', 'yellow', 'blue', 'green', 'yellow-cymbal', 'blue-cymbal', 'green-cymbal'] as const;
export type DrumNote = typeof DRUM_NOTES[number];

/**
 * Event category definition
 */
export interface EventCategory {
  category: string;
  events: { value: string; label: string }[];
}

/**
 * Generate categorized YARG event options for UI
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

/**
 * All instrument event type strings
 */
export const ALL_INSTRUMENT_EVENTS = [
  // Guitar
  ...INSTRUMENT_NOTES.map(n => `guitar-${n}`),
  // Bass
  ...INSTRUMENT_NOTES.map(n => `bass-${n}`),
  // Keys
  ...INSTRUMENT_NOTES.map(n => `keys-${n}`),
  // Drums
  ...DRUM_NOTES.map(n => `drum-${n}`)
] as const;

// ============================================================================
// Cue Data Properties
// ============================================================================

/**
 * YARG cue data properties
 */
export const YARG_CUE_DATA_PROPERTIES = [
  'cue-name', 'cue-type', 'execution-count', 'bpm', 'song-section',
  'current-scene', 'beat-type', 'keyframe', 'venue-size', 'guitar-note-count',
  'bass-note-count', 'drum-note-count', 'keys-note-count',
  'total-score', 'performer', 'bonus-effect', 'fog-state',
  'time-since-cue-start', 'time-since-last-cue'
] as const;

/**
 * Audio cue data properties
 */
export const AUDIO_CUE_DATA_PROPERTIES = [
  'cue-name', 'cue-type-id', 'execution-count', 'timestamp',
  'overall-level', 'bpm', 'beat-detected', 'energy',
  'freq-range1', 'freq-range2', 'freq-range3', 'freq-range4', 'freq-range5',
  'enabled-band-count'
] as const;
