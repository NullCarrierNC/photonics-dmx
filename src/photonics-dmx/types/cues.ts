/**
 * Cues, cue groups, and the resolvable values an effect reads its colours and timings from.
 */
import type { CueType } from '../cues/types/cueTypes'
import {
  cubicIn,
  cubicInOut,
  cubicOut,
  EasingFunction,
  linear,
  quadraticIn,
  quadraticInOut,
  quadraticOut,
  sinIn,
  sinInOut,
  sinOut,
} from '../easing'
import type { Effect } from './effects'
import type { WaitCondition } from './songEvents'

/**
 * A cue is a group of effects with their own triggers
 */
export type Cue = {
  id: string
  description: string
  effects: [Effect]
  trigger: WaitCondition
}

/**
 * Variables scoped to groups or targets
 * For example:
 * {
 *   "even": { "r": { "start": 100, "end": 150 }, "g":0, "b":255, "i":255 },
 *   "odd":  { "r": { "start": 200, "end":255 }, "g":255, "b":0, "i":255 }
 * }
 */
export interface GroupedColorVariables {
  [targetGroup: string]: ResolvableColor
}

/**
 * effectVariables can define multiple sets of group-based color variables
 * e.g. { "colorsByGroup": { "even": {...}, "odd": {...} } }
 */
export interface EffectVariables {
  [varName: string]: ResolvableValue
}

/**
 * Represents a range for random selection.
 */
export type RandomRange = { start: number; end: number }

/**
 * Defines a random target selection.
 */
export interface RandomTarget {
  type: 'random'
  count: number
}

/**
 * Possible values that can be resolved.
 */
export type ResolvableValue =
  | number
  | boolean
  | string // Can be a direct string or a variable reference like "$varName"
  | ResolvableColor
  | GroupedColorVariables
  | RandomTarget
  | { [key: string]: ResolvableValue }

/**
 * Colors can reference random values or be fixed.
 */
export interface ResolvableColor {
  r?: ResolvableValue
  g?: ResolvableValue
  b?: ResolvableValue
  i?: ResolvableValue
  w?: ResolvableValue
}

export type EffectSelector = {
  id: string
  yargDescription: string
  rb3Description: string
  groupName?: string
}

export interface CueGroup {
  id: string
  name: string
  description: string
  /** Populated when the row comes from main-process cue registry IPC. */
  cueTypes?: CueType[]
}

export type Easing = {
  name: string
  f: EasingFunction
}

// Mapping of easing names to easing functions
export const easingFunctions: { [key: string]: EasingFunction } = {
  'sin.in': sinIn,
  'sin.out': sinOut,
  'sin.inout': sinInOut,
  'linear': linear,
  'quadratic.in': quadraticIn,
  'quadratic.out': quadraticOut,
  'quadratic.inout': quadraticInOut,
  'cubic.in': cubicIn,
  'cubic.out': cubicOut,
  'cubic.inout': cubicInOut,
}
