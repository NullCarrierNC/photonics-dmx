/**
 * Colour, layer and transition shapes shared by every light in the system.
 */

/**
 * Represents available colors in the lighting system
 */
export type Color =
  | 'red'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'orange'
  | 'purple'
  | 'chartreuse'
  | 'teal'
  | 'violet'
  | 'magenta'
  | 'vermilion'
  | 'amber'
  | 'white'
  | 'black'
  | 'transparent'

/**
 * Represents how a color should blend with colors on lower layers
 */
export type BlendMode = 'replace' | 'add' | 'mix'

/**
 * Represents brightness levels for lights
 */
export type Brightness = 'low' | 'medium' | 'high' | 'max' | 'linear'

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
