/**
 * Shared resolution of action timing, colour, and layer from ValueSources.
 * Used by NodeExecutionEngine and EffectExecutionEngine to avoid duplication.
 */

import { ExecutionContext } from './ExecutionContext'
import { resolveValue, resolveColor, resolveBrightness, resolveBlendMode } from './valueResolver'
import { ResolvedActionTiming, ResolvedColorSetting } from '../compiler/ActionEffectFactory'
import { ActionTimingConfig, NodeColorSetting, ValueSource } from '../../types/nodeCueTypes'
import type { WaitCondition } from '../../../types'

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
