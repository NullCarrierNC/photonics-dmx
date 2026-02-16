/**
 * Shared resolution of action timing, colour, and layer from ValueSources.
 * Used by NodeExecutionEngine and EffectExecutionEngine to avoid duplication.
 */

import { ExecutionContext } from './ExecutionContext';
import { resolveValue, resolveColor, resolveBrightness, resolveBlendMode } from './valueResolver';
import { ResolvedActionTiming, ResolvedColorSetting } from '../compiler/ActionEffectFactory';
import { ActionTimingConfig, NodeColorSetting, ValueSource } from '../../types/nodeCueTypes';

export function resolveActionTiming(
  timing: ActionTimingConfig,
  context: ExecutionContext
): ResolvedActionTiming {
  return {
    ...timing,
    waitForTime: Number(resolveValue('number', timing.waitForTime, context)),
    waitForConditionCount: timing.waitForConditionCount
      ? Number(resolveValue('number', timing.waitForConditionCount, context))
      : undefined,
    duration: Number(resolveValue('number', timing.duration, context)),
    waitUntilTime: Number(resolveValue('number', timing.waitUntilTime, context)),
    waitUntilConditionCount: timing.waitUntilConditionCount
      ? Number(resolveValue('number', timing.waitUntilConditionCount, context))
      : undefined,
    level: timing.level
      ? Number(resolveValue('number', timing.level, context))
      : 1
  };
}

export function resolveActionColor(
  color: NodeColorSetting,
  context: ExecutionContext
): ResolvedColorSetting {
  return {
    name: resolveColor(color.name, context),
    brightness: resolveBrightness(color.brightness, context),
    blendMode: resolveBlendMode(color.blendMode, context),
    opacity: color.opacity
      ? Number(resolveValue('number', color.opacity, context))
      : undefined
  };
}

export function resolveActionLayer(
  layer: ValueSource | undefined,
  context: ExecutionContext
): number {
  return layer ? Number(resolveValue('number', layer, context)) : 0;
}
