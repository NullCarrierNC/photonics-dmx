/**
 * Shared resolution of action timing, colour, and layer from ValueSources.
 * Used by NodeExecutionEngine and EffectExecutionEngine to avoid duplication.
 */

import { ExecutionContext } from './ExecutionContext'
import {
  parseWaitCondition,
  resolveNumber,
  resolveBoolean,
  resolveString,
  resolveColor,
  resolveBrightness,
  resolveBlendMode,
} from './valueResolver'
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
import {
  normalizeBearingDegrees,
  parseBearingFromResolvedValue,
} from '../../../helpers/stageDirections'
import { MAX_NODE_LAYER } from '../../../constants/nodeConstants'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('actionResolver')

/**
 * Axisless linear sweeps already reported. Each compiled cue node holds its own setting, so each
 * such node is reported once however often it runs.
 */
const reportedMissingSweepAxis = new WeakSet<NodeMotionPatternSetting>()

export function resolveActionTiming(
  timing: ActionTimingConfig,
  context: ExecutionContext,
): ResolvedActionTiming {
  let waitUntilCondition = parseWaitCondition(
    resolveString(timing.waitUntilCondition, context),
    context.unknownValues,
  )
  let waitUntilTime = resolveNumber(timing.waitUntilTime, context)

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
    waitForCondition: parseWaitCondition(
      resolveString(timing.waitForCondition, context),
      context.unknownValues,
    ),
    waitUntilCondition,
    waitForTime: resolveNumber(timing.waitForTime, context),
    waitForConditionCount: timing.waitForConditionCount
      ? resolveNumber(timing.waitForConditionCount, context)
      : undefined,
    duration: resolveNumber(timing.duration, context),
    waitUntilTime,
    waitUntilConditionCount: timing.waitUntilConditionCount
      ? resolveNumber(timing.waitUntilConditionCount, context)
      : undefined,
    easing: timing.easing ? resolveString(timing.easing, context) : undefined,
    level: timing.level ? resolveNumber(timing.level, context) : 1,
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
    opacity: color.opacity ? resolveNumber(color.opacity, context) : undefined,
  }
}

/** The action's layer, kept on the layers that exist whatever a variable holds. */
export function resolveActionLayer(
  layer: ValueSource | undefined,
  context: ExecutionContext,
): number {
  if (!layer) return 0
  const n = resolveNumber(layer, context)
  return Number.isFinite(n) ? Math.min(MAX_NODE_LAYER, Math.max(0, n)) : 0
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
  const str = resolveString(source, context)
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
      angleFromVerticalDeg: resolveNumber(position.angle, context),
    }
  }

  if (mode === 'offset') {
    if (!position.pan || !position.tilt) {
      throw new Error('offset mode requires pan and tilt')
    }
    return {
      mode: 'offset',
      panOffsetDeg: resolveNumber(position.pan, context),
      tiltOffsetDeg: resolveNumber(position.tilt, context),
    }
  }

  if (!position.pan || !position.tilt) {
    throw new Error('absolute mode requires pan and tilt')
  }
  return {
    mode: 'absolute',
    pan: resolveNumber(position.pan, context),
    tilt: resolveNumber(position.tilt, context),
  }
}

const MOTION_PATTERN_SET = new Set<string>(MOTION_PATTERN_TYPES)
const WAVEFORM_SET = new Set<string>(WAVEFORM_TYPES)

function parseMotionPatternType(raw: string): MotionPatternType {
  let s = raw.trim().toLowerCase()
  // Legacy preset name: same waveform as current figure-8 (infinity Lissajous).
  if (s === 'star') {
    s = 'figure-8'
  }
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
  const pattern = parseMotionPatternType(resolveString(setting.pattern, context))

  const speedHz = resolveNumber(setting.speed, context)
  const sizeDeg = resolveNumber(setting.size, context)
  const fanSpreadDeg = setting.fanSpread ? resolveNumber(setting.fanSpread, context) : 0

  let panWaveform: WaveformType = 'sine'
  let tiltWaveform: WaveformType = 'cosine'
  let panAmplitudeDeg = sizeDeg
  let tiltAmplitudeDeg = sizeDeg
  const panPhaseOffsetDeg = setting.panPhaseOffset
    ? resolveNumber(setting.panPhaseOffset, context)
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
  } else if (pattern === 'pendulum') {
    panWaveform = 'sine'
    tiltWaveform = 'cosine'
    panAmplitudeDeg = sizeDeg
    tiltAmplitudeDeg = sizeDeg
    tiltFreqMultiplier = 2
  } else if (pattern === 'figure-8') {
    panWaveform = 'sine'
    tiltWaveform = 'sine'
    panAmplitudeDeg = sizeDeg
    tiltAmplitudeDeg = sizeDeg
    tiltFreqMultiplier = 2
  } else if (pattern === 'linear-sweep') {
    if (!setting.linearSweepAxis && !reportedMissingSweepAxis.has(setting)) {
      reportedMissingSweepAxis.add(setting)
      log.warn('linear-sweep motion pattern has no linearSweepAxis, sweeping horizontally (pan)')
    }
    linearSweepAxis = setting.linearSweepAxis
      ? parseLinearSweepAxis(resolveString(setting.linearSweepAxis, context))
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
      ? parseWaveformType(resolveString(setting.panWaveform, context))
      : 'sine'
    tiltWaveform = setting.tiltWaveform
      ? parseWaveformType(resolveString(setting.tiltWaveform, context))
      : 'cosine'
    panAmplitudeDeg = setting.panAmplitude ? resolveNumber(setting.panAmplitude, context) : sizeDeg
    tiltAmplitudeDeg = setting.tiltAmplitude
      ? resolveNumber(setting.tiltAmplitude, context)
      : sizeDeg
  }

  const reverse = setting.reverse ? resolveBoolean(setting.reverse, context) : false

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
    reverse,
  }
}
