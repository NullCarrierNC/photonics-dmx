/**
 * Shared resolution of action timing, colour, and layer from ValueSources.
 * Used by NodeExecutionEngine and EffectExecutionEngine to avoid duplication.
 */

import { ExecutionContext } from './ExecutionContext'
import { resolveValue, resolveColor, resolveBrightness, resolveBlendMode } from './valueResolver'
import {
  ResolvedActionTiming,
  ResolvedColorSetting,
  ResolvedMotionPatternSetting,
  ResolvedPositionSetting,
} from '../compiler/ActionEffectFactory'
import {
  ActionTimingConfig,
  NodeColorSetting,
  NodeMotionPatternSetting,
  NodePositionSetting,
  MOTION_PATTERN_TYPES,
  WAVEFORM_TYPES,
  ValueSource,
  type LinearSweepAxis,
  type MotionPatternType,
  type WaveformType,
} from '../../types/nodeCueTypes'
import type { WaitCondition } from '../../../types'
import {
  normalizeBearingDegrees,
  parseBearingFromResolvedValue,
} from '../../../helpers/stageDirections'

export function resolveActionTiming(
  timing: ActionTimingConfig,
  context: ExecutionContext,
): ResolvedActionTiming {
  let waitUntilCondition = String(
    resolveValue('string', timing.waitUntilCondition, context),
  ) as WaitCondition
  let waitUntilTime = Number(resolveValue('number', timing.waitUntilTime, context))

  // Coerce invalid delay: delay with waitUntilTime <= 0 or NaN is treated as no wait so the effect
  // var store and any direct use of timing stay consistent.
  if (
    waitUntilCondition === 'delay' &&
    (typeof waitUntilTime !== 'number' || Number.isNaN(waitUntilTime) || waitUntilTime <= 0)
  ) {
    waitUntilCondition = 'none'
    waitUntilTime = 0
  }

  return {
    ...timing,
    waitForCondition: String(
      resolveValue('string', timing.waitForCondition, context),
    ) as WaitCondition,
    waitUntilCondition,
    waitForTime: Number(resolveValue('number', timing.waitForTime, context)),
    waitForConditionCount: timing.waitForConditionCount
      ? Number(resolveValue('number', timing.waitForConditionCount, context))
      : undefined,
    duration: Number(resolveValue('number', timing.duration, context)),
    waitUntilTime,
    waitUntilConditionCount: timing.waitUntilConditionCount
      ? Number(resolveValue('number', timing.waitUntilConditionCount, context))
      : undefined,
    easing: timing.easing ? String(resolveValue('string', timing.easing, context)) : undefined,
    level: timing.level ? Number(resolveValue('number', timing.level, context)) : 1,
  }
}

export function resolveActionColor(
  color: NodeColorSetting,
  context: ExecutionContext,
): ResolvedColorSetting {
  return {
    name: resolveColor(color.name, context),
    brightness: resolveBrightness(color.brightness, context),
    blendMode: resolveBlendMode(color.blendMode, context),
    opacity: color.opacity ? Number(resolveValue('number', color.opacity, context)) : undefined,
  }
}

export function resolveActionLayer(
  layer: ValueSource | undefined,
  context: ExecutionContext,
): number {
  return layer ? Number(resolveValue('number', layer, context)) : 0
}

function resolveBearingValue(source: ValueSource, context: ExecutionContext): number {
  if (source.source === 'literal') {
    const v = source.value
    if (typeof v === 'number') {
      return normalizeBearingDegrees(v)
    }
    if (typeof v === 'string') {
      return parseBearingFromResolvedValue(v)
    }
    if (typeof v === 'boolean') {
      return normalizeBearingDegrees(v ? 1 : 0)
    }
  }
  const str = String(resolveValue('string', source, context))
  return parseBearingFromResolvedValue(str)
}

export function resolveActionPosition(
  position: NodePositionSetting,
  context: ExecutionContext,
): ResolvedPositionSetting {
  const mode = position.mode ?? 'absolute'

  if (mode === 'direction') {
    if (!position.bearing || !position.angle) {
      throw new Error('direction mode requires bearing and angle')
    }
    return {
      mode: 'direction',
      bearingDeg: resolveBearingValue(position.bearing, context),
      angleFromVerticalDeg: Number(resolveValue('number', position.angle, context)),
    }
  }

  if (mode === 'offset') {
    if (!position.pan || !position.tilt) {
      throw new Error('offset mode requires pan and tilt')
    }
    return {
      mode: 'offset',
      panOffsetDeg: Number(resolveValue('number', position.pan, context)),
      tiltOffsetDeg: Number(resolveValue('number', position.tilt, context)),
    }
  }

  if (!position.pan || !position.tilt) {
    throw new Error('absolute mode requires pan and tilt')
  }
  return {
    mode: 'absolute',
    pan: Number(resolveValue('number', position.pan, context)),
    tilt: Number(resolveValue('number', position.tilt, context)),
  }
}

const MOTION_PATTERN_SET = new Set<string>(MOTION_PATTERN_TYPES)
const WAVEFORM_SET = new Set<string>(WAVEFORM_TYPES)

function parseMotionPatternType(raw: string): MotionPatternType {
  const s = raw.trim().toLowerCase()
  if (MOTION_PATTERN_SET.has(s)) {
    return s as MotionPatternType
  }
  throw new Error(`Invalid motion pattern: ${raw}`)
}

function parseWaveformType(raw: string): WaveformType {
  const s = raw.trim().toLowerCase()
  if (WAVEFORM_SET.has(s)) {
    return s as WaveformType
  }
  throw new Error(`Invalid waveform: ${raw}`)
}

function parseLinearSweepAxis(raw: string): LinearSweepAxis {
  const s = raw.trim().toLowerCase()
  if (s === 'horizontal' || s === 'vertical') {
    return s
  }
  throw new Error(`Invalid linear sweep axis: ${raw}`)
}

/**
 * Resolves motion-pattern ValueSources and expands presets into per-axis waveform config.
 */
export function resolveMotionPattern(
  setting: NodeMotionPatternSetting,
  context: ExecutionContext,
): ResolvedMotionPatternSetting {
  const pattern = parseMotionPatternType(String(resolveValue('string', setting.pattern, context)))

  const speedHz = Number(resolveValue('number', setting.speed, context))
  const sizeDeg = Number(resolveValue('number', setting.size, context))
  const fanSpreadDeg = setting.fanSpread
    ? Number(resolveValue('number', setting.fanSpread, context))
    : 0

  let panWaveform: WaveformType = 'sine'
  let tiltWaveform: WaveformType = 'cosine'
  let panAmplitudeDeg = sizeDeg
  let tiltAmplitudeDeg = sizeDeg
  const panPhaseOffsetDeg = setting.panPhaseOffset
    ? Number(resolveValue('number', setting.panPhaseOffset, context))
    : 0
  const panFreqMultiplier = 1
  let tiltFreqMultiplier = 1
  let linearSweepAxis: LinearSweepAxis = 'horizontal'
  let gimbalCompensation = false
  let bearingDeg = 180

  if (pattern === 'circle') {
    panWaveform = 'sine'
    tiltWaveform = 'cosine'
    panAmplitudeDeg = sizeDeg
    tiltAmplitudeDeg = sizeDeg
    gimbalCompensation = true
    bearingDeg = setting.bearing ? resolveBearingValue(setting.bearing, context) : 180
  } else if (pattern === 'figure-8') {
    panWaveform = 'sine'
    tiltWaveform = 'cosine'
    panAmplitudeDeg = sizeDeg
    tiltAmplitudeDeg = sizeDeg
    tiltFreqMultiplier = 2
  } else if (pattern === 'star') {
    panWaveform = 'sine'
    tiltWaveform = 'sine'
    panAmplitudeDeg = sizeDeg
    tiltAmplitudeDeg = sizeDeg
    tiltFreqMultiplier = 2
  } else if (pattern === 'linear-sweep') {
    linearSweepAxis = setting.linearSweepAxis
      ? parseLinearSweepAxis(String(resolveValue('string', setting.linearSweepAxis, context)))
      : 'horizontal'
    if (linearSweepAxis === 'horizontal') {
      panWaveform = 'sine'
      tiltWaveform = 'sine'
      panAmplitudeDeg = sizeDeg
      tiltAmplitudeDeg = 0
    } else {
      panWaveform = 'sine'
      tiltWaveform = 'sine'
      panAmplitudeDeg = 0
      tiltAmplitudeDeg = sizeDeg
    }
  } else {
    // custom
    panWaveform = setting.panWaveform
      ? parseWaveformType(String(resolveValue('string', setting.panWaveform, context)))
      : 'sine'
    tiltWaveform = setting.tiltWaveform
      ? parseWaveformType(String(resolveValue('string', setting.tiltWaveform, context)))
      : 'cosine'
    panAmplitudeDeg = setting.panAmplitude
      ? Number(resolveValue('number', setting.panAmplitude, context))
      : sizeDeg
    tiltAmplitudeDeg = setting.tiltAmplitude
      ? Number(resolveValue('number', setting.tiltAmplitude, context))
      : sizeDeg
  }

  return {
    pattern,
    speedHz,
    sizeDeg,
    fanSpreadDeg,
    panWaveform,
    tiltWaveform,
    panAmplitudeDeg,
    tiltAmplitudeDeg,
    panPhaseOffsetDeg,
    panFreqMultiplier,
    tiltFreqMultiplier,
    linearSweepAxis,
    gimbalCompensation,
    bearingDeg,
  }
}
