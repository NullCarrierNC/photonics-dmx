/**
 * Type representing an easing function that transforms a normalized time value
 */
export type EasingFunction = (t: number) => number;

/**
 * Enum defining all available easing types.
 * This provides a centralized place for referencing easing functions by name.
 */
export enum EasingType {
  // Standard names
  LINEAR = 'linear',
  EASE = 'ease',
  EASE_IN = 'easeIn',
  EASE_OUT = 'easeOut',
  EASE_IN_OUT = 'easeInOut',
  
  // Sin easings
  SIN_IN = 'sinIn',
  SIN_OUT = 'sinOut',
  SIN_IN_OUT = 'sinInOut',
  
  // Quadratic easings
  QUADRATIC_IN = 'quadraticIn',
  QUADRATIC_OUT = 'quadraticOut',
  QUADRATIC_IN_OUT = 'quadraticInOut',
  
  // Cubic easings
  CUBIC_IN = 'cubicIn',
  CUBIC_OUT = 'cubicOut',
  CUBIC_IN_OUT = 'cubicInOut',
}

/**
 * Sin easing-in function.
 * @param t Normalized time (0 to 1).
 * @returns Eased value.
 */
export const sinIn: EasingFunction = (t: number): number => {
  return 1 - Math.cos((t * Math.PI) / 2);
};

/**
 * Sin easing-out function.
 * @param t Normalized time (0 to 1).
 * @returns Eased value.
 */
export const sinOut: EasingFunction = (t: number): number => {
  return Math.sin((t * Math.PI) / 2);
};

/**
 * sin easing-in-out function.
 * @param t Normalized time (0 to 1).
 * @returns Eased value.
 */
export const sinInOut: EasingFunction = (t: number) => {
  return -(Math.cos(Math.PI * t) - 1) / 2;
};

/**
 * Linear easing function.
 * @param t Normalized time (0 to 1).
 * @returns Eased value.
 */
export const linear: EasingFunction = (t: number) => t;

/**
 * Quadratic easing-in function.
 * @param t Normalized time (0 to 1).
 * @returns Eased value.
 */
export const quadraticIn: EasingFunction = (t: number) => t * t;

/**
 * Quadratic easing-out function.
 * @param t Normalized time (0 to 1).
 * @returns Eased value.
 */
export const quadraticOut: EasingFunction = (t: number) => t * (2 - t);

/**
 * Quadratic easing-in-out function.
 * @param t Normalized time (0 to 1).
 * @returns Eased value.
 */
export const quadraticInOut: EasingFunction = (t: number) => {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
};

/**
 * Cubic easing-in function.
 * @param t Normalized time (0 to 1).
 * @returns Eased value.
 */
export const cubicIn: EasingFunction = (t: number) => t * t * t;

/**
 * Cubic easing-out function.
 * @param t Normalized time (0 to 1).
 * @returns Eased value.
 */
export const cubicOut: EasingFunction = (t: number) => --t * t * t + 1;

/**
 * Cubic easing-in-out function.
 * @param t Normalized time (0 to 1).
 * @returns Eased value.
 */
export const cubicInOut: EasingFunction = (t: number) => {
  return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
};

/**
 * Maps between easing types and their corresponding function implementations.
 * This is the centralized mapping that should be used by all components.
 */
export const EASING_MAP: Record<string, EasingFunction> = {
  // Standard names
  [EasingType.LINEAR]: linear,
  [EasingType.EASE]: cubicInOut,
  [EasingType.EASE_IN]: cubicIn,
  [EasingType.EASE_OUT]: cubicOut,
  [EasingType.EASE_IN_OUT]: cubicInOut,
  
  // Sin easings
  [EasingType.SIN_IN]: sinIn,
  [EasingType.SIN_OUT]: sinOut,
  [EasingType.SIN_IN_OUT]: sinInOut,
  
  // Quadratic easings
  [EasingType.QUADRATIC_IN]: quadraticIn,
  [EasingType.QUADRATIC_OUT]: quadraticOut,
  [EasingType.QUADRATIC_IN_OUT]: quadraticInOut,
  
  // Cubic easings
  [EasingType.CUBIC_IN]: cubicIn,
  [EasingType.CUBIC_OUT]: cubicOut,
  [EasingType.CUBIC_IN_OUT]: cubicInOut,
  

};

/**
 * Gets the easing function for a given easing type.
 * If an unrecognized easing type is provided, returns the linear easing function.
 * 
 * @param easingType The easing type (can be enum value or string)
 * @returns The corresponding easing function
 */
export const getEasingFunction = (easingType: EasingType | string): EasingFunction => {
  const easingKey = typeof easingType === 'string' ? easingType : easingType;
  return EASING_MAP[easingKey] || linear;
};
