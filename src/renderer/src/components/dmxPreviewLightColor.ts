import {
  DmxFixture,
  FixtureTypes,
  RgbDmxChannels,
  RgbwDmxChannels,
} from '../../../photonics-dmx/types'

/**
 * When output is black with master dimmer at zero, 3D preview uses dark grey so fixture bodies stay
 * visible on the dark stage. 2D disc preview keeps black when off.
 */
const PREVIEW_OFF_RGB_3D = { r: 48, g: 48, b: 52 } as const

function blackToOffStateGrey3d(
  rgb: { r: number; g: number; b: number },
  masterDimmerIsZero: boolean,
): { r: number; g: number; b: number } {
  if (masterDimmerIsZero && rgb.r === 0 && rgb.g === 0 && rgb.b === 0) {
    return {
      r: PREVIEW_OFF_RGB_3D.r,
      g: PREVIEW_OFF_RGB_3D.g,
      b: PREVIEW_OFF_RGB_3D.b,
    }
  }
  return rgb
}

function finalizePreviewRgb(
  rgb: { r: number; g: number; b: number },
  masterDimmerIsZero: boolean,
  use3dOffGrey: boolean,
): { r: number; g: number; b: number } {
  if (!use3dOffGrey) {
    return rgb
  }
  return blackToOffStateGrey3d(rgb, masterDimmerIsZero)
}

/**
 * RGB 0–255 from DMX for preview.
 * @param use3dOffGrey When true (3D stage), black at MD 0 becomes dark grey for fixture visibility. Omit or false for 2D (black when off).
 */
export function getDmxPreviewLightColor(
  light: DmxFixture,
  dmxValues: Record<number, number>,
  use3dOffGrey = false,
): { r: number; g: number; b: number } {
  const { channels, fixture } = light

  if (fixture === FixtureTypes.STROBE) {
    const dimmer = dmxValues[channels.masterDimmer] ?? 0
    const v = Math.round(255 * (dimmer / 255))
    return finalizePreviewRgb({ r: v, g: v, b: v }, dimmer === 0, use3dOffGrey)
  }

  if (
    fixture === FixtureTypes.RGB ||
    fixture === FixtureTypes.RGBS ||
    fixture === FixtureTypes.RGBMH
  ) {
    const rgbChannels = channels as RgbDmxChannels
    const red = dmxValues[rgbChannels.red] || 0
    const green = dmxValues[rgbChannels.green] || 0
    const blue = dmxValues[rgbChannels.blue] || 0
    const dimmer = dmxValues[rgbChannels.masterDimmer] ?? 0
    const scale = dimmer / 255
    return finalizePreviewRgb(
      {
        r: Math.round(red * scale),
        g: Math.round(green * scale),
        b: Math.round(blue * scale),
      },
      dimmer === 0,
      use3dOffGrey,
    )
  }

  if (
    fixture === FixtureTypes.RGBW ||
    fixture === FixtureTypes.RGBWS ||
    fixture === FixtureTypes.RGBWMH
  ) {
    const rgbwChannels = channels as RgbwDmxChannels
    const red = dmxValues[rgbwChannels.red] || 0
    const green = dmxValues[rgbwChannels.green] || 0
    const blue = dmxValues[rgbwChannels.blue] || 0
    const white = dmxValues[rgbwChannels.white] || 0
    const dimmer = dmxValues[rgbwChannels.masterDimmer] ?? 0
    const scale = dimmer / 255
    return finalizePreviewRgb(
      {
        r: Math.round((red + white) * scale),
        g: Math.round((green + white) * scale),
        b: Math.round((blue + white) * scale),
      },
      dimmer === 0,
      use3dOffGrey,
    )
  }

  return finalizePreviewRgb({ r: 0, g: 0, b: 0 }, true, use3dOffGrey)
}

export function getDmxPreviewLightColorCss(
  light: DmxFixture,
  dmxValues: Record<number, number>,
): string {
  const { r, g, b } = getDmxPreviewLightColor(light, dmxValues)
  return `rgb(${r}, ${g}, ${b})`
}
