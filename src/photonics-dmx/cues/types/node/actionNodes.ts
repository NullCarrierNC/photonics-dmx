/**
 * Actions a graph performs: colour, position, motion patterns and their timing.
 */
import type { NodeCueKind } from './graph'
import type { ValueSource } from './variables'

export const NODE_EFFECT_TYPES = [
  'set-color',
  'set-position',
  'motion-pattern',
  'blackout',
] as const

export type NodeEffectType = (typeof NODE_EFFECT_TYPES)[number]

export const LIGHTING_EFFECT_TYPES = ['set-color', 'blackout'] as const

export const MOTION_EFFECT_TYPES = ['set-position', 'motion-pattern'] as const

export const getEffectTypesForCueKind = (kind: NodeCueKind): readonly NodeEffectType[] =>
  kind === 'motion' ? MOTION_EFFECT_TYPES : LIGHTING_EFFECT_TYPES

export const WAVEFORM_TYPES = ['sine', 'cosine', 'triangle', 'sawtooth', 'square'] as const

export type WaveformType = (typeof WAVEFORM_TYPES)[number]

export const MOTION_PATTERN_TYPES = [
  'circle',
  'figure-8',
  'pendulum',
  'linear-sweep',
  'custom',
] as const

export type MotionPatternType = (typeof MOTION_PATTERN_TYPES)[number]

export const LINEAR_SWEEP_AXES = ['horizontal', 'vertical'] as const

/** For linear-sweep preset: which axis oscillates. */
export type LinearSweepAxis = (typeof LINEAR_SWEEP_AXES)[number]

/**
 * Parametric motion: continuous pan/tilt from waveforms (see MotionPatternEngine).
 * Speed is Hz, size is peak offset in degrees from home, and fanSpread staggers phase across fixtures.
 */
export interface NodeMotionPatternSetting {
  pattern: ValueSource
  speed: ValueSource
  size: ValueSource
  /**
   * `circle` only (near vertical home): stage bearing for the feasible orbit when the home-centred
   * circle would enclose the tilt pole. Named directions or degrees (same as set-position direction).
   */
  bearing?: ValueSource
  fanSpread?: ValueSource
  /** linear-sweep only: pan oscillates (horizontal) or tilt oscillates (vertical). */
  linearSweepAxis?: ValueSource
  panWaveform?: ValueSource
  tiltWaveform?: ValueSource
  panAmplitude?: ValueSource
  tiltAmplitude?: ValueSource
  panPhaseOffset?: ValueSource
  /** When true, orbit direction is reversed (e.g. counter-clockwise circle vs clockwise). */
  reverse?: ValueSource
}

export interface NodeActionTarget {
  groups: ValueSource // Can reference a string variable containing comma-separated groups
  filter: ValueSource // Can reference a string variable with filter name
}

export interface NodeColorSetting {
  name: ValueSource // Can reference a string variable with color name
  brightness: ValueSource // Can reference a string variable with brightness level
  blendMode?: ValueSource // Can reference a string variable with blend mode
  opacity?: ValueSource // Can reference a number variable with opacity (0.0-1.0)
}

/** How a set-position action specifies aim: stage direction, degree offsets from home, or legacy absolute %. */
export type PositionMode = 'direction' | 'offset' | 'absolute'

/**
 * Motion position for set-position actions.
 *
 * - `direction`: bearing (named stage directions or degrees) + angle from vertical in degrees.
 * - `offset`: signed pan/tilt offsets in degrees from fixture home.
 * - `absolute` (legacy): pan/tilt as normalised 0-100% of configured min-max (no home-relative offset).
 *
 * When `mode` is omitted but `pan` and `tilt` are present, behaviour is legacy `absolute`.
 */
export interface NodePositionSetting {
  mode?: PositionMode
  /** Direction mode: stage direction name or degrees (ValueSource resolves to string or number). */
  bearing?: ValueSource
  /** Direction mode: degrees from vertical (positive = away from vertical). */
  angle?: ValueSource
  /** Offset mode (degrees from home) or absolute mode (legacy 0-100 %). */
  pan?: ValueSource
  /** Offset mode (degrees from home) or absolute mode (legacy 0-100 %). */
  tilt?: ValueSource
}

export interface ActionTimingConfig {
  waitForCondition: ValueSource
  waitForTime: ValueSource
  waitForConditionCount?: ValueSource
  duration: ValueSource
  waitUntilCondition: ValueSource
  waitUntilTime: ValueSource
  waitUntilConditionCount?: ValueSource
  easing?: ValueSource
  level?: ValueSource
}

export interface NodeActionConfig {
  custom?: Record<string, unknown>
}

export const createDefaultActionTiming = (): ActionTimingConfig => ({
  waitForCondition: { source: 'literal', value: 'none' },
  waitForTime: { source: 'literal', value: 0 },
  duration: { source: 'literal', value: 200 },
  waitUntilCondition: { source: 'literal', value: 'none' },
  waitUntilTime: { source: 'literal', value: 0 },
  easing: { source: 'literal', value: 'linear' },
  level: { source: 'literal', value: 1 },
})

export interface ActionNode {
  id: string
  type: 'action'
  effectType: NodeEffectType
  target: NodeActionTarget
  /** Required for set-color / blackout, omitted for set-position in motion cue files. */
  color?: NodeColorSetting
  /** Required for set-position. */
  position?: NodePositionSetting
  /** Required for motion-pattern. */
  motionPattern?: NodeMotionPatternSetting
  timing: ActionTimingConfig
  layer?: ValueSource
  label?: string
  inputs?: string[]
  outputs?: string[]
  config?: NodeActionConfig
}

// ============================================================================
// Effect Definitions
// ============================================================================
