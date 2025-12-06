import { WaitCondition, TrackedLight, Effect, EffectTransition, RGBIO, LocationGroup } from '../../../types';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import {
  getEffectCrossFadeColors,
  getEffectFlashColor,
  getSweepEffect,
  getEffectCycleLights,
  getEffectBlackout
} from '../../../effects';
import { getColor } from '../../../helpers/dmxHelpers';
import {
  ActionNode,
  ActionTiming,
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

const transparentVariant = (color: RGBIO): RGBIO => ({
  ...color,
  intensity: 0,
  opacity: 0
});

const ensureTiming = (action: ActionNode): ActionTiming => ({
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

/**
 * Applies chained timing to an effect's first transition.
 * - If the action was triggered by 'none', convert the first transition into a delay.
 * - Otherwise, insert a timing-only gate that waits for the event, then delays,
 *   before allowing the original transition to run.
 */
const applyChainedTiming = (effect: Effect, waitTime: number, waitCondition: WaitCondition): Effect => {
  if (waitTime <= 0 || !effect.transitions || effect.transitions.length === 0) {
    return effect;
  }

  const [firstTransition, ...rest] = effect.transitions;

  if (waitCondition === 'none') {
    const updatedFirst: EffectTransition = {
      ...firstTransition,
      waitForCondition: 'delay',
      waitForTime: waitTime
    };
    return {
      ...effect,
      transitions: [updatedFirst, ...rest]
    };
  }

  const timingGate: EffectTransition = {
    ...firstTransition,
    timingOnly: true,
    waitForCondition: waitCondition,
    waitForTime: 0,
    waitForConditionCount: firstTransition.waitForConditionCount,
    transform: {
      ...firstTransition.transform,
      duration: 0
    },
    waitUntilCondition: 'delay',
    waitUntilTime: waitTime,
    waitUntilConditionCount: undefined
  };

  const chainedFirst: EffectTransition = {
    ...firstTransition,
    waitForCondition: 'none',
    waitForTime: 0,
    waitForConditionCount: undefined
  };

  return {
    ...effect,
    transitions: [timingGate, chainedFirst, ...rest]
  };
};

const createTimedColorEffect = (params: {
  lights: TrackedLight[];
  layer: number;
  waitFor: WaitCondition;
  color: RGBIO;
  timing: ActionTiming;
  easingIn: EasingType;
  easingOut: EasingType;
  returnColor?: RGBIO;
}): Effect => {
  const { lights, layer, waitFor, color, timing, easingIn, easingOut } = params;
  const fadeInDuration = safeDuration(timing.fadeIn, 0, 0);
  const holdDuration = safeDuration(timing.hold, 0, 0);
  const fadeOutDuration = safeDuration(timing.fadeOut, 0, 0);
  const postDelay = safeDuration(timing.postDelay, 0, 0);
  const returnColor = params.returnColor ?? transparentVariant(color);

  const transitions: EffectTransition[] = [
    {
      lights,
      layer,
      waitForCondition: waitFor,
      waitForTime: 0,
      transform: {
        color,
        easing: easingIn,
        duration: fadeInDuration
      },
      waitUntilCondition: 'delay',
      waitUntilTime: holdDuration
    },
    {
      lights,
      layer,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: {
        color: returnColor,
        easing: easingOut,
        duration: fadeOutDuration
      },
      waitUntilCondition: 'delay',
      waitUntilTime: postDelay
    }
  ];

  return {
    id: 'timed-color',
    description: 'Timed color effect',
    transitions
  };
};

const createSingleColorEffect = (params: {
  lights: TrackedLight[];
  layer: number;
  waitFor: WaitCondition;
  color: RGBIO;
  timing: ActionTiming;
  easingIn: EasingType;
}): Effect => {
  const { lights, layer, waitFor, color, timing, easingIn } = params;
  const fadeInDuration = safeDuration(timing.fadeIn, 0, 0);
  const holdPlusDelay = safeDuration(timing.hold, 0, 0) + safeDuration(timing.postDelay, 0, 0);

  return {
    id: 'single-color',
    description: 'Single color effect',
    transitions: [
      {
        lights,
        layer,
        waitForCondition: waitFor,
        waitForTime: 0,
        transform: {
          color,
          easing: easingIn,
          duration: fadeInDuration
        },
        waitUntilCondition: 'delay',
        waitUntilTime: holdPlusDelay
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
    const waitTime = params.waitTime ?? 0;
    const waitFor: WaitCondition = params.waitCondition ?? 'none';
    const layer = action.layer ?? 0;
    const easingIn = resolveEasing(timing.easeIn);
    const easingOut = resolveEasing(timing.easeOut ?? timing.easeIn);

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
          timing,
          easingIn
        });
        break;
      }
      case 'cross-fade': {
        const duration = safeDuration(timing.fadeIn, 150, 10);
        const afterStartWait = safeDuration(timing.hold, 0, 0);
        const afterEndWait = safeDuration(timing.postDelay, 0, 0);
        effect = getEffectCrossFadeColors({
          lights,
          layer,
          startColor: baseColor,
          endColor: secondaryColor,
          duration,
          waitFor,
          crossFadeTrigger: 'delay',
          afterStartWait,
          afterEndColorWait: afterEndWait,
          easing: easingIn
        });
        break;
      }
      case 'flash': {
        effect = getEffectFlashColor({
          lights,
          layer,
          color: baseColor,
          startTrigger: waitFor,
          startWait: 0,
          holdTime: safeDuration(timing.hold, 0, 0),
          durationIn: safeDuration(timing.fadeIn, 50, 10),
          durationOut: safeDuration(timing.fadeOut, 100, 10),
          endTrigger: 'delay',
          endWait: safeDuration(timing.postDelay, 0, 0),
          easing: easingIn
        });
        break;
      }
      case 'fade-in-out': {
        effect = createTimedColorEffect({
          lights,
          layer,
          waitFor,
          color: baseColor,
          timing,
          easingIn,
          easingOut,
          returnColor: action.secondaryColor ? secondaryColor : undefined
        });
        break;
      }
      case 'sweep': {
        const sweepConfig = action.config?.sweep;
        const sweepDuration = safeDuration(
          sweepConfig?.duration,
          timing.fadeIn + timing.hold + timing.fadeOut || 600,
          100
        );
        const fadeIn = safeDuration(sweepConfig?.fadeIn, timing.fadeIn || 80, 10);
        const fadeOut = safeDuration(sweepConfig?.fadeOut, timing.fadeOut || 120, 10);
        const overlap = clamp(sweepConfig?.overlap ?? 0, 0, 100);
        const betweenDelay = safeDuration(sweepConfig?.betweenDelay, timing.postDelay, 0);
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
          easing: easingIn
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
          transitionDuration: safeDuration(cycleConfig?.transitionDuration, timing.fadeIn || 150, 10),
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
            timing.fadeOut || timing.fadeIn || 200,
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

    if (effect && waitTime > 0) {
      effect = applyChainedTiming(effect, waitTime, waitFor);
    }

    return effect;
  }
}

