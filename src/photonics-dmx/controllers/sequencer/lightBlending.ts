/**
 * The colour maths a frame is built from: easing lookup, channel interpolation, and how a layer
 * blends onto the ones below it.
 */
import { RGBIO } from '../../types'
import { getEasingFunction } from '../../easing'

/**
 * Helper method to get the easing function value
 */
export function getEasingValue(progress: number, easingName: string): number {
  // Use the centralized getEasingFunction helper
  const easingFn = getEasingFunction(easingName)
  return easingFn(progress)
}

/**
 * Interpolate between start and end values based on progress
 */
export function interpolate(start: number, end: number, t: number): number {
  // Using Math.max to ensure the result is never negative
  return Math.max(0, Math.round(start + (end - start) * t))
}

/** Interpolate 0-1 float channels (e.g. opacity) without integer rounding */
export function interpolateFloat(start: number, end: number, t: number): number {
  const v = start + (end - start) * t
  return Math.max(0, Math.min(1, v))
}

/**
 * Blends colors using opacity and blend modes
 */
export function blendWithOpacity(current: RGBIO, newState: RGBIO): RGBIO {
  const opacity = newState.opacity ?? 1.0
  const blendMode = newState.blendMode ?? 'replace'

  const out: RGBIO = {
    red: 0,
    green: 0,
    blue: 0,
    intensity: 0,
    opacity: 1.0, // Final result should always be fully opaque
    blendMode: blendMode,
  }

  // Apply blend mode per channel
  switch (blendMode) {
    case 'add':
      if (opacity <= 0.0) {
        // Transparent layer - show underlying color
        out.red = current.red
        out.green = current.green
        out.blue = current.blue
        out.intensity = current.intensity
      } else if (opacity >= 1.0) {
        // Fully opaque - add colors together
        out.red = Math.min(255, current.red + newState.red)
        out.green = Math.min(255, current.green + newState.green)
        out.blue = Math.min(255, current.blue + newState.blue)
        out.intensity = Math.min(255, current.intensity + newState.intensity)
      } else {
        // Partial opacity - add the scaled color to the underlying color
        out.red = Math.min(255, current.red + Math.round(newState.red * opacity))
        out.green = Math.min(255, current.green + Math.round(newState.green * opacity))
        out.blue = Math.min(255, current.blue + Math.round(newState.blue * opacity))
        out.intensity = Math.min(255, current.intensity + Math.round(newState.intensity * opacity))
      }
      break

    case 'mix': {
      // Alpha crossfade: interpolate between the underlying composited colour and this
      // layer's colour by opacity. opacity 0 → underlying, 1 → this layer, between →
      // a smooth blend of the two (a true colour crossfade, not a fade up from black).
      const a = Math.max(0, Math.min(1, opacity))
      out.red = Math.round(current.red * (1 - a) + newState.red * a)
      out.green = Math.round(current.green * (1 - a) + newState.green * a)
      out.blue = Math.round(current.blue * (1 - a) + newState.blue * a)
      out.intensity = Math.round(current.intensity * (1 - a) + newState.intensity * a)
      break
    }

    case 'replace':
    default:
      // Replace (and the fallback for any unrecognised mode): opacity controls the
      // intensity of the replacement colour.
      // 0.0 = transparent (show underlying), 1.0 = full replacement, 0.5 = half intensity.
      if (opacity <= 0.0) {
        out.red = current.red
        out.green = current.green
        out.blue = current.blue
        out.intensity = current.intensity
      } else {
        out.red = Math.round(newState.red * opacity)
        out.green = Math.round(newState.green * opacity)
        out.blue = Math.round(newState.blue * opacity)
        out.intensity = Math.round(newState.intensity * opacity)
      }
      break
  }

  // Handle optional properties: carry forward from the lower layer when the incoming layer omits them
  out.pan = newState.pan !== undefined ? newState.pan : current.pan
  out.tilt = newState.tilt !== undefined ? newState.tilt : current.tilt

  return out
}

/**
 * Returns a "transparent" color with all channels = 0.
 */
export function transparentColor(): RGBIO {
  return {
    red: 0,
    green: 0,
    blue: 0,
    intensity: 0,
    opacity: 0.0,
    blendMode: 'replace',
  }
}

/**
 * Returns a black that hides the layers below it, the colour a light with no layers publishes.
 */
export function opaqueBlack(): RGBIO {
  return {
    red: 0,
    green: 0,
    blue: 0,
    intensity: 0,
    opacity: 1.0,
    blendMode: 'replace',
  }
}
