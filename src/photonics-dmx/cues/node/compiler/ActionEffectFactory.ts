import { WaitCondition, TrackedLight, Effect, EffectTransition, RGBIO, LocationGroup } from '../../../types';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import {
  getEffectSingleColor,
  getEffectCrossFadeColors,
  getEffectFadeInColorFadeOut,
  getEffectFlashColor,
  getSweepEffect,
  getEffectCycleLights,
  getEffectBlackout
} from '../../../effects';
import { getColor } from '../../../helpers/dmxHelpers';
import {
  ActionNode,
  EnvelopeConfig,
  NodeActionTarget,
  NodeColorSetting
} from '../../types/nodeCueTypes';

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

const ensureEnvelope = (envelope?: EnvelopeConfig): EnvelopeConfig => {
  if (!envelope) {
    return {
      attack: 0,
      decay: 0,
      sustainLevel: 1,
      sustainTime: 100,
      release: 150
    };
  }
  return envelope;
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

    const envelope = ensureEnvelope(action.envelope);
    const envelopeScale = clamp(envelope.sustainLevel ?? 1, 0, 1);
    const intensityScale = clamp((params.intensityScale ?? 1) * envelopeScale, 0, 1);
    const waitTime = params.waitTime ?? 0;
    // Preserve the original wait condition - applyDelayToEffect will handle combining event + delay
    const waitFor: WaitCondition = params.waitCondition ?? 'none';
    const layer = action.layer ?? 0;

    const baseColor = resolveColor(action.color, intensityScale || 0.01);
    const secondaryColor = action.secondaryColor
      ? resolveColor(action.secondaryColor, intensityScale || 0.01)
      : resolveColor({ name: 'transparent', brightness: 'low' }, 0);

    const attack = safeDuration(envelope.attack, 100, 0);
    const decay = safeDuration(envelope.decay, 0, 0);
    const sustain = safeDuration(envelope.sustainTime, 0, 0);
    const release = safeDuration(envelope.release, 100, 0);

    let effect: Effect | null = null;

    switch (action.effectType) {
      case 'single-color': {
        const duration = Math.max(50, attack + sustain + release + decay);
        effect = getEffectSingleColor({
          lights,
          layer,
          color: baseColor,
          duration,
          waitFor,
          waitUntil: 'delay',
          untilTime: sustain || 0
        });
        break;
      }
      case 'cross-fade': {
        effect = getEffectCrossFadeColors({
          lights,
          layer,
          startColor: baseColor,
          endColor: secondaryColor,
          duration: Math.max(50, attack || 150),
          waitFor,
          crossFadeTrigger: 'delay',
          afterStartWait: decay,
          afterEndColorWait: release
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
          holdTime: sustain,
          durationIn: Math.max(10, attack || 50),
          durationOut: Math.max(10, release || 100),
          endTrigger: 'delay',
          endWait: decay
        });
        break;
      }
      case 'fade-in-out': {
        const transparent = resolveColor(
          { name: action.color.name, brightness: action.color.brightness, blendMode: action.color.blendMode ?? 'replace' },
          0
        );

        effect = getEffectFadeInColorFadeOut({
          lights,
          layer,
          startColor: transparent,
          endColor: baseColor,
          waitFor,
          waitBeforeFadeIn: decay,
          fadeInDuration: Math.max(10, attack || 50),
          holdDuration: sustain,
          fadeOutDuration: Math.max(10, release || 100),
          waitAfterFadeOut: decay
        });
        break;
      }
      case 'sweep': {
        const sweepConfig = action.config?.sweep;
        const sweepDuration = safeDuration(sweepConfig?.duration, attack + sustain + release || 600, 100);
        const fadeIn = safeDuration(sweepConfig?.fadeIn, attack || 80, 10);
        const fadeOut = safeDuration(sweepConfig?.fadeOut, release || 120, 10);
        const overlap = clamp(sweepConfig?.overlap ?? 0, 0, 100);
        const betweenDelay = safeDuration(sweepConfig?.betweenDelay, decay, 0);
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
          low: lowColor
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
          transitionDuration: safeDuration(cycleConfig?.transitionDuration, attack || 150, 10),
          waitFor: cycleConfig?.trigger || waitFor
        });
        break;
      }
      case 'blackout': {
        effect = getEffectBlackout({
          lights,
          layer,
          duration: safeDuration(action.config?.blackout?.duration, release || 200, 10)
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

