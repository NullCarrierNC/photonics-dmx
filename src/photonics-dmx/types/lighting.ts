/**
 * Colour, layer and transition shapes shared by every light in the system.
 */

/**
 * Every colour name the lighting system knows, in the order the editors list them.
 */
export const COLOR_OPTIONS = [
  'amber',
  'black',
  'blue',
  'chartreuse',
  'cyan',
  'green',
  'magenta',
  'orange',
  'purple',
  'red',
  'teal',
  'transparent',
  'vermilion',
  'violet',
  'white',
  'yellow',
] as const

/**
 * Represents available colors in the lighting system
 */
export type Color = (typeof COLOR_OPTIONS)[number]

export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && (COLOR_OPTIONS as readonly string[]).includes(value)
}

/**
 * The supported layer blend modes. A cue blendMode outside this set is coerced to 'replace' at
 * runtime (valueResolver / LightTransitionController).
 */
export const BLEND_MODE_OPTIONS = ['mix', 'add', 'replace'] as const

/**
 * Represents how a color should blend with colors on lower layers
 */
export type BlendMode = (typeof BLEND_MODE_OPTIONS)[number]

export function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === 'string' && (BLEND_MODE_OPTIONS as readonly string[]).includes(value)
}

export const BRIGHTNESS_OPTIONS = ['low', 'medium', 'high', 'max', 'linear'] as const

/**
 * Represents brightness levels for lights
 */
export type Brightness = (typeof BRIGHTNESS_OPTIONS)[number]

export function isBrightness(value: unknown): value is Brightness {
  return typeof value === 'string' && (BRIGHTNESS_OPTIONS as readonly string[]).includes(value)
}

/**
 * Interface representing RGB, Intensity, Pan/Tilt values for a light
 */
export interface RGBIO {
  red: number // 0-255
  green: number // 0-255
  blue: number // 0-255
  intensity: number // 0-255

  /** Normalised pan position: 0 = configured min, 100 = configured max (see FixtureConfig). */
  pan?: number
  /** Normalised tilt position: 0 = configured min, 100 = configured max (see FixtureConfig). */
  tilt?: number

  opacity: number // 0.0 to 1.0, controls overall contribution strength
  blendMode: BlendMode // How this color should blend with lower layers
}

/**
 * Interface representing a layer of a light with its RGBIP values
 */
export interface LightLayer {
  layer: number
  value: RGBIO
}

/**
 * Interface representing a virtual light with multiple layers
 */
export interface VirtualLight {
  id: string
  layers: LightLayer[]
}

/**
 * Interface representing the current state of a light
 */
export interface LightState {
  id: string
  value: RGBIO
}

/**
 * Interface defining a transition for light effects
 */
export interface Transition {
  transform: {
    color: RGBIO
    easing: string // e.g., "sin.in"
    duration: number // in milliseconds
  }
  layer: number
}
