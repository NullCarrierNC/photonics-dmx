import {
  BlendMode,
  Brightness,
  Color,
  FixtureTypes,
  RgbDmxChannels,
  RGBIO,
  RgbMovingHeadDmxChannels,
  RgbStrobeDmxChannels,
  RgbwDmxChannels,
  RgbwMovingHeadDmxChannels,
  RgbwStrobeDmxCannels,
  StrobeDmxChannels,
} from '../types'

/**
 * Converts a normalised percentage (0–100) to a DMX value (0–255) within the fixture's
 * configured min/max range. 0% = min, 100% = max.
 */
export function percentToDmx(pct: number, min: number, max: number): number {
  const clampedPct = Math.max(0, Math.min(100, pct))
  const value = min + (clampedPct / 100) * (max - min)
  return Math.max(0, Math.min(255, Math.round(value)))
}

/**
 * Converts a DMX value to a normalised percentage (0–100) within min/max.
 * Used when bridging fixture home (DMX) into RGBIO percentage space.
 */
export function dmxToPercent(dmx: number, min: number, max: number): number {
  if (max === min) {
    return 50
  }
  const clampedDmx = Math.max(0, Math.min(255, dmx))
  const pct = ((clampedDmx - min) / (max - min)) * 100
  return Math.max(0, Math.min(100, pct))
}

/**
 * Converts a signed degree offset from fixture home into a percentage of the configured
 * physical range (see FixtureConfig panRangeDeg / tiltRangeDeg).
 */
export function degreeOffsetToPercent(offsetDeg: number, rangeDeg: number): number {
  if (!Number.isFinite(offsetDeg) || !Number.isFinite(rangeDeg) || rangeDeg <= 0) {
    return 0
  }
  return (offsetDeg / rangeDeg) * 100
}

/**
 * Mirrors a normalised percentage around a home percentage (both 0–100).
 */
export function mirrorPercentAroundHome(percent: number, homePercent: number): number {
  const mirrored = 2 * homePercent - percent
  return Math.max(0, Math.min(100, mirrored))
}

/**
 * Inverts pan/tilt DMX for truss-mounted fixtures: end-for-end mirror across the channel span.
 * Mounting inversion flips physical endpoints; it is independent of idle home percent.
 */
export function mirrorDmxForMovingHeadInvert(
  dmx: number,
  channelMin: number,
  channelMax: number,
): number {
  const span = channelMax - channelMin
  if (span <= 0) {
    return Math.max(0, Math.min(255, Math.round(dmx)))
  }
  const d = Math.max(0, Math.min(255, Math.round(dmx)))
  const mirrored = channelMin + channelMax - d
  return Math.max(0, Math.min(255, Math.round(mirrored)))
}

/**
 * Logical pan direction for stage-relative math (bearing, motion engine, preview disc).
 * `panDirectionCW` is the user's physical observation (clockwise from above when pan DMX increases).
 * When `invertPan` mirrors DMX for truss mounting, logical motor direction can differ from that
 * observation; XOR combines both so logical motor increase matches clockwise stage bearing increase.
 */
export function logicalPanDir(c: { panDirectionCW: boolean; invertPan: boolean }): 1 | -1 {
  return c.panDirectionCW !== c.invertPan ? 1 : -1
}

/**
 * Logical tilt direction for stage-relative math.
 * Up-firing fixtures use motor-positive tilt as logical-positive; down-firing fixtures invert it.
 */
export function logicalTiltDir(c: { invertTilt: boolean }): 1 | -1 {
  return c.invertTilt ? -1 : 1
}

/**
 * For waveform / static-offset paths, inverted fixtures with a home position away from 50%
 * need a percentage-space mirror so that stage-relative degree offsets land on the correct
 * side of the physical home after the DMX publisher applies its channel-midpoint inversion.
 * This mirror is independent of `tiltStageDeg`.
 */
export function shouldMirrorTiltForStageRelative(c: {
  invertTilt: boolean
  tiltHome: number
}): boolean {
  return c.invertTilt && Math.abs(c.tiltHome - 50) > 0.5
}

/**
 * For gimbal IK, the solver requires phi0 = tiltHomeDeg − tiltStageDeg to be positive so the
 * home beam is on the correct side of the tilt pole. When an inverted fixture's logical home is
 * below the pole (phi0 < 0), we mirror the home across the pole in degree space to produce a
 * canonical IK home with phi0 > 0. The canonical orbit (around the mirrored home) maps back to
 * the actual orbit via pole-reflection of the IK output. When phi0 >= 0 the IK runs correctly
 * in-place and the actual home is returned unchanged.
 *
 * The returned value may exceed [0, tiltRangeDeg] and must NOT be used for headroom or
 * motor-bounds checks — only for IK geometry.
 */
export function canonicalGimbalTiltHomeDeg(c: {
  invertTilt: boolean
  tiltHome: number
  tiltRangeDeg: number
  tiltStageDeg: number
}): number {
  const tiltHomeDeg = (c.tiltHome / 100) * c.tiltRangeDeg
  const phi0 = tiltHomeDeg - c.tiltStageDeg
  if (c.invertTilt && phi0 < -1e-9) {
    return 2 * c.tiltStageDeg - tiltHomeDeg
  }
  return tiltHomeDeg
}

// Global brightness configuration - will be set by the application
let globalBrightnessConfig: { low: number; medium: number; high: number; max: number } | null = null

/**
 * Sets the global brightness configuration
 * @param config - The brightness configuration to use globally
 */
export const setGlobalBrightnessConfig = (config: {
  low: number
  medium: number
  high: number
  max: number
}): void => {
  globalBrightnessConfig = config
}

/**
 * Gets the current global brightness configuration
 * @returns The current brightness configuration or null if not set
 */
export const getGlobalBrightnessConfig = (): {
  low: number
  medium: number
  high: number
  max: number
} | null => {
  return globalBrightnessConfig
}

/**
 * Generates an RGBIP object based on the specified color and brightness.
 *
 * @param color - The base color from the color wheel, 'white', 'black', or 'transparent'.
 * @param brightness - The brightness level ('low', 'medium', 'high', 'max', 'linear'). Ignored for black/transparent.
 * @param blendMode - The blend mode for color mixing
 * @returns An RGBIP object with the specified color and brightness.
 */
// Color map - single source of truth for valid colors and their RGB values
const colorMap: { [key in Color]: { r: number; g: number; b: number } } = {
  red: { r: 255, g: 0, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  yellow: { r: 255, g: 255, b: 0 },
  green: { r: 0, g: 255, b: 0 },
  cyan: { r: 0, g: 255, b: 255 },
  orange: { r: 255, g: 127, b: 0 },
  purple: { r: 128, g: 0, b: 128 },
  chartreuse: { r: 127, g: 255, b: 0 },
  teal: { r: 0, g: 128, b: 128 },
  violet: { r: 138, g: 43, b: 226 },
  magenta: { r: 255, g: 0, b: 255 },
  vermilion: { r: 227, g: 66, b: 52 },
  amber: { r: 255, g: 191, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  black: { r: 0, g: 0, b: 0 },
  transparent: { r: 0, g: 0, b: 0 },
}

/**
 * Validates a string and converts it to a Color type.
 * Uses the colorMap as the single source of truth for valid colors.
 *
 * @param colorString - The color string to validate
 * @returns A valid Color type, or 'white' as fallback if invalid
 */
export const validateColorString = (colorString: string): Color => {
  const normalizedColor = colorString.toLowerCase() as Color
  // Check if the normalized string exists as a key in colorMap
  return normalizedColor in colorMap ? normalizedColor : 'white'
}

/**
 * CSS `background-color` for cue-editor node previews. Palette names like `amber` and `vermilion`
 * are not valid CSS named colours; map from the same colorMap used for DMX output.
 */
export const getPaletteColorCssRgb = (color: Color): string => {
  const c = colorMap[color]
  return `rgb(${c.r}, ${c.g}, ${c.b})`
}

export const getColor = (
  color: Color,
  brightness: Brightness,
  blendMode: BlendMode = 'replace',
): RGBIO => {
  const defaultBrightnessMap: Record<Exclude<Brightness, 'linear'>, number> = {
    low: 40,
    medium: 100,
    high: 180,
    max: 255,
  }

  const brightnessMap = globalBrightnessConfig || defaultBrightnessMap

  if (color === 'black') {
    return {
      red: 0,
      green: 0,
      blue: 0,
      intensity: 0,
      opacity: 1.0,
      blendMode: blendMode,
    }
  }

  if (color === 'transparent') {
    return {
      red: 0,
      green: 0,
      blue: 0,
      intensity: 0,
      opacity: 0.0,
      blendMode: blendMode,
    }
  }

  const selectedColor = colorMap[color]

  if (brightness === 'linear') {
    return {
      red: selectedColor.r,
      green: selectedColor.g,
      blue: selectedColor.b,
      intensity: 255,
      opacity: 1.0,
      blendMode,
    }
  }

  const selectedIntensity = brightnessMap[brightness]

  // Construct the RGBIP object
  return {
    red: selectedColor.r,
    green: selectedColor.g,
    blue: selectedColor.b,
    intensity: selectedIntensity,

    opacity: 1.0,
    blendMode: blendMode,
  }
}

/**
 * Casts a channel configuration to the appropriate fixture type
 *
 * @param fixtureType - The type of fixture to cast to
 * @param channels - Channel configuration object
 * @returns A strongly-typed channel object for the specified fixture type
 */
export const castToChannelType = (
  fixtureType: FixtureTypes,
  channels: { [key: string]: number },
):
  | RgbDmxChannels
  | RgbStrobeDmxChannels
  | RgbwDmxChannels
  | RgbwStrobeDmxCannels
  | StrobeDmxChannels
  | RgbMovingHeadDmxChannels
  | RgbwMovingHeadDmxChannels => {
  switch (fixtureType) {
    case FixtureTypes.RGB:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        masterDimmer: channels.masterDimmer || 0,
      } as RgbDmxChannels
    case FixtureTypes.RGBS:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        masterDimmer: channels.masterDimmer || 0,
        strobeSpeed: channels.strobeSpeed || 0,
      } as RgbStrobeDmxChannels
    case FixtureTypes.RGBW:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        white: channels.white || 0,
        masterDimmer: channels.masterDimmer || 0,
      } as RgbwDmxChannels
    case FixtureTypes.RGBWS:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        white: channels.white || 0,
        masterDimmer: channels.masterDimmer || 0,
        strobeSpeed: channels.strobeSpeed || 0,
      } as RgbwStrobeDmxCannels
    case FixtureTypes.STROBE:
      return {
        masterDimmer: channels.masterDimmer || 0,
        strobeSpeed: channels.strobeSpeed || 0,
      } as StrobeDmxChannels
    case FixtureTypes.RGBMH:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        masterDimmer: channels.masterDimmer || 0,
        pan: channels.pan || 0,
        tilt: channels.tilt || 0,
      } as RgbMovingHeadDmxChannels
    case FixtureTypes.RGBWMH:
      return {
        red: channels.red || 0,
        green: channels.green || 0,
        blue: channels.blue || 0,
        white: channels.white || 0,
        masterDimmer: channels.masterDimmer || 0,
        pan: channels.pan || 0,
        tilt: channels.tilt || 0,
      } as RgbwMovingHeadDmxChannels
    default:
      throw new Error(`Unknown fixture type: ${fixtureType}`)
  }
}
