import { RGBIP, TrackedLight, WaitCondition } from "../types";
import { EasingType } from "../easing";

/**
 * The base interface for all lighting effects.
 * Defines the common properties required for configuring visual effects.
 * More complex effects may extend this with additional properties.
 */
export interface EffectInterface {
  /** The condition that triggers the start of the effect */
  waitFor?: WaitCondition;
  
  /** Time to wait before starting the effect (in ms) */
  forTime?: number;
  
  /** The colour configuration for the effect */
  color: RGBIP;
  
  /** Duration of the effect (in ms) */
  duration: number;
  
  /** The condition that triggers the end of the effect */
  waitUntil?: WaitCondition;
  
  /** Time to wait before ending the effect (in ms) */
  untilTime?: number;
  
  /** The lights affected by this effect */
  lights: TrackedLight[];
  
  /** The layer to apply the effect on (for layered lighting) */
  layer?: number;
  
  /** The easing function to use for the effect */
  easing?: EasingType;
}