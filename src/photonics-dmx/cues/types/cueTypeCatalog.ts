/**
 * The cue types themselves, plus the strobe and non-driving classifications.
 */

/**
 * Enum representing different lighting cues.
 */
export enum CueType {
  BigRockEnding = 'BigRockEnding',
  Blackout_Fast = 'Blackout_Fast',
  Blackout_Slow = 'Blackout_Slow',
  Blackout_Spotlight = 'Blackout_Spotlight',
  Chorus = 'Chorus',
  Cool_Manual = 'Cool_Manual',
  Cool_Automatic = 'Cool_Automatic',
  Default = 'Default',
  Dischord = 'Dischord',
  Fallback = 'Fallback',
  Flare_Fast = 'Flare_Fast',
  Flare_Slow = 'Flare_Slow',
  Frenzy = 'Frenzy',
  Harmony = 'Harmony',
  Intro = 'Intro',
  Keyframe_First = 'Keyframe_First',
  Keyframe_Next = 'Keyframe_Next',
  Keyframe_Previous = 'Keyframe_Previous',
  Menu = 'Menu',
  Score = 'Score',
  Searchlights = 'Searchlights',
  Silhouettes = 'Silhouettes',
  Silhouettes_Spotlight = 'Silhouettes_Spotlight',
  Stomp = 'Stomp',
  Strobe_Fastest = 'Strobe_Fastest',
  Strobe_Fast = 'Strobe_Fast',
  Strobe_Medium = 'Strobe_Medium',
  Strobe_Slow = 'Strobe_Slow',
  Strobe_Off = 'Strobe_Off',
  Solo = 'Solo',
  Sweep = 'Sweep',
  Verse = 'Verse',
  Warm_Automatic = 'Warm_Automatic',
  Warm_Manual = 'Warm_Manual',
  NoCue = 'NoCue',
  Unknown = 'UnknownCue',
  Strobe = 'Strobe', // RB3 has a discreet strobe cue
  DisableAll = 'DisableAll', // RB3 has a discreet disable all cue
  RB3 = 'RB3', // RB3 cue mode: the always-active gameplay cue driven by StageKit LED state
}

/** All valid {@link CueType} string values, for membership checks against wire data. */
const CUE_TYPE_VALUES: ReadonlySet<string> = new Set<string>(Object.values(CueType))

/** True if `value` is a known {@link CueType}. Used to drop unrecognised wire cue values. */
export function isCueType(value: string): value is CueType {
  return CUE_TYPE_VALUES.has(value)
}

/**
 * Discrete strobe-speed slots used by hardware-strobe-channel fixtures. Maps each YARG/RB3 strobe
 * cue to the per-fixture `strobeValues` entry written to the fixture's strobe DMX channel.
 */
export type StrobeSpeedSlot = 'slow' | 'medium' | 'fast' | 'fastest'

/** Strobe cue types - all "active strobe" variants plus the off signal. */
export const STROBE_CUE_TYPES: readonly CueType[] = [
  CueType.Strobe_Fastest,
  CueType.Strobe_Fast,
  CueType.Strobe_Medium,
  CueType.Strobe_Slow,
  CueType.Strobe_Off,
] as const

/** True for any strobe cue including the off signal. */
export function isStrobeCueType(cueType: CueType): boolean {
  return STROBE_CUE_TYPES.includes(cueType)
}

/**
 * Cues that signal "no real lighting" - YARG sends a fast blackout or an explicit no-cue when a
 * song has no lighting to drive. The YARG Fallback treats a *continuing run* of these as
 * non-driving (the first one after a real cue still resets the window), so it can take over when a
 * song streams them past the window.
 */
export const NON_DRIVING_CUE_TYPES: readonly CueType[] = [
  CueType.Blackout_Fast,
  CueType.NoCue,
] as const

/** True for cues that signal "no real lighting" (see NON_DRIVING_CUE_TYPES). */
export function isNonDrivingCueType(cueType: CueType): boolean {
  return NON_DRIVING_CUE_TYPES.includes(cueType)
}

/**
 * Cues that belong to YARG's own screens rather than to a chart. YARG keeps reporting the menu cue
 * for the opening frames of a song, until the chart's first lighting event, so one of these arriving
 * while a song is on screen describes a screen the player has already left.
 */
export const MENU_SIDE_CUE_TYPES: readonly CueType[] = [CueType.Menu, CueType.Score] as const

/** True for cues that belong to a YARG screen rather than a chart (see MENU_SIDE_CUE_TYPES). */
export function isMenuSideCueType(cueType: CueType): boolean {
  return MENU_SIDE_CUE_TYPES.includes(cueType)
}

/**
 * Cues the cue handler acts on itself (blackouts, the strobe off signal, keyframes). No library
 * implementation runs for them, so every library can play them.
 */
const HANDLER_OWNED_CUE_TYPES = [
  CueType.Blackout_Fast,
  CueType.Blackout_Spotlight,
  CueType.NoCue,
  CueType.Blackout_Slow,
  CueType.Strobe_Off,
  CueType.Keyframe_First,
  CueType.Keyframe_Next,
  CueType.Keyframe_Previous,
] as const

type HandlerOwnedCueType = (typeof HANDLER_OWNED_CUE_TYPES)[number]

const HANDLER_OWNED_CUE_TYPE_SET: ReadonlySet<CueType> = new Set(HANDLER_OWNED_CUE_TYPES)

/** True for cues the cue handler acts on itself (see HANDLER_OWNED_CUE_TYPES). */
export function isHandlerOwnedCueType(cueType: CueType): cueType is HandlerOwnedCueType {
  return HANDLER_OWNED_CUE_TYPE_SET.has(cueType)
}

/**
 * Maps a strobe CueType to its speed slot. Returns null for {@link CueType.Strobe_Off} and any
 * non-strobe cue type.
 */
export function cueTypeToStrobeSlot(cueType: CueType): StrobeSpeedSlot | null {
  switch (cueType) {
    case CueType.Strobe_Slow:
      return 'slow'
    case CueType.Strobe_Medium:
      return 'medium'
    case CueType.Strobe_Fast:
      return 'fast'
    case CueType.Strobe_Fastest:
      return 'fastest'
    default:
      return null
  }
}

export const lightingCueMap: Record<number, CueType> = {
  0: CueType.Default,
  1: CueType.Dischord,
  2: CueType.Chorus,
  3: CueType.Cool_Manual,
  4: CueType.Stomp,
  5: CueType.Verse,
  6: CueType.Warm_Manual,
  7: CueType.BigRockEnding,
  8: CueType.Blackout_Fast,
  9: CueType.Blackout_Slow,
  10: CueType.Blackout_Spotlight,
  11: CueType.Cool_Automatic,
  12: CueType.Flare_Fast,
  13: CueType.Flare_Slow,
  14: CueType.Frenzy,
  15: CueType.Intro,
  16: CueType.Harmony,
  17: CueType.Silhouettes,
  18: CueType.Silhouettes_Spotlight,
  19: CueType.Searchlights,
  20: CueType.Strobe_Fastest,
  21: CueType.Strobe_Fast,
  22: CueType.Strobe_Medium,
  23: CueType.Strobe_Slow,
  24: CueType.Strobe_Off,
  25: CueType.Sweep,
  26: CueType.Warm_Automatic,
  27: CueType.Keyframe_First,
  28: CueType.Keyframe_Next,
  29: CueType.Keyframe_Previous,
  30: CueType.Menu,
  31: CueType.Score,
  32: CueType.NoCue,
}

/**
 * Reference to one registered motion program: the group it lives in and its cue id. Every domain
 * (game and audio) picks motion the same way, so they all point at this shape.
 */
export type MotionCueRef = { groupId: string; cueId: string }
