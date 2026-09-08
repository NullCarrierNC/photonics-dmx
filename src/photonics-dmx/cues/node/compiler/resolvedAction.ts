/**
 * The shape an action takes once its ValueSources are resolved, and the comparisons and
 * conversions over it.
 */
import type { LinearSweepAxis, MotionPatternType, WaveformType } from '../../types/nodeCueTypes'
import {
  BlendMode,
  Brightness,
  Color,
  FixtureConfig,
  LightTarget,
  LocationGroup,
  TrackedLight,
  WaitCondition,
  normalizeFixtureConfig,
} from '../../../types'
import { clamp } from './effectBuilders'
import { createLogger } from '../../../../shared/logger'
import {
  degreeOffsetToPercent,
  logicalPanDir,
  shouldMirrorTiltForStageRelative,
} from '../../../helpers/dmxHelpers'
import {
  logicalPanPercentFromMotorDeg,
  pickAliasedPanMotorDeg,
} from '../../../helpers/panMotorAlias'
import { reflectBearingUsDs } from '../../../helpers/stageDirections'

const log = createLogger('resolvedAction')

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

/** Resolved motion-pattern after ValueSource resolution, which drives MotionPatternEngine. */
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
   * Stage bearing in degrees for `circle` near-pole solver, ignored when home is far from the pole
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
      log.warn(
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
      'continuity',
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
    'continuity',
  )
  const panRaw = logicalPanPercentFromMotorDeg(chosenPanMotorDeg, c.panRangeDeg)
  const tiltRaw =
    tiltStageZeroPct + degreeOffsetToPercent(resolved.angleFromVerticalDeg, c.tiltRangeDeg)
  return {
    pan: clampAxis('pan', panRaw),
    tilt: clampAxis('tilt', tiltRaw),
  }
}
