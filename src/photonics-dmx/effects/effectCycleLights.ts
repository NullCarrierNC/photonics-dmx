import { Effect, EffectTransition, TrackedLight, RGBIO, WaitCondition } from "../types";
import { IEffect } from "./interfaces/IEffect";

/**
 * Interface for cycling lights effect parameters
 */
export interface CycleLightsEffectParams extends IEffect {
  /** Array of lights to cycle through */
  lights: TrackedLight[];
  /** Base color for lights not currently active */
  baseColor: RGBIO;
  /** Color for the active light */
  activeColor: RGBIO;
  /** Duration in ms for color transitions */
  transitionDuration?: number;
  /** The layer to apply the effect on */
  layer?: number;
  /** The condition that triggers each step in the cycle */
  waitFor?: WaitCondition;
}

/**
 * Returns an effect that sequentially activates one light at a time through the provided array.
 * Each light transitions to the active color when it's its turn, then back to the base color.
 * The sequence waits for the specified trigger (default: beat) between each step.
 */
export const getEffectCycleLights = ({
  lights,
  baseColor,
  activeColor,
  transitionDuration = 100,
  layer = 0,
  waitFor = 'beat',
}: CycleLightsEffectParams): Effect => {
  const sequenceTransitions: EffectTransition[] = [];
  const numLights = lights.length;

  if (numLights === 0) {
    return {
      id: "CycleLightsEffect",
      description: "No lights provided for cycling",
      transitions: [],
    };
  }

  // First light transitions to active color
  sequenceTransitions.push({
    lights: [lights[0]],
    layer: layer,
    waitForCondition: waitFor, // Wait for the specified trigger
    waitForTime: 0, 
    waitUntilCondition: 'none',
    waitUntilTime: 0,
    transform: { 
      color: activeColor,
      easing: 'linear',
      duration: transitionDuration, 
    },
  });

  // Remaining lights: Previous light reverts, current light activates
  for (let i = 1; i < numLights; i++) {
    // Add transition to change light `i-1` back to base color
    sequenceTransitions.push({
      lights: [lights[i-1]], // Target the previous light
      layer: layer,
      waitForCondition: waitFor, 
      waitForTime: 0, 
      waitUntilCondition: 'none',
      waitUntilTime: 0,
      transform: { 
        color: baseColor, 
        easing: 'linear',
        duration: transitionDuration, 
      },
    });
    
    // Add transition to change light `i` to active color
    sequenceTransitions.push({
      lights: [lights[i]], // Target the current light
      layer: layer,
      waitForCondition: 'none', 
      waitForTime: 0, 
      waitUntilCondition: 'none',
      waitUntilTime: 0,
      transform: { 
        color: activeColor, // Change to active
        easing: 'linear',
        duration: transitionDuration, 
      },
    });
  }

  // Final step: Last light transitions back to base color
  sequenceTransitions.push({
    lights: [lights[numLights - 1]], // Target the last light
    layer: layer,
    waitForCondition: waitFor, // Wait for the specified trigger
    waitForTime: 0, 
    waitUntilCondition: 'none',
    waitUntilTime: 0,
    transform: { 
      color: baseColor, // Revert to base
      easing: 'linear',
      duration: transitionDuration, 
    },
  });

  return {
    id: "CycleLightsEffect",
    description: `Each light transitions to active colour on ${waitFor}, cycling through all positions`,
    transitions: sequenceTransitions,
  };
}; 