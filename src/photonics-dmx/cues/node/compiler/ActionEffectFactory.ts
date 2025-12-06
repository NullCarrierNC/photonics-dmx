import { WaitCondition, TrackedLight, Effect, EffectTransition, RGBIO, LocationGroup } from '../../../types';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import {
  getSweepEffect,
  getEffectCycleLights,
  getEffectBlackout
} from '../../../effects';
import { getColor } from '../../../helpers/dmxHelpers';
import {
  ActionNode,
  ActionTimingConfig,
  createDefaultActionTiming,
  NodeActionTarget,
  NodeColorSetting
} from '../../types/nodeCueTypes';
import { EasingType } from '../../../easing';

interface BuildEffectParams {
  action: ActionNode;
  lights: TrackedLight[];
  waitCondition?: WaitCondition;
  /** Time in milliseconds to wait before the effect starts (for chained actions) */
  waitTime?: number;
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

const resolveColor = (color: NodeColorSetting, scale: number): RGBIO => {
  const rgb = getColor(color.name, color.brightness, color.blendMode ?? 'replace');
  const clampedScale = clamp(scale, 0, 1);
  rgb.intensity = Math.round(rgb.intensity * clampedScale);
  rgb.opacity = clamp(rgb.opacity * clampedScale, 0, 1);
  return rgb;
};

const ensureTiming = (action: ActionNode): ActionTimingConfig => ({
  ...createDefaultActionTiming(),
  ...(action.timing ?? {})
});

const resolveEasing = (value?: string, fallback: EasingType = EasingType.SIN_IN_OUT): EasingType => {
  if (!value) {
    return fallback;
  }
  const valid = Object.values(EasingType).includes(value as EasingType);
  return valid ? (value as EasingType) : fallback;
};

const createSingleColorEffect = (params: {
  lights: TrackedLight[];
  layer: number;
  waitFor: WaitCondition;
  color: RGBIO;
  timing: ActionTimingConfig;
  easing: EasingType;
}): Effect => {
  const { lights, layer, waitFor, color, timing, easing } = params;
  const duration = safeDuration(timing.duration, 0, 0);

  return {
    id: 'single-color',
    description: 'Single color effect',
    transitions: [
      {
        lights,
        layer,
        waitForCondition: waitFor,
        waitForTime: safeDuration(timing.waitForTime, 0, 0),
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

export class ActionEffectFactory {
  public static resolveLights(lightManager: DmxLightManager, target: NodeActionTarget): TrackedLight[] {
    const groups: LocationGroup[] = target.groups.length > 0 ? target.groups : ['front'];
    return lightManager.getLights(groups, target.filter);
  }

  public static buildEffect(params: BuildEffectParams): Effect | null {
    const { action, lights } = params;
    if (!lights || lights.length === 0) {
      return null;
    }

    const timing = ensureTiming(action);
    const timingLevel = clamp(timing.level ?? 1, 0, 1);
    const intensityScale = clamp((params.intensityScale ?? 1) * timingLevel, 0, 1);
    const waitFor: WaitCondition = params.waitCondition ?? timing.waitForCondition ?? 'none';
    const waitForTime = safeDuration((params.waitTime ?? 0) + (timing.waitForTime ?? 0), 0, 0);
    const layer = action.layer ?? 0;
    const easing = resolveEasing(timing.easing);

    const baseColor = resolveColor(action.color, intensityScale || 0.01);
    const secondaryColor = action.secondaryColor
      ? resolveColor(action.secondaryColor, intensityScale || 0.01)
      : resolveColor({ name: 'transparent', brightness: 'low' }, 0);

    let effect: Effect | null = null;

    switch (action.effectType) {
      case 'single-color': {
        effect = createSingleColorEffect({
          lights,
          layer,
          waitFor,
          color: baseColor,
          timing: {
            ...timing,
            waitForTime
          },
          easing
        });
        break;
      }
      case 'sweep': {
        const sweepConfig = action.config?.sweep;
        const sweepDuration = safeDuration(
          sweepConfig?.duration,
          timing.duration || 600,
          100
        );
        const fadeIn = safeDuration(sweepConfig?.fadeIn, timing.duration || 80, 10);
        const fadeOut = safeDuration(sweepConfig?.fadeOut, 120, 10);
        const overlap = clamp(sweepConfig?.overlap ?? 0, 0, 100);
        const betweenDelay = safeDuration(sweepConfig?.betweenDelay, timing.waitUntilTime, 0);
        const lowColorSetting = sweepConfig?.lowColor || action.secondaryColor || { name: 'transparent', brightness: 'low' };
        const lowColor = resolveColor(lowColorSetting, intensityScale || 0.01);

        effect = getSweepEffect({
          lights,
          layer,
          waitFor,
          sweepTime: sweepDuration,
          fadeInDuration: fadeIn,
          fadeOutDuration: fadeOut,
          lightOverlap: overlap,
          betweenSweepDelay: betweenDelay,
          high: baseColor,
          low: lowColor,
          easing
        });
        break;
      }
      case 'cycle': {
        const cycleConfig = action.config?.cycle;
        const base = resolveColor(
          cycleConfig?.baseColor || action.secondaryColor || { name: 'transparent', brightness: 'low' },
          intensityScale || 0.01
        );

        effect = getEffectCycleLights({
          lights,
          layer,
          activeColor: baseColor,
          baseColor: base,
          transitionDuration: safeDuration(cycleConfig?.transitionDuration, timing.duration || 150, 10),
          waitFor: cycleConfig?.trigger || waitFor
        });
        break;
      }
      case 'blackout': {
        effect = getEffectBlackout({
          lights,
          layer,
          duration: safeDuration(
            action.config?.blackout?.duration,
            timing.duration || 200,
            10
          )
        });
        effect.transitions.forEach(transition => {
          transition.waitForCondition = waitFor;
        });
        break;
      }
      default:
        return null;
    }

    return effect;
  }
}

