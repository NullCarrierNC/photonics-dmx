/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  WaitCondition,
  TrackedLight,
  Effect,
  EffectTransition,
  FixtureConfig,
  RGBIO,
  LocationGroup,
  Color,
  Brightness,
  BlendMode,
  LightTarget,
  normalizeFixtureConfig,
} from '../../../types'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import {
  degreeOffsetToPercent,
  getColor,
  logicalPanDir,
  shouldMirrorTiltForStageRelative,
} from '../../../helpers/dmxHelpers'
import {
  logicalPanPercentFromMotorDeg,
  pickAliasedPanMotorDeg,
} from '../../../helpers/panMotorAlias'
import { reflectBearingUsDs } from '../../../helpers/stageDirections'
import {
  ActionNode,
  createDefaultActionTiming,
  type LinearSweepAxis,
  type MotionPatternType,
  type WaveformType,
} from '../../types/nodeCueTypes'
import { EasingType } from '../../../easing'
import { VariableValue } from '../runtime/executionTypes'

// Resolved action data (after ValueSource resolution)
export interface ResolvedActionTarget {
  groups: LocationGroup[]
  filter: LightTarget
}

export interface ResolvedColorSetting {
  name: Color
  brightness: Brightness
  blendMode?: BlendMode
  opacity?: number // 0.0-1.0
}

export interface ResolvedActionTiming {
  waitForCondition: WaitCondition
  waitForTime: number
  waitForConditionCount?: number
  duration: number
  waitUntilCondition: WaitCondition
  waitUntilTime: number
  waitUntilConditionCount?: number
  easing?: string
  level?: number
}

/** Resolved set-position payload after ValueSource resolution. */
export type ResolvedPositionSetting =
  | { mode: 'absolute'; pan: number; tilt: number }
  | { mode: 'direction'; bearingDeg: number; angleFromVerticalDeg: number }
  | { mode: 'offset'; panOffsetDeg: number; tiltOffsetDeg: number }

/** Stable fingerprint for set-position idempotency when the same effect name is re-submitted after completion. */
export function buildSetPositionSubmissionFingerprint(
  resolvedTarget: ResolvedActionTarget,
  resolvedPosition: ResolvedPositionSetting,
  resolvedLayer: number,
  resolvedTiming: ResolvedActionTiming,
): string {
  return JSON.stringify({
    target: resolvedTarget,
    position: resolvedPosition,
    layer: resolvedLayer,
    duration: resolvedTiming.duration,
    waitUntilCondition: resolvedTiming.waitUntilCondition,
    waitUntilTime: resolvedTiming.waitUntilTime,
  })
}

/** Resolved motion-pattern after ValueSource resolution; drives MotionPatternEngine. */
export interface ResolvedMotionPatternSetting {
  pattern: MotionPatternType
  speedHz: number
  sizeDeg: number
  fanSpreadDeg: number
  panWaveform: WaveformType
  tiltWaveform: WaveformType
  panAmplitudeDeg: number
  tiltAmplitudeDeg: number
  panPhaseOffsetDeg: number
  /** Relative to base `speedHz` (e.g. pendulum / figure-8 tilt uses 2). */
  panFreqMultiplier: number
  tiltFreqMultiplier: number
  /** Only used when pattern is linear-sweep. */
  linearSweepAxis: LinearSweepAxis
  /** When true, circle patterns use spherical circle math (gimbal compensation). */
  gimbalCompensation: boolean
  /**
   * Stage bearing in degrees for `circle` near-pole solver; ignored when home is far from the pole
   * or when pattern is not `circle`. Omitted cues default to 180 (downstage) at resolve time.
   */
  bearingDeg: number
  /** When true, phase advances in the opposite direction (reverse orbit). */
  reverse: boolean
}

/** True when two resolved motion-pattern configs are equivalent for idempotent re-submission. */
export function resolvedMotionPatternSettingsEqual(
  a: ResolvedMotionPatternSetting,
  b: ResolvedMotionPatternSetting,
): boolean {
  return (
    a.pattern === b.pattern &&
    a.speedHz === b.speedHz &&
    a.sizeDeg === b.sizeDeg &&
    a.fanSpreadDeg === b.fanSpreadDeg &&
    a.panWaveform === b.panWaveform &&
    a.tiltWaveform === b.tiltWaveform &&
    a.panAmplitudeDeg === b.panAmplitudeDeg &&
    a.tiltAmplitudeDeg === b.tiltAmplitudeDeg &&
    a.panPhaseOffsetDeg === b.panPhaseOffsetDeg &&
    a.panFreqMultiplier === b.panFreqMultiplier &&
    a.tiltFreqMultiplier === b.tiltFreqMultiplier &&
    a.linearSweepAxis === b.linearSweepAxis &&
    a.gimbalCompensation === b.gimbalCompensation &&
    a.bearingDeg === b.bearingDeg &&
    a.reverse === b.reverse
  )
}

/** Equality for fields that require restarting the motion pattern when they change (excludes bearing-only live updates). */
export function resolvedMotionPatternSettingsEqualExceptBearing(
  a: ResolvedMotionPatternSetting,
  b: ResolvedMotionPatternSetting,
): boolean {
  return (
    a.pattern === b.pattern &&
    a.speedHz === b.speedHz &&
    a.sizeDeg === b.sizeDeg &&
    a.fanSpreadDeg === b.fanSpreadDeg &&
    a.panWaveform === b.panWaveform &&
    a.tiltWaveform === b.tiltWaveform &&
    a.panAmplitudeDeg === b.panAmplitudeDeg &&
    a.tiltAmplitudeDeg === b.tiltAmplitudeDeg &&
    a.panPhaseOffsetDeg === b.panPhaseOffsetDeg &&
    a.panFreqMultiplier === b.panFreqMultiplier &&
    a.tiltFreqMultiplier === b.tiltFreqMultiplier &&
    a.linearSweepAxis === b.linearSweepAxis &&
    a.gimbalCompensation === b.gimbalCompensation &&
    a.reverse === b.reverse
  )
}

/** Same lights in the same order (by id). */
export function trackedLightIdsEqualOrder(a: TrackedLight[], b: TrackedLight[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id) {
      return false
    }
  }
  return true
}

/**
 * Converts resolved position (direction / offset / legacy absolute %) to absolute pan/tilt % for DMX.
 * When `bearingIsFlipped`, direction-mode bearings reflect across SR-SL (US/DS swap) for back-row lights in front-back layout.
 */
export function resolvePositionToAbsolutePercent(
  resolved: ResolvedPositionSetting,
  fixtureConfig: FixtureConfig | undefined,
  bearingIsFlipped?: boolean,
): { pan: number; tilt: number } {
  const c = normalizeFixtureConfig(fixtureConfig)
  const panDir = logicalPanDir(c)

  const clampAxis = (axis: 'pan' | 'tilt', raw: number): number => {
    const clamped = clamp(raw, 0, 100)
    if (raw < -1e-6 || raw > 100 + 1e-6) {
      console.warn(
        `[set-position] ${axis} clamped from ${raw.toFixed(2)}% to ${clamped.toFixed(2)}% (fixture range / home limits).`,
      )
    }
    return clamped
  }

  if (resolved.mode === 'absolute') {
    return {
      pan: clampAxis('pan', resolved.pan),
      tilt: clampAxis('tilt', resolved.tilt),
    }
  }
  const panHomeDeg = (c.panHome / 100) * c.panRangeDeg

  if (resolved.mode === 'offset') {
    const rawPanMotorDeg = panHomeDeg + panDir * resolved.panOffsetDeg
    const chosenPanMotorDeg = pickAliasedPanMotorDeg(
      rawPanMotorDeg,
      c.panRangeDeg,
      panHomeDeg,
      'intent',
    )
    const panRaw = logicalPanPercentFromMotorDeg(chosenPanMotorDeg, c.panRangeDeg)
    const tiltDir = shouldMirrorTiltForStageRelative(c) ? -1 : 1
    const tiltRaw =
      c.tiltHome + tiltDir * degreeOffsetToPercent(resolved.tiltOffsetDeg, c.tiltRangeDeg)
    return {
      pan: clampAxis('pan', panRaw),
      tilt: clampAxis('tilt', tiltRaw),
    }
  }
  const tiltStageZeroPct = (c.tiltStageDeg / c.tiltRangeDeg) * 100
  const bearingDeg =
    bearingIsFlipped === true ? reflectBearingUsDs(resolved.bearingDeg) : resolved.bearingDeg
  const rawPanMotorDeg = c.panStageDeg + panDir * bearingDeg
  const chosenPanMotorDeg = pickAliasedPanMotorDeg(
    rawPanMotorDeg,
    c.panRangeDeg,
    panHomeDeg,
    'intent',
  )
  const panRaw = logicalPanPercentFromMotorDeg(chosenPanMotorDeg, c.panRangeDeg)
  const tiltRaw =
    tiltStageZeroPct + degreeOffsetToPercent(resolved.angleFromVerticalDeg, c.tiltRangeDeg)
  return {
    pan: clampAxis('pan', panRaw),
    tilt: clampAxis('tilt', tiltRaw),
  }
}

interface BuildEffectParams {
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

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const safeDuration = (value: number | undefined, fallback: number, min = 0): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  return Math.max(min, value)
}

const resolveColor = (color: ResolvedColorSetting, intensityScale: number): RGBIO => {
  const rgb = getColor(color.name, color.brightness, color.blendMode ?? 'replace')
  const clampedIntensityScale = clamp(intensityScale, 0, 1)
  rgb.intensity = Math.round(rgb.intensity * clampedIntensityScale)
  // Use opacity from color setting if provided, otherwise default to 1.0
  rgb.opacity = color.opacity !== undefined ? clamp(color.opacity, 0, 1) : 1.0
  return rgb
}

const resolveEasing = (
  value?: string,
  fallback: EasingType = EasingType.SIN_IN_OUT,
): EasingType => {
  if (!value) {
    return fallback
  }
  const valid = Object.values(EasingType).includes(value as EasingType)
  return valid ? (value as EasingType) : fallback
}

const normalizeWaitFor = (
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

/** Builds one step transition. timing is ResolvedActionTiming from the effect run (effect var store);
 * for delay-based cues, waitUntilCondition is 'delay' and waitUntilTime is ms; TransitionEngine
 * advances these in handleWaitingUntil on clock ticks, not SongEventHandler. */
const createSingleColorTransition = (params: {
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

const createSingleColorEffect = (params: {
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

export class ActionEffectFactory {
  // Helper to resolve target if needed
  private static resolveTarget(target: any): ResolvedActionTarget {
    // Check if already resolved (has array for groups)
    if (Array.isArray(target.groups)) {
      return target as ResolvedActionTarget
    }
    // Otherwise treat as ValueSource - use literal value or default
    const groupsValue = target.groups?.source === 'literal' ? String(target.groups.value) : 'front'
    const filterValue = target.filter?.source === 'literal' ? String(target.filter.value) : 'all'

    return {
      groups: groupsValue.split(',').map((g) => g.trim()) as LocationGroup[],
      filter: filterValue as LightTarget,
    }
  }

  // Helper to resolve color if needed
  private static resolveColorSetting(color: any): ResolvedColorSetting {
    // Check if already resolved
    if (typeof color.name === 'string' && typeof color.brightness === 'string') {
      return color as ResolvedColorSetting
    }
    // Otherwise treat as ValueSource
    const name = color.name?.source === 'literal' ? String(color.name.value) : 'blue'
    const brightness =
      color.brightness?.source === 'literal' ? String(color.brightness.value) : 'medium'
    const blendMode =
      color.blendMode?.source === 'literal' ? String(color.blendMode.value) : 'replace'
    const opacity = color.opacity?.source === 'literal' ? Number(color.opacity.value) : undefined

    return {
      name: name as Color,
      brightness: brightness as Brightness,
      blendMode: blendMode as BlendMode,
      opacity: opacity !== undefined ? clamp(opacity, 0, 1) : undefined,
    }
  }

  // Helper to resolve timing if needed
  private static resolveTiming(timing: any): ResolvedActionTiming {
    // Check if already resolved
    if (typeof timing.waitForTime === 'number') {
      return timing as ResolvedActionTiming
    }
    // Otherwise treat as ValueSource
    const defaults = createDefaultActionTiming()
    return {
      waitForCondition: timing.waitForCondition ?? defaults.waitForCondition,
      waitForTime: timing.waitForTime?.source === 'literal' ? Number(timing.waitForTime.value) : 0,
      waitForConditionCount:
        timing.waitForConditionCount?.source === 'literal'
          ? Number(timing.waitForConditionCount.value)
          : undefined,
      duration: timing.duration?.source === 'literal' ? Number(timing.duration.value) : 200,
      waitUntilCondition: timing.waitUntilCondition ?? defaults.waitUntilCondition,
      waitUntilTime:
        timing.waitUntilTime?.source === 'literal' ? Number(timing.waitUntilTime.value) : 0,
      waitUntilConditionCount:
        timing.waitUntilConditionCount?.source === 'literal'
          ? Number(timing.waitUntilConditionCount.value)
          : undefined,
      easing: (() => {
        const e = timing.easing as string | { source?: string; value?: unknown } | undefined
        if (e === undefined) return undefined
        if (typeof e === 'string') return e
        if (e && typeof e === 'object' && e.source === 'literal') return String(e.value)
        return undefined
      })(),
      level: timing.level?.source === 'literal' ? Number(timing.level.value) : 1,
    }
  }

  public static resolveLights(
    lightManager: DmxLightManager,
    target: any,
    variableResolver?: (name: string) => VariableValue | undefined,
  ): TrackedLight[] {
    // Check if groups is a variable reference
    if (target.groups?.source === 'variable' && variableResolver) {
      const varValue = variableResolver(target.groups.name)

      // If it's a light-array variable, use those exact lights (ignore filter)
      if (varValue?.type === 'light-array') {
        return varValue.value as TrackedLight[]
      }

      // If it's a string variable, treat as group name(s) and resolve with filter
      if (varValue && typeof varValue.value === 'string') {
        const groupsStr = varValue.value || 'front'
        const groups = groupsStr.split(',').map((g) => g.trim()) as LocationGroup[]
        let filter: LightTarget = 'all'
        if (target.filter?.source === 'variable' && variableResolver) {
          const filterVar = variableResolver(target.filter.name)
          if (filterVar?.value) filter = String(filterVar.value) as LightTarget
        } else if (target.filter?.source === 'literal') {
          filter = String(target.filter.value) as LightTarget
        }
        return lightManager.getLights(groups, filter)
      }
    }

    // Standard group/filter resolution
    const resolved = this.resolveTarget(target)
    const groups: LocationGroup[] = resolved.groups.length > 0 ? resolved.groups : ['front']
    return lightManager.getLights(groups, resolved.filter)
  }

  public static buildEffect(params: BuildEffectParams): Effect | null {
    const { action, lights } = params
    if (!lights || lights.length === 0) {
      return null
    }

    // Use provided resolved values or resolve from action
    const timing = params.resolvedTiming ?? this.resolveTiming(action.timing)
    const layer =
      params.resolvedLayer ?? (action.layer?.source === 'literal' ? Number(action.layer.value) : 0)

    // For set-color, don't use level (original cues don't use it)
    const timingLevel = 1
    const intensityScale = clamp((params.intensityScale ?? 1) * timingLevel, 0, 1)
    let waitFor: WaitCondition = timing.waitForCondition ?? 'none'
    let waitForTime = safeDuration((params.waitTime ?? 0) + (timing.waitForTime ?? 0), 0, 0)

    // If caller passed an explicit waitCondition (e.g., chain-level override) and it's not 'none', respect it
    if (params.waitCondition && params.waitCondition !== 'none') {
      waitFor = params.waitCondition
      waitForTime = safeDuration((params.waitTime ?? 0) + (timing.waitForTime ?? 0), 0, 0)
    }

    // If action wants to start immediately but has a chain offset, convert to delay gate
    if (waitFor === 'none' && waitForTime > 0) {
      waitFor = 'delay'
    }

    const easing = resolveEasing(timing.easing)

    let effect: Effect | null = null

    switch (action.effectType) {
      case 'set-position': {
        const pos = params.resolvedPosition
        if (!pos) {
          return null
        }

        const transitions: EffectTransition[] = lights.map((light) => {
          const { pan, tilt } = resolvePositionToAbsolutePercent(
            pos,
            light.config,
            light.bearingIsFlipped,
          )
          const positionRgbio: RGBIO = {
            red: 0,
            green: 0,
            blue: 0,
            intensity: 0,
            opacity: 0.0,
            blendMode: 'replace',
            pan,
            tilt,
          }
          return createSingleColorTransition({
            lights: [light],
            layer,
            waitFor,
            waitForTime,
            color: positionRgbio,
            timing,
            easing,
          })
        })

        effect = {
          id: 'single-color',
          description: 'Single color effect',
          transitions,
        }
        break
      }
      case 'set-color': {
        const resolvedForColor =
          params.resolvedColor ??
          (action.color ? this.resolveColorSetting(action.color) : undefined)
        if (!resolvedForColor) {
          return null
        }
        const baseColor = resolveColor(resolvedForColor, intensityScale || 0.01)
        effect = createSingleColorEffect({
          lights,
          layer,
          waitFor,
          color: baseColor,
          timing: timing,
          easing,
        })
        break
      }
      case 'blackout': {
        // Blackout is handled directly by sequencer, not as an effect
        // Return null to indicate this should be handled specially
        return null
      }
      default:
        return null
    }

    return effect
  }

  /**
   * Build a single sequencer Effect with multiple sequential transitions from a chain
   * of action nodes. This is used to ensure "red then yellow" type patterns complete
   * as an atomic unit (no early callback after the first action) and to preserve layer
   * continuity between steps.
   *
   * Important: all steps must target the same lights and the same layer.
   */
  public static buildEffectChain(steps: BuildEffectChainStep[]): Effect | null {
    if (!steps || steps.length === 0) return null

    // Validate common lights + layer
    const first = steps[0]
    if (!first.lights || first.lights.length === 0) return null
    const baseLayer =
      first.resolvedLayer ??
      (first.action.layer?.source === 'literal' ? Number(first.action.layer.value) : 0)
    const baseLightIds = first.lights.map((l) => l.id).join(',')

    const transitions: EffectTransition[] = []

    for (const step of steps) {
      if (step.action.effectType !== 'set-color') {
        return null
      }
      if (!step.lights || step.lights.length === 0) return null

      const layer =
        step.resolvedLayer ??
        (step.action.layer?.source === 'literal' ? Number(step.action.layer.value) : 0)
      if (layer !== baseLayer) return null

      const ids = step.lights.map((l) => l.id).join(',')
      if (ids !== baseLightIds) return null

      const timing = step.resolvedTiming ?? this.resolveTiming(step.action.timing)
      const primaryColor =
        step.resolvedColor ??
        (step.action.color ? this.resolveColorSetting(step.action.color) : undefined)
      if (!primaryColor) {
        return null
      }

      const timingLevel = 1
      const intensityScale = clamp((step.intensityScale ?? 1) * timingLevel, 0, 1)
      const easing = resolveEasing(timing.easing)
      const color = resolveColor(primaryColor, intensityScale || 0.01)

      const { waitFor, waitForTime } = normalizeWaitFor(timing, 0)

      transitions.push(
        createSingleColorTransition({
          lights: step.lights,
          layer,
          waitFor,
          waitForTime,
          color,
          timing,
          easing,
        }),
      )
    }

    return {
      id: 'action-chain',
      description: 'Chained action effect',
      transitions,
    }
  }
}
