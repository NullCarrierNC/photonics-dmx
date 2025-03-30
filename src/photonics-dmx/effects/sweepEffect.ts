import { Effect, EffectTransition, TrackedLight, RGBIP, WaitCondition } from "../types";
import { IEffect } from "./interfaces/IEffect";
import { EasingType } from "../easing";

/**
 * Base interface for sweep effect parameters
 */
interface SweepEffectBaseParams {
    /** On state colour */
    high: RGBIP;
    /** Off state colour */
    low: RGBIP;
    /** Total time (ms) for one complete sweep across all groups */
    sweepTime: number;
    /** Desired fade‐in duration (ms) */
    fadeInDuration: number;
    /** Desired fade‐out duration (ms) */
    fadeOutDuration: number;
    /** Percentage (0 to 100) by which subsequent lights overlap. 0 means no overlap */
    lightOverlap?: number;
    /** How long to wait until the next sweep can run */
    betweenSweepDelay?: number;
}

/**
 * Interface for sweep effect with single array of lights
 */
interface SweepEffectSingleParams extends IEffect, SweepEffectBaseParams {
    /** Array of lights to sweep across */
    lights: TrackedLight[];
}

/**
 * Interface for sweep effect with grouped lights
 */
interface SweepEffectGroupedParams extends SweepEffectBaseParams {
    /** Array of light groups to sweep across */
    lights: TrackedLight[][];
    /** The layer to apply the effect on */
    layer?: number;
    /** The easing function to use for the effect */
    easing?: EasingType;
    /** The condition that triggers the start of the effect */
    waitFor?: WaitCondition;
}

/**
 * Returns an effect that "sweeps" across the given lights or groups.
 * Each group will:
 *   - Wait until its allocated start time (offset by the group index, adjusted by lightOverlap)
 *   - Fade in from the off (low) state to the on (high) state,
 *   - Remain on for a hold time if possible,
 *   - Then fade out back to off.
 *
 * Overlap logic:
 *   The start delay for each group is scaled by:
 *     effectiveDelay = (1 - lightOverlap/100)
 *   So if lightOverlap is 50, group i starts at i * slotTime * 0.5.
 *
 * Because a positive lightOverlap speeds up the overall effect (the last group's delay is reduced),
 * we calculate the difference in run time and add that (divided by the number of groups)
 * to each group's hold time.
 * 
 * NOTE: Use addEffectUnblocked: unblocked waits for the current pass to end before triggering, 
 *  preventing the timing getting borked.
 */
export const getSweepEffect = ({
  lights,
  high,
  low,
  sweepTime,
  fadeInDuration,
  fadeOutDuration,
  layer = 0,
  easing = EasingType.SIN_OUT,
  waitFor = "delay",
  lightOverlap = 0,
  betweenSweepDelay = 0,
}: SweepEffectSingleParams | SweepEffectGroupedParams): Effect => {
  
  // Normalize the lights into groups.
  // If lights[0] is an array, assume a 2D array was passed.
  const groups: TrackedLight[][] = (lights.length > 0 && Array.isArray(lights[0]))
    ? (lights as TrackedLight[][])
    : (lights as TrackedLight[]).map(light => [light]);

  const numGroups = groups.length;
  // Base slot time if there were no overlap.
  const slotTime = sweepTime / numGroups;
  
  // Calculate effective delay factor based on lightOverlap.
  // For example, if lightOverlap is 50, then effectiveDelayFactor is 0.5.
  const effectiveDelayFactor = 1 - (lightOverlap / 100);

  // If there is an overlap defined between lights, the animation would run 
  // faster than normal since each subsequent light starts sooner.
  // Ergo, calculate by how much faster than apply a holdTime to each light
  // to account for the speed difference.
  // Without overlap the last group would start at (numGroups - 1) * slotTime.
  // With overlap it starts at (numGroups - 1) * slotTime * effectiveDelayFactor.
  // So the total speed-up is:
  const totalSpeedup = (numGroups - 1) * slotTime * (1 - effectiveDelayFactor);
  // Distribute this extra time evenly across all groups.
  const additionalHold = totalSpeedup / numGroups;

  const desiredTotalFade = fadeInDuration + fadeOutDuration;

  let actualFadeIn = fadeInDuration;
  let actualFadeOut = fadeOutDuration;
  let holdTime = 0;
  
  // Calculate the base hold time using the base slotTime.
  if (desiredTotalFade <= slotTime) {
    // Add the extra hold time so that each group's overall cycle is lengthened.
    holdTime = (slotTime - desiredTotalFade) + additionalHold;
  } else {
    // Scale down the fade times so they fit in the base slot.
    // (fade times are too long for the provided duration)
    const scale = slotTime / desiredTotalFade;
    actualFadeIn = fadeInDuration * scale;
    actualFadeOut = fadeOutDuration * scale;
    holdTime = additionalHold;
  }

  const transitions: EffectTransition[] = [];

  groups.forEach((group, index) => {
    // Each group's start delay is scaled by the effectiveDelayFactor.
    const groupDelay = index * slotTime * effectiveDelayFactor;
    // Assign each group a unique layer (base layer plus index)
    const groupLayer = layer + index;

    // Transition 1: Fade in from the low (off) state to high (on)
    transitions.push({
      lights: group,
      layer: groupLayer,
      waitFor: waitFor,        // Use the provided waitFor condition
      forTime: groupDelay,     // Delay before starting this group's fade in
      transform: {
        color: high,
        easing: easing,
        duration: actualFadeIn,
      },
      waitUntil: "delay",
      untilTime: holdTime,     // Hold time at the high state (adjusted with additionalHold)
    });
    
    // Calculate the total time used by the transitions for this group.
    const totalTransitionTime = actualFadeIn + holdTime + actualFadeOut;
    let extraWait = (sweepTime - groupDelay) - totalTransitionTime;
    
    // Overlap logic for fade out: if extraWait is negative, shorten fade-out duration.
    let finalFadeOutDuration = actualFadeOut;
    let fadeOutWaitUntil: WaitCondition = "delay";
    let fadeOutWaitTime = extraWait;
    
    if (extraWait < 0) {
      finalFadeOutDuration = actualFadeOut + extraWait; // extraWait is negative so reduces the duration
      fadeOutWaitUntil = "none";
      fadeOutWaitTime = 0;
    }

    // Transition 2: Fade out from high back to low.
    transitions.push({
      lights: group,
      layer: groupLayer,
      waitFor: "none",
      forTime: 0,           
      transform: {
        color: low,
        easing: easing,
        duration: finalFadeOutDuration,
      },
      waitUntil: fadeOutWaitUntil,
      untilTime: fadeOutWaitTime,
    });

    if(betweenSweepDelay > 0){
      transitions.push({
        lights: group,
        layer: groupLayer,
        waitFor: "none",
        forTime: 0,
        transform: {
          color: low,
          easing: easing,
          duration: 1,
        },
        waitUntil: "delay",
        untilTime: betweenSweepDelay,
      })
    }
  });

  
  return {
    id: "SweepEffect",
    description: "Sequentially sweeps across light groups, fading in to the high state and fading out to the low state. Extra hold time is added when lights overlap so that the overall effect always lasts sweepTime.",
    transitions: transitions,
  };
};