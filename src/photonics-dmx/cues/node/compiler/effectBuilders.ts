/**
 * Builders that turn a resolved action into an Effect, and the numeric and colour helpers they
 * are made of.
 */
import type {
  ResolvedActionTarget,
  ResolvedActionTiming,
  ResolvedColorSetting,
  ResolvedPositionSetting,
} from './resolvedAction'
import { ActionNode } from '../../types/nodeCueTypes'
import { EasingType } from '../../../easing'
import { Effect, EffectTransition, RGBIO, TrackedLight, WaitCondition } from '../../../types'
import { getColor } from '../../../helpers/dmxHelpers'

export interface BuildEffectParams {
  action: ActionNode
  lights: TrackedLight[]
  waitCondition?: WaitCondition
  /** Time in milliseconds to wait before the effect starts (for chained actions) */
  waitTime?: number
  intensityScale?: number
  // Add resolved values for direct use
  resolvedTarget?: ResolvedActionTarget
  resolvedColor?: ResolvedColorSetting
  resolvedPosition?: ResolvedPositionSetting
  resolvedTiming?: ResolvedActionTiming
  resolvedLayer?: number
}

export interface BuildEffectChainStep {
  action: ActionNode
  lights: TrackedLight[]
  resolvedColor?: ResolvedColorSetting
  resolvedTiming?: ResolvedActionTiming
  resolvedLayer?: number
  intensityScale?: number
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))

// Resolve a possibly non-numeric literal to a finite number, falling back when it isn't one.
// A malformed cue param (e.g. a non-numeric duration literal) resolves to NaN through Number(),
// which would otherwise flow straight into transition timings and light state.
export const finiteOr = <T>(value: unknown, fallback: T): number | T => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export const safeDuration = (value: number | undefined, fallback: number, min = 0): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  return Math.max(min, value)
}

export const resolveColor = (color: ResolvedColorSetting, intensityScale: number): RGBIO => {
  const rgb = getColor(color.name, color.brightness, color.blendMode ?? 'replace')
  const clampedIntensityScale = clamp(intensityScale, 0, 1)
  rgb.intensity = Math.round(rgb.intensity * clampedIntensityScale)
  // Use opacity from color setting if provided, otherwise default to 1.0
  rgb.opacity = color.opacity !== undefined ? clamp(color.opacity, 0, 1) : 1.0
  return rgb
}

export const resolveEasing = (
  value?: string,
  fallback: EasingType = EasingType.SIN_IN_OUT,
): EasingType => {
  if (!value) {
    return fallback
  }
  const valid = Object.values(EasingType).includes(value as EasingType)
  return valid ? (value as EasingType) : fallback
}

export const normalizeWaitFor = (
  timing: ResolvedActionTiming,
  waitTimeOffset = 0,
): { waitFor: WaitCondition; waitForTime: number } => {
  let waitFor: WaitCondition = timing.waitForCondition ?? 'none'
  const waitForTime = safeDuration(waitTimeOffset + (timing.waitForTime ?? 0), 0, 0)

  // If the transition wants to "start immediately" but has an explicit delay time,
  // interpret that as a delay gate (matches existing buildEffect behavior).
  if (waitFor === 'none' && waitForTime > 0) {
    waitFor = 'delay'
  }

  return { waitFor, waitForTime }
}

/** Builds one step transition. timing is ResolvedActionTiming from the effect run (effect var store).
 * For delay-based cues, waitUntilCondition is 'delay' and waitUntilTime is ms, and TransitionEngine
 * advances these in handleWaitingUntil on clock ticks, not SongEventHandler. */
export const createSingleColorTransition = (params: {
  lights: TrackedLight[]
  layer: number
  waitFor: WaitCondition
  waitForTime: number
  color: RGBIO
  timing: ResolvedActionTiming
  easing: EasingType
}): EffectTransition => {
  const { lights, layer, waitFor, waitForTime, color, timing, easing } = params
  const duration = safeDuration(timing.duration, 0, 0)

  // Coerce invalid delay: delay with waitUntilTime <= 0 or NaN is treated as no wait
  let waitUntilCondition = timing.waitUntilCondition
  let waitUntilTime = safeDuration(timing.waitUntilTime, 0, 0)
  if (waitUntilCondition === 'delay' && waitUntilTime <= 0) {
    waitUntilCondition = 'none'
    waitUntilTime = 0
  }

  return {
    lights,
    layer,
    waitForCondition: waitFor,
    waitForTime: safeDuration(waitForTime, 0, 0),
    waitForConditionCount: timing.waitForConditionCount,
    transform: {
      color,
      easing,
      duration,
    },
    waitUntilCondition,
    waitUntilTime,
    waitUntilConditionCount: timing.waitUntilConditionCount,
  }
}

export const createSingleColorEffect = (params: {
  lights: TrackedLight[]
  layer: number
  waitFor: WaitCondition
  color: RGBIO
  timing: ResolvedActionTiming
  easing: EasingType
}): Effect => {
  const { lights, layer, waitFor, color, timing, easing } = params
  const duration = safeDuration(timing.duration, 0, 0)
  const { waitForTime } = normalizeWaitFor(timing, 0)

  // Coerce invalid delay: delay with waitUntilTime <= 0 or NaN is treated as no wait
  let waitUntilCondition = timing.waitUntilCondition
  let waitUntilTime = safeDuration(timing.waitUntilTime, 0, 0)
  if (waitUntilCondition === 'delay' && waitUntilTime <= 0) {
    waitUntilCondition = 'none'
    waitUntilTime = 0
  }

  return {
    id: 'single-color',
    description: 'Single color effect',
    transitions: [
      {
        lights,
        layer,
        waitForCondition: waitFor,
        waitForTime: safeDuration(waitForTime, 0, 0),
        waitForConditionCount: timing.waitForConditionCount,
        transform: {
          color,
          easing,
          duration,
        },
        waitUntilCondition,
        waitUntilTime,
        waitUntilConditionCount: timing.waitUntilConditionCount,
      },
    ],
  }
}
