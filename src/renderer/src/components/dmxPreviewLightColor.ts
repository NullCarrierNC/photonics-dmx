import {
  DmxFixture,
  FixtureTypes,
  MIXABLE_CHANNEL_TYPES,
  RgbwDmxChannels,
  type MixableChannelType,
} from '../../../photonics-dmx/types'
import { EMITTER_PRIMARIES } from '../../../photonics-dmx/helpers/colorChannelMixer'

const MIXABLE_TYPE_SET = new Set<string>(MIXABLE_CHANNEL_TYPES)

/**
 * Adds each mixable extra channel's contribution (`value × emitter primary`) into the preview RGB,
 * using the same primaries the publisher mixes with — so the preview matches the wire. `fixed` and
 * plain red/green/blue extras are skipped (the latter are duplicate banks of a primary the base
 * channels already represent; adding them would double-count the hue).
 *
 * Duplicate channels of one type model a single emitter bank (the publisher subtracts that type's
 * emitter triple exactly once), so each mixable *type* contributes at most once here — using the
 * brightest of its channels (duplicates are equal by the mixer's construction). Two amber channels
 * at 255 therefore preview as amber, not an over-saturated yellow. Warm and cool white are distinct
 * types, so both still count (their sum equals the publisher's joint warm+cool stage).
 */
function addExtraChannelContributions(
  light: DmxFixture,
  dmxValues: Record<number, number>,
  rgb: { r: number; g: number; b: number },
): void {
  const valueByType = new Map<MixableChannelType, number>()
  for (const extra of light.extraChannels ?? []) {
    if (!MIXABLE_TYPE_SET.has(extra.type)) continue
    const value = dmxValues[extra.channel] || 0
    if (value === 0) continue
    const type = extra.type as MixableChannelType
    valueByType.set(type, Math.max(valueByType.get(type) ?? 0, value))
  }
  for (const [type, value] of valueByType) {
    const [er, eg, eb] = EMITTER_PRIMARIES[type]
    rgb.r += value * er
    rgb.g += value * eg
    rgb.b += value * eb
  }
}

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
    // 2D CSS preview clamps each channel to the 0–255 sRGB range. RGBW fixtures sum red+white
    // (up to 510) before scaling, which can exceed 255. The 3D path keeps raw values so THREE
    // bloom can drive HDR highlights.
    return {
      r: Math.min(255, rgb.r),
      g: Math.min(255, rgb.g),
      b: Math.min(255, rgb.b),
    }
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
    fixture === FixtureTypes.RGBMH ||
    fixture === FixtureTypes.RGBW ||
    fixture === FixtureTypes.RGBWMH
  ) {
    const rgbwChannels = channels as RgbwDmxChannels
    const red = dmxValues[rgbwChannels.red] || 0
    const green = dmxValues[rgbwChannels.green] || 0
    const blue = dmxValues[rgbwChannels.blue] || 0
    // Named white (RGBW/RGBWMH) contributes as a white emitter; absent on RGB (undefined → 0).
    const white = dmxValues[rgbwChannels.white] || 0
    const dimmer = dmxValues[rgbwChannels.masterDimmer] ?? 0
    const scale = dimmer / 255

    const mixed = { r: red + white, g: green + white, b: blue + white }
    addExtraChannelContributions(light, dmxValues, mixed)

    return finalizePreviewRgb(
      {
        r: Math.round(mixed.r * scale),
        g: Math.round(mixed.g * scale),
        b: Math.round(mixed.b * scale),
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
