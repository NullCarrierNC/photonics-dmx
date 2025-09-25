/**
 * This file consolidates exports from all effect modules
 */

export type { IEffect } from './interfaces/IEffect';
export { getEffectSingleColor } from './effectSingleColor';
export { getEffectCrossFadeColors } from './effectCrossFadeColors';
export { getEffectFadeInColorFadeOut } from './effectFadeInColorFadeOut';
export { getEffectFlashColor } from './effectFlashColor';
export { getEffectBlackout } from './effectBlackout';
export { getSweepEffect } from './sweepEffect';
export { getEffectCycleLights } from './effectCycleLights';
export { 
  getEffectClockwiseRotation, 
  getEffectCounterClockwiseRotation, 
  getEffectDualModeRotation, 
  getEffectAlternatingPatterns 
} from './effectRotationPatterns'; 