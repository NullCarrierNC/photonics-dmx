import {
  DmxFixture,
  FixtureTypes,
  RgbDmxChannels,
  RgbwDmxChannels,
} from '../../../photonics-dmx/types'

/** RGB 0–255 from DMX for preview (matches 2D preview behaviour). */
export function getDmxPreviewLightColor(
  light: DmxFixture,
  dmxValues: Record<number, number>,
): { r: number; g: number; b: number } {
  const { channels, fixture } = light

  if (fixture === FixtureTypes.STROBE) {
    const dimmer = dmxValues[channels.masterDimmer] ?? 0
    const v = Math.round(255 * (dimmer / 255))
    return { r: v, g: v, b: v }
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
    return {
      r: Math.round(red * scale),
      g: Math.round(green * scale),
      b: Math.round(blue * scale),
    }
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
    return {
      r: Math.round((red + white) * scale),
      g: Math.round((green + white) * scale),
      b: Math.round((blue + white) * scale),
    }
  }

  return { r: 0, g: 0, b: 0 }
}

export function getDmxPreviewLightColorCss(
  light: DmxFixture,
  dmxValues: Record<number, number>,
): string {
  const { r, g, b } = getDmxPreviewLightColor(light, dmxValues)
  return `rgb(${r}, ${g}, ${b})`
}
