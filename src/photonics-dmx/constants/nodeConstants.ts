/**
 * Shared constants for the node system.
 * Single source of truth for pattern filters, light groups, and cue data properties.
 */

import type { LocationGroup } from '../types';

// ============================================================================
// Light Pattern Filters
// ============================================================================

/**
 * Light targets used for pattern filtering (static filters only, excludes linear/random)
 * Note: 'all' is excluded since we have explicit array properties (all-lights-array, front-lights-array, back-lights-array)
 */
export const PATTERN_TARGETS = [
  'even', 'odd',
  'half-1', 'half-2',
  'outter-half-major', 'outter-half-minor',
  'inner-half-major', 'inner-half-minor',
  'third-1', 'third-2', 'third-3',
  'quarter-1', 'quarter-2', 'quarter-3', 'quarter-4'
] as const;

export type PatternTarget = typeof PATTERN_TARGETS[number];

/**
 * Location groups for config data light patterns.
 * Derived from LocationGroup, excludes 'strobe' since strobes are handled separately.
 */
export const CONFIG_LIGHT_GROUPS = (['front', 'back'] as const) satisfies readonly LocationGroup[];
export type ConfigLightGroup = typeof CONFIG_LIGHT_GROUPS[number];

// Helper to generate pattern property IDs (used only for constant generation)
const makePatternPropertyId = (group: ConfigLightGroup, target: PatternTarget): string =>
  `${group}-lights-${target}`;

/**
 * All pattern filter property IDs, generated from groups × targets
 */
export const PATTERN_FILTER_PROPERTIES = CONFIG_LIGHT_GROUPS.flatMap(group =>
  PATTERN_TARGETS.map(target => makePatternPropertyId(group, target))
);

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
  'all-lights-array',
  'front-lights-array',
  'back-lights-array'
] as const;

/**
 * All config data properties including pattern filters
 */
export const ALL_CONFIG_DATA_PROPERTIES = [
  ...BASE_CONFIG_DATA_PROPERTIES,
  ...PATTERN_FILTER_PROPERTIES
] as const;

// ============================================================================
// Cue Data Properties
// ============================================================================

/**
 * YARG cue data properties
 */
export const YARG_CUE_DATA_PROPERTIES = [
  'cue-name', 'cue-type', 'execution-count', 'bpm', 'beat-duration-ms', 'song-section',
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
