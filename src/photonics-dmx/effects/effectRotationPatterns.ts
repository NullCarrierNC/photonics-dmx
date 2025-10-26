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
  /** Condition that must be met before the transition starts */
  waitForCondition?: WaitCondition;
  /** Time to wait before the transition starts (ms) */
  waitForTime?: number;
  /** Number of condition events before the transition starts */
  waitForConditionCount?: number;
  /** Condition that must be met before the next transition */
  waitUntilCondition?: WaitCondition;
  /** Time to wait before the next transition (ms) */
  waitUntilTime?: number;
  /** Number of condition events before the next transition */
  waitUntilConditionCount?: number;
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
  /** The condition that triggers mode switching */
  modeSwitchCondition?: WaitCondition;
  /** Time for mode switching (ms) */
  modeSwitchTime?: number;
  /** Condition count for mode switching */
  modeSwitchConditionCount?: number;
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
  /** Condition that triggers pattern switching */
  switchCondition?: WaitCondition;
  /** Time for pattern switching (ms) */
  switchTime?: number;
  /** Condition count for pattern switching */
  switchConditionCount?: number;
  /** Condition that triggers pattern completion */
  completeCondition?: WaitCondition;
  /** Time for pattern completion (ms) */
  completeTime?: number;
  /** Condition count for pattern completion */
  completeConditionCount?: number;
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
  waitForCondition = 'none',
  waitForTime = 0,
  waitForConditionCount = 0,
  waitUntilCondition = 'none',
  waitUntilTime = 0,
  waitUntilConditionCount = 0,
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
        waitForCondition: waitForCondition,
        waitForTime: waitForTime,
        waitForConditionCount: waitForConditionCount,
        transform: {
          color: baseColor,
          easing: 'linear',
          duration: 0,
        },
        waitUntilCondition: waitUntilCondition,
        waitUntilTime: waitUntilTime,
        waitUntilConditionCount: (stepsUntilActive * beatsPerCycle) + waitUntilConditionCount
      });
    }
    
    // Phase 2: Turn on active color
    transitions.push({
      lights: [light],
      layer: layer,
      waitForCondition: waitForCondition,
      waitForTime: waitForTime,
      waitForConditionCount: waitForConditionCount,
      transform: {
        color: activeColor,
        easing: 'linear',
        duration: 0,
      },
      waitUntilCondition: waitUntilCondition,
      waitUntilTime: waitUntilTime,
      waitUntilConditionCount: beatsPerCycle + waitUntilConditionCount
    });
    
    // Phase 3: Turn off and wait for cycle completion
    const stepsAfterActive = lights.length - stepsUntilActive - 1;
    if (stepsAfterActive > 0) {
      transitions.push({
        lights: [light],
        layer: layer,
        waitForCondition: waitForCondition,
        waitForTime: waitForTime,
        waitForConditionCount: waitForConditionCount,
        transform: {
          color: baseColor,
          easing: 'linear',
          duration: 0,
        },
        waitUntilCondition: waitUntilCondition,
        waitUntilTime: waitUntilTime,
        waitUntilConditionCount: (stepsAfterActive * beatsPerCycle) + waitUntilConditionCount
      });
    }
  }

  return {
    id: "ClockwiseRotationEffect",
    description: `Clockwise rotation pattern (${lights.length} lights)`,
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
  waitForCondition = 'none',
  waitForTime = 0,
  waitForConditionCount = 0,
  waitUntilCondition = 'none',
  waitUntilTime = 0,
  waitUntilConditionCount = 0,
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
        waitForCondition: waitForCondition,
        waitForTime: waitForTime,
        waitForConditionCount: waitForConditionCount,
        transform: {
          color: baseColor,
          easing: 'linear',
          duration: 0,
        },
        waitUntilCondition: waitUntilCondition,
        waitUntilTime: waitUntilTime,
        waitUntilConditionCount: (stepsUntilActive * beatsPerCycle) + waitUntilConditionCount
      });
    }
    
    // Phase 2: Turn on active color
    transitions.push({
      lights: [light],
      layer: layer,
      waitForCondition: waitForCondition,
      waitForTime: waitForTime,
      waitForConditionCount: waitForConditionCount,
      transform: {
        color: activeColor,
        easing: 'linear',
        duration: 0,
      },
      waitUntilCondition: waitUntilCondition,
      waitUntilTime: waitUntilTime,
      waitUntilConditionCount: beatsPerCycle + waitUntilConditionCount
    });
    
    // Phase 3: Turn off and wait for cycle completion
    const stepsAfterActive = lights.length - stepsUntilActive - 1;
    if (stepsAfterActive > 0) {
      transitions.push({
        lights: [light],
        layer: layer,
        waitForCondition: waitForCondition,
        waitForTime: waitForTime,
        waitForConditionCount: waitForConditionCount,
        transform: {
          color: baseColor,
          easing: 'linear',
          duration: 0,
        },
        waitUntilCondition: waitUntilCondition,
        waitUntilTime: waitUntilTime,
        waitUntilConditionCount: (stepsAfterActive * beatsPerCycle) + waitUntilConditionCount
      });
    }
  }

  return {
    id: "CounterClockwiseRotationEffect",
    description: `Counter-clockwise rotation pattern (${lights.length} lights)`,
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
  waitForCondition = 'none',
  waitForTime = 0,
  waitForConditionCount = 0,
  waitUntilCondition = 'none',
  waitUntilTime = 0,
  waitUntilConditionCount = 0,
  beatsPerCycle = 1,
  startOffset = 0,
  modeSwitchCondition = 'measure',
  modeSwitchTime = 0,
  modeSwitchConditionCount = 0,
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
      waitForCondition,
      waitForTime,
      waitForConditionCount,
      waitUntilCondition,
      waitUntilTime,
      waitUntilConditionCount,
      beatsPerCycle,
      startOffset,
    });
    transitions.push(...rotationEffect.transitions);
    
    // Mode 2: Solid color (triggered on measure to switch modes)
    transitions.push({
      lights: lights,
      layer: layer,
      waitForCondition: waitForCondition,
      waitForTime: waitForTime,
      waitForConditionCount: waitForConditionCount,
      transform: { color: solidColor, easing: 'linear', duration: 0 },
      waitUntilCondition: modeSwitchCondition,
      waitUntilTime: modeSwitchTime,
      waitUntilConditionCount: modeSwitchConditionCount
    });
    
    transitions.push({
      lights: lights,
      layer: layer,
      waitForCondition: waitForCondition,
      waitForTime: waitForTime,
      waitForConditionCount: waitForConditionCount,
      transform: { color: baseColor, easing: 'linear', duration: 0 },
      waitUntilCondition: modeSwitchCondition,
      waitUntilTime: modeSwitchTime,
      waitUntilConditionCount: modeSwitchConditionCount
    });
  } else {
    // Small venue: Only counter-clockwise rotation
    const rotationEffect = getEffectCounterClockwiseRotation({
      lights,
      activeColor,
      baseColor,
      layer,
      waitForCondition,
      waitForTime,
      waitForConditionCount,
      waitUntilCondition,
      waitUntilTime,
      waitUntilConditionCount,
      beatsPerCycle,
      startOffset,
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
  switchCondition = 'keyframe',
  switchTime = 0,
  switchConditionCount = 0,
  completeCondition = 'none',
  completeTime = 0,
  completeConditionCount = 0,
}: AlternatingPatternEffectParams): Effect => {
  const transitions: EffectTransition[] = [];
  
  // Pattern A: Flash on first trigger, then off
  transitions.push({
    lights: patternALights,
    layer: layer,
    waitForCondition: 'none',
    waitForTime: 0,
    waitForConditionCount: 0,
    transform: { color: activeColor, easing: 'linear', duration: 0 },
    waitUntilCondition: switchCondition,
    waitUntilTime: switchTime,
    waitUntilConditionCount: switchConditionCount
  });
  
  transitions.push({
    lights: patternALights,
    layer: layer,
    waitForCondition: 'none',
    waitForTime: 0,
    waitForConditionCount: 0,
    transform: { color: baseColor, easing: 'linear', duration: 0 },
    waitUntilCondition: completeCondition,
    waitUntilTime: completeTime,
    waitUntilConditionCount: completeConditionCount
  });
  
  // Pattern B: Flash on second trigger, then off
  transitions.push({
    lights: patternBLights,
    layer: layer,
    waitForCondition: 'none',
    waitForTime: 0,
    waitForConditionCount: 0,
    transform: { color: baseColor, easing: 'linear', duration: 0 },
    waitUntilCondition: switchCondition,
    waitUntilTime: switchTime,
    waitUntilConditionCount: switchConditionCount
  });
  
  transitions.push({
    lights: patternBLights,
    layer: layer,
    waitForCondition: 'none',
    waitForTime: 0,
    waitForConditionCount: 0,
    transform: { color: activeColor, easing: 'linear', duration: 0 },
    waitUntilCondition: switchCondition,
    waitUntilTime: switchTime,
    waitUntilConditionCount: switchConditionCount
  });
  
  transitions.push({
    lights: patternBLights,
    layer: layer,
    waitForCondition: 'none',
    waitForTime: 0,
    waitForConditionCount: 0,
    transform: { color: baseColor, easing: 'linear', duration: 0 },
    waitUntilCondition: completeCondition,
    waitUntilTime: completeTime,
    waitUntilConditionCount: completeConditionCount
  });

  return {
    id: "AlternatingPatternsEffect",
    description: `Alternating patterns (A: ${patternALights.length} lights, B: ${patternBLights.length} lights)`,
    transitions: transitions
  };
};
