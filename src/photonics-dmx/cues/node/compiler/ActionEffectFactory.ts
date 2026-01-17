import { WaitCondition, TrackedLight, Effect, EffectTransition, RGBIO, LocationGroup, Color, Brightness, BlendMode, LightTarget } from '../../../types';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { getColor } from '../../../helpers/dmxHelpers';
import {
  ActionNode,
  createDefaultActionTiming,
  type NodeChaseOrder
} from '../../types/nodeCueTypes';
import { EasingType } from '../../../easing';
import { VariableValue } from '../runtime/executionTypes';

// Resolved action data (after ValueSource resolution)
export interface ResolvedActionTarget {
  groups: LocationGroup[];
  filter: LightTarget;
}

export interface ResolvedColorSetting {
  name: Color;
  brightness: Brightness;
  blendMode?: BlendMode;
  opacity?: number;  // 0.0-1.0
}

export interface ResolvedActionTiming {
  waitForCondition: WaitCondition;
  waitForTime: number;
  waitForConditionCount?: number;
  duration: number;
  waitUntilCondition: WaitCondition;
  waitUntilTime: number;
  waitUntilConditionCount?: number;
  easing?: string;
  level?: number;
}

interface BuildEffectParams {
  action: ActionNode;
  lights: TrackedLight[];
  waitCondition?: WaitCondition;
  /** Time in milliseconds to wait before the effect starts (for chained actions) */
  waitTime?: number;
  intensityScale?: number;
  // Add resolved values for direct use
  resolvedTarget?: ResolvedActionTarget;
  resolvedColor?: ResolvedColorSetting;
  resolvedSecondaryColor?: ResolvedColorSetting;
  resolvedTiming?: ResolvedActionTiming;
  resolvedLayer?: number;
}

export interface BuildEffectChainStep {
  action: ActionNode;
  lights: TrackedLight[];
  resolvedColor?: ResolvedColorSetting;
  resolvedTiming?: ResolvedActionTiming;
  resolvedLayer?: number;
  intensityScale?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const safeDuration = (value: number | undefined, fallback: number, min = 0): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(min, value);
};

const resolveColor = (color: ResolvedColorSetting, intensityScale: number): RGBIO => {
  const rgb = getColor(color.name, color.brightness, color.blendMode ?? 'replace');
  const clampedIntensityScale = clamp(intensityScale, 0, 1);
  rgb.intensity = Math.round(rgb.intensity * clampedIntensityScale);
  // Use opacity from color setting if provided, otherwise default to 1.0
  rgb.opacity = color.opacity !== undefined ? clamp(color.opacity, 0, 1) : 1.0;
  return rgb;
};

const resolveEasing = (value?: string, fallback: EasingType = EasingType.SIN_IN_OUT): EasingType => {
  if (!value) {
    return fallback;
  }
  const valid = Object.values(EasingType).includes(value as EasingType);
  return valid ? (value as EasingType) : fallback;
};

const normalizeWaitFor = (timing: ResolvedActionTiming, waitTimeOffset = 0): { waitFor: WaitCondition; waitForTime: number } => {
  let waitFor: WaitCondition = timing.waitForCondition ?? 'none';
  const waitForTime = safeDuration(waitTimeOffset + (timing.waitForTime ?? 0), 0, 0);

  // If the transition wants to "start immediately" but has an explicit delay time,
  // interpret that as a delay gate (matches existing buildEffect behavior).
  if (waitFor === 'none' && waitForTime > 0) {
    waitFor = 'delay';
  }

  return { waitFor, waitForTime };
};

const createSingleColorTransition = (params: {
  lights: TrackedLight[];
  layer: number;
  waitFor: WaitCondition;
  waitForTime: number;
  color: RGBIO;
  timing: ResolvedActionTiming;
  easing: EasingType;
}): EffectTransition => {
  const { lights, layer, waitFor, waitForTime, color, timing, easing } = params;
  const duration = safeDuration(timing.duration, 0, 0);

  return {
    lights,
    layer,
    waitForCondition: waitFor,
    waitForTime: safeDuration(waitForTime, 0, 0),
    waitForConditionCount: timing.waitForConditionCount,
    transform: {
      color,
      easing,
      duration
    },
    waitUntilCondition: timing.waitUntilCondition,
    waitUntilTime: safeDuration(timing.waitUntilTime, 0, 0),
    waitUntilConditionCount: timing.waitUntilConditionCount
  };
};

const createSingleColorEffect = (params: {
  lights: TrackedLight[];
  layer: number;
  waitFor: WaitCondition;
  color: RGBIO;
  timing: ResolvedActionTiming;
  easing: EasingType;
}): Effect => {
  const { lights, layer, waitFor, color, timing, easing } = params;
  const duration = safeDuration(timing.duration, 0, 0);
  const { waitForTime } = normalizeWaitFor(timing, 0);

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
          duration
        },
        waitUntilCondition: timing.waitUntilCondition,
        waitUntilTime: safeDuration(timing.waitUntilTime, 0, 0),
        waitUntilConditionCount: timing.waitUntilConditionCount
      }
    ]
  };
};

const orderLights = (lights: TrackedLight[], order: NodeChaseOrder): TrackedLight[] => {
  const sorted = [...lights].sort((a, b) => a.position - b.position);
  if (order === 'inverse-linear') {
    return sorted.reverse();
  }
  return sorted;
};

const createChaseEffect = (params: {
  lights: TrackedLight[];
  layer: number;
  timing: ResolvedActionTiming;
  easing: EasingType;
  color: RGBIO;
  perLightOffsetMs: number;
  order: NodeChaseOrder;
}): Effect => {
  const { lights, layer, timing, easing, color, perLightOffsetMs, order } = params;
  const { waitForTime } = normalizeWaitFor(timing, 0);
  const ordered = orderLights(lights, order);

  const transitions = ordered.map((light, index) =>
    createSingleColorTransition({
      lights: [light],
      layer,
      waitFor: 'delay',
      waitForTime: waitForTime + index * perLightOffsetMs,
      color,
      timing,
      easing
    })
  );

  return {
    id: 'chase',
    description: 'Per-light offset chase effect',
    transitions
  };
};

export class ActionEffectFactory {
  // Helper to resolve target if needed
  private static resolveTarget(target: any): ResolvedActionTarget {
    // Check if already resolved (has array for groups)
    if (Array.isArray(target.groups)) {
      return target as ResolvedActionTarget;
    }
    // Otherwise treat as ValueSource - use literal value or default
    const groupsValue = target.groups?.source === 'literal' ? String(target.groups.value) : 'front';
    const filterValue = target.filter?.source === 'literal' ? String(target.filter.value) : 'all';
    
    return {
      groups: groupsValue.split(',').map(g => g.trim()) as LocationGroup[],
      filter: filterValue as LightTarget
    };
  }

  // Helper to resolve color if needed
  private static resolveColorSetting(color: any): ResolvedColorSetting {
    // Check if already resolved
    if (typeof color.name === 'string' && typeof color.brightness === 'string') {
      return color as ResolvedColorSetting;
    }
    // Otherwise treat as ValueSource
    const name = color.name?.source === 'literal' ? String(color.name.value) : 'blue';
    const brightness = color.brightness?.source === 'literal' ? String(color.brightness.value) : 'medium';
    const blendMode = color.blendMode?.source === 'literal' ? String(color.blendMode.value) : 'replace';
    const opacity = color.opacity?.source === 'literal' ? Number(color.opacity.value) : undefined;
    
    return {
      name: name as Color,
      brightness: brightness as Brightness,
      blendMode: blendMode as BlendMode,
      opacity: opacity !== undefined ? clamp(opacity, 0, 1) : undefined
    };
  }

  // Helper to resolve timing if needed
  private static resolveTiming(timing: any): ResolvedActionTiming {
    // Check if already resolved
    if (typeof timing.waitForTime === 'number') {
      return timing as ResolvedActionTiming;
    }
    // Otherwise treat as ValueSource
    const defaults = createDefaultActionTiming();
    return {
      waitForCondition: timing.waitForCondition ?? defaults.waitForCondition,
      waitForTime: timing.waitForTime?.source === 'literal' ? Number(timing.waitForTime.value) : 0,
      waitForConditionCount: timing.waitForConditionCount?.source === 'literal' ? Number(timing.waitForConditionCount.value) : undefined,
      duration: timing.duration?.source === 'literal' ? Number(timing.duration.value) : 200,
      waitUntilCondition: timing.waitUntilCondition ?? defaults.waitUntilCondition,
      waitUntilTime: timing.waitUntilTime?.source === 'literal' ? Number(timing.waitUntilTime.value) : 0,
      waitUntilConditionCount: timing.waitUntilConditionCount?.source === 'literal' ? Number(timing.waitUntilConditionCount.value) : undefined,
      easing: timing.easing,
      level: timing.level?.source === 'literal' ? Number(timing.level.value) : 1
    };
  }

  public static resolveLights(
    lightManager: DmxLightManager, 
    target: any,
    variableResolver?: (name: string) => VariableValue | undefined
  ): TrackedLight[] {
    // Check if groups is a variable reference
    if (target.groups?.source === 'variable' && variableResolver) {
      const varValue = variableResolver(target.groups.name);
      
      // If it's a light-array variable, use those exact lights (ignore filter)
      if (varValue?.type === 'light-array') {
        return varValue.value as TrackedLight[];
      }
    }
    
    // Standard group/filter resolution
    const resolved = this.resolveTarget(target);
    const groups: LocationGroup[] = resolved.groups.length > 0 ? resolved.groups : ['front'];
    return lightManager.getLights(groups, resolved.filter);
  }

  public static buildEffect(params: BuildEffectParams): Effect | null {
    const { action, lights } = params;
    if (!lights || lights.length === 0) {
      return null;
    }

    // Use provided resolved values or resolve from action
    const timing = params.resolvedTiming ?? this.resolveTiming(action.timing);
    const primaryColor = params.resolvedColor ?? this.resolveColorSetting(action.color);
    const layer = params.resolvedLayer ?? (action.layer?.source === 'literal' ? Number(action.layer.value) : 0);

    // For set-color, don't use level (original cues don't use it)
    const timingLevel = 1;
    const intensityScale = clamp((params.intensityScale ?? 1) * timingLevel, 0, 1);
    let waitFor: WaitCondition = timing.waitForCondition ?? 'none';
    let waitForTime = safeDuration((params.waitTime ?? 0) + (timing.waitForTime ?? 0), 0, 0);

    // If caller passed an explicit waitCondition (e.g., chain-level override) and it's not 'none', respect it
    if (params.waitCondition && params.waitCondition !== 'none') {
      waitFor = params.waitCondition;
      waitForTime = safeDuration((params.waitTime ?? 0) + (timing.waitForTime ?? 0), 0, 0);
    }

    // If action wants to start immediately but has a chain offset, convert to delay gate
    if (waitFor === 'none' && waitForTime > 0) {
      waitFor = 'delay';
    }
    
    const easing = resolveEasing(timing.easing);
    const baseColor = resolveColor(primaryColor, intensityScale || 0.01);

    let effect: Effect | null = null;

    switch (action.effectType) {
      case 'set-color': {
        const perLightOffsetMs = action.config?.perLightOffsetMs;
        if (typeof perLightOffsetMs === 'number' && perLightOffsetMs > 0) {
          effect = createChaseEffect({
            lights,
            layer,
            timing,
            easing,
            color: baseColor,
            perLightOffsetMs,
            order: action.config?.order ?? 'linear'
          });
        } else {
          effect = createSingleColorEffect({
            lights,
            layer,
            waitFor,
            color: baseColor,
            timing: timing,
            easing
          });
        }
        break;
      }
      case 'blackout': {
        // Blackout is handled directly by sequencer, not as an effect
        // Return null to indicate this should be handled specially
        return null;
      }
      default:
        return null;
    }

    return effect;
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
    if (!steps || steps.length === 0) return null;

    // Validate common lights + layer
    const first = steps[0];
    if (!first.lights || first.lights.length === 0) return null;
    const baseLayer = first.resolvedLayer ?? (first.action.layer?.source === 'literal' ? Number(first.action.layer.value) : 0);
    const baseLightIds = first.lights.map(l => l.id).join(',');

    const transitions: EffectTransition[] = [];

    for (const step of steps) {
      if (step.action.effectType !== 'set-color') {
        return null;
      }
      if (!step.lights || step.lights.length === 0) return null;

      const layer = step.resolvedLayer ?? (step.action.layer?.source === 'literal' ? Number(step.action.layer.value) : 0);
      if (layer !== baseLayer) return null;

      const ids = step.lights.map(l => l.id).join(',');
      if (ids !== baseLightIds) return null;

      const timing = step.resolvedTiming ?? this.resolveTiming(step.action.timing);
      const primaryColor = step.resolvedColor ?? this.resolveColorSetting(step.action.color);

      const timingLevel = 1;
      const intensityScale = clamp((step.intensityScale ?? 1) * timingLevel, 0, 1);
      const easing = resolveEasing(timing.easing);
      const color = resolveColor(primaryColor, intensityScale || 0.01);

      const { waitFor, waitForTime } = normalizeWaitFor(timing, 0);

      transitions.push(
        createSingleColorTransition({
          lights: step.lights,
          layer,
          waitFor,
          waitForTime,
          color,
          timing,
          easing
        })
      );
    }

    return {
      id: 'action-chain',
      description: 'Chained action effect',
      transitions
    };
  }
}

