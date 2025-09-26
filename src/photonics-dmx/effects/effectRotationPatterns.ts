import { Effect, EffectTransition, TrackedLight, RGBIO, WaitCondition } from "../types";
import { IEffect } from "./interfaces/IEffect";

/**
 * Interface for rotation pattern effect parameters
 */
export interface RotationPatternEffectParams extends IEffect {
  /** Array of lights to rotate through */
  lights: TrackedLight[];
  /** Color for the active light */
  activeColor: RGBIO;
  /** Color for inactive lights (usually transparent) */
  baseColor: RGBIO;
  /** The layer to apply the effect on */
  layer?: number;
  /** The condition that triggers each step in the rotation */
  waitFor?: WaitCondition;
  /** Number of beats per full rotation cycle (default: 1) */
  beatsPerCycle?: number;
  /** Starting position offset (default: 0) */
  startOffset?: number;
  /** Whether to reverse the rotation direction (default: false) */
  reverse?: boolean;
}

/**
 * Interface for dual-mode rotation effect parameters
 */
export interface DualModeRotationEffectParams extends RotationPatternEffectParams {
  /** Whether this is a large venue (affects behavior) */
  isLargeVenue: boolean;
  /** Color for solid mode (when not rotating) */
  solidColor: RGBIO;
  /** The condition that triggers mode switching (default: 'measure') */
  modeSwitchTrigger?: WaitCondition;
}

/**
 * Interface for alternating pattern effect parameters
 */
export interface AlternatingPatternEffectParams {
  /** Array of lights for pattern A */
  patternALights: TrackedLight[];
  /** Array of lights for pattern B */
  patternBLights: TrackedLight[];
  /** Color for the active pattern */
  activeColor: RGBIO;
  /** Color for inactive pattern */
  baseColor: RGBIO;
  /** The layer to apply the effect on */
  layer?: number;
  /** The condition that triggers pattern switching */
  switchTrigger?: WaitCondition;
  /** The condition that triggers pattern completion */
  completeTrigger?: WaitCondition;
}

/**
 * Creates a clockwise rotation effect
 * Pattern: 0→1→2→3→4→5→6→7 responding to beats
 */
export const getEffectClockwiseRotation = ({
  lights,
  activeColor,
  baseColor,
  layer = 0,
  waitFor = 'beat',
  beatsPerCycle = 1,
  startOffset = 0,
}: RotationPatternEffectParams): Effect => {
  const transitions: EffectTransition[] = [];

  for (let lightIndex = 0; lightIndex < lights.length; lightIndex++) {
    const light = lights[lightIndex];
    
    // Calculate when this light should be active based on its position
    // Clockwise: starts at position 0 + offset and steps forward
    const stepsUntilActive = (lightIndex - startOffset + lights.length) % lights.length;
    
    // Phase 1: Wait until it's this light's turn
    if (stepsUntilActive > 0) {
      transitions.push({
        lights: [light],
        layer: layer,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
          color: baseColor,
          easing: 'linear',
          duration: 0,
        },
        waitUntilCondition: waitFor,
        waitUntilTime: 0,
        waitUntilConditionCount: stepsUntilActive * beatsPerCycle
      });
    }
    
    // Phase 2: Turn on active color
    transitions.push({
      lights: [light],
      layer: layer,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: {
        color: activeColor,
        easing: 'linear',
        duration: 0,
      },
      waitUntilCondition: waitFor,
      waitUntilTime: 0,
      waitUntilConditionCount: beatsPerCycle
    });
    
    // Phase 3: Turn off and wait for cycle completion
    const stepsAfterActive = lights.length - stepsUntilActive - 1;
    if (stepsAfterActive > 0) {
      transitions.push({
        lights: [light],
        layer: layer,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
          color: baseColor,
          easing: 'linear',
          duration: 0,
        },
        waitUntilCondition: waitFor,
        waitUntilTime: 0,
        waitUntilConditionCount: stepsAfterActive * beatsPerCycle
      });
    }
  }

  return {
    id: "ClockwiseRotationEffect",
    description: `Clockwise rotation pattern (${lights.length} lights) responding to ${waitFor}`,
    transitions: transitions
  };
};

/**
 * Creates a counter-clockwise rotation effect
 * Pattern: 0→7→6→5→4→3→2→1 responding to beats
 */
export const getEffectCounterClockwiseRotation = ({
  lights,
  activeColor,
  baseColor,
  layer = 0,
  waitFor = 'beat',
  beatsPerCycle = 1,
  startOffset = 0,
}: RotationPatternEffectParams): Effect => {
  const transitions: EffectTransition[] = [];

  for (let lightIndex = 0; lightIndex < lights.length; lightIndex++) {
    const light = lights[lightIndex];
    
    // Calculate when this light should be active based on its position
    // Counter-clockwise: starts at position 0 + offset and steps backward
    const stepsUntilActive = (startOffset - lightIndex + lights.length) % lights.length;
    
    // Phase 1: Wait until it's this light's turn
    if (stepsUntilActive > 0) {
      transitions.push({
        lights: [light],
        layer: layer,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
          color: baseColor,
          easing: 'linear',
          duration: 0,
        },
        waitUntilCondition: waitFor,
        waitUntilTime: 0,
        waitUntilConditionCount: stepsUntilActive * beatsPerCycle
      });
    }
    
    // Phase 2: Turn on active color
    transitions.push({
      lights: [light],
      layer: layer,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: {
        color: activeColor,
        easing: 'linear',
        duration: 0,
      },
      waitUntilCondition: waitFor,
      waitUntilTime: 0,
      waitUntilConditionCount: beatsPerCycle
    });
    
    // Phase 3: Turn off and wait for cycle completion
    const stepsAfterActive = lights.length - stepsUntilActive - 1;
    if (stepsAfterActive > 0) {
      transitions.push({
        lights: [light],
        layer: layer,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
          color: baseColor,
          easing: 'linear',
          duration: 0,
        },
        waitUntilCondition: waitFor,
        waitUntilTime: 0,
        waitUntilConditionCount: stepsAfterActive * beatsPerCycle
      });
    }
  }

  return {
    id: "CounterClockwiseRotationEffect",
    description: `Counter-clockwise rotation pattern (${lights.length} lights) responding to ${waitFor}`,
    transitions: transitions
  };
};

/**
 * Creates a dual-mode rotation effect
 * Large venues: Alternating between rotation and solid modes
 * Small venues: Only rotation mode
 */
export const getEffectDualModeRotation = ({
  lights,
  activeColor,
  baseColor,
  solidColor,
  isLargeVenue,
  layer = 0,
  waitFor = 'beat',
  beatsPerCycle = 1,
  modeSwitchTrigger = 'measure',
}: DualModeRotationEffectParams): Effect => {
  const transitions: EffectTransition[] = [];

  if (isLargeVenue) {
    // Large venue: Dual mode with measure-based toggle
    // Mode 1: Counter-clockwise rotation
    const rotationEffect = getEffectCounterClockwiseRotation({
      lights,
      activeColor,
      baseColor,
      layer,
      waitFor,
      beatsPerCycle,
    });
    transitions.push(...rotationEffect.transitions);
    
    // Mode 2: Solid color (triggered on measure to switch modes)
    transitions.push({
      lights: lights,
      layer: layer,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: { color: solidColor, easing: 'linear', duration: 0 },
      waitUntilCondition: modeSwitchTrigger,
      waitUntilTime: 0
    });
    
    transitions.push({
      lights: lights,
      layer: layer,
      waitForCondition: 'none',
      waitForTime: 0,
      transform: { color: baseColor, easing: 'linear', duration: 0 },
      waitUntilCondition: modeSwitchTrigger,
      waitUntilTime: 0
    });
  } else {
    // Small venue: Only counter-clockwise rotation
    const rotationEffect = getEffectCounterClockwiseRotation({
      lights,
      activeColor,
      baseColor,
      layer,
      waitFor,
      beatsPerCycle,
    });
    transitions.push(...rotationEffect.transitions);
  }

  return {
    id: "DualModeRotationEffect",
    description: `Dual-mode rotation pattern (${isLargeVenue ? 'spinning/solid toggle' : 'spinning only'})`,
    transitions: transitions
  };
};

/**
 * Creates an alternating pattern effect
 * Pattern A and Pattern B alternate based on trigger events
 */
export const getEffectAlternatingPatterns = ({
  patternALights,
  patternBLights,
  activeColor,
  baseColor,
  layer = 0,
  switchTrigger = 'keyframe',
  completeTrigger = 'beat',
}: AlternatingPatternEffectParams): Effect => {
  const transitions: EffectTransition[] = [];
  
  // Pattern A: Flash on first trigger, then off
  transitions.push({
    lights: patternALights,
    layer: layer,
    waitForCondition: 'none',
    waitForTime: 0,
    transform: { color: activeColor, easing: 'linear', duration: 0 },
    waitUntilCondition: switchTrigger,
    waitUntilTime: 0
  });
  
  transitions.push({
    lights: patternALights,
    layer: layer,
    waitForCondition: 'none',
    waitForTime: 0,
    transform: { color: baseColor, easing: 'linear', duration: 0 },
    waitUntilCondition: completeTrigger,
    waitUntilTime: 0
  });
  
  // Pattern B: Flash on second trigger, then off
  transitions.push({
    lights: patternBLights,
    layer: layer,
    waitForCondition: 'none',
    waitForTime: 0,
    transform: { color: baseColor, easing: 'linear', duration: 0 },
    waitUntilCondition: switchTrigger,
    waitUntilTime: 0
  });
  
  transitions.push({
    lights: patternBLights,
    layer: layer,
    waitForCondition: 'none',
    waitForTime: 0,
    transform: { color: activeColor, easing: 'linear', duration: 0 },
    waitUntilCondition: switchTrigger,
    waitUntilTime: 0
  });
  
  transitions.push({
    lights: patternBLights,
    layer: layer,
    waitForCondition: 'none',
    waitForTime: 0,
    transform: { color: baseColor, easing: 'linear', duration: 0 },
    waitUntilCondition: completeTrigger,
    waitUntilTime: 0
  });

  return {
    id: "AlternatingPatternsEffect",
    description: `Alternating patterns (A: ${patternALights.length} lights, B: ${patternBLights.length} lights) on ${switchTrigger}`,
    transitions: transitions
  };
};
