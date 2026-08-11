import {
  DmxFixture,
  FixtureTypes,
  MIXABLE_CHANNEL_TYPES,
  RgbDmxChannels,
  type MixableChannelType,
} from '../../../photonics-dmx/types'
import { EMITTER_PRIMARIES } from '../../../photonics-dmx/helpers/colorChannelMixer'

const MIXABLE_TYPE_SET = new Set<string>(MIXABLE_CHANNEL_TYPES)

/**
 * Combines a fixture's colour channels — base red/green/blue plus any user-added channels — into
 * preview RGB, using the same {@link EMITTER_PRIMARIES} the publisher mixes with, so preview and
 * wire agree by construction. A white emitter is an ordinary extra channel here, exactly as it is
 * for the publisher.
 *
 * Duplicate channels of one type model a single emitter bank (the publisher writes every channel of
 * a type the same value and subtracts that type's triple exactly once), so each type contributes at
 * most once — the brightest of its channels. Two amber channels at 255 therefore preview as amber,
 * not an over-saturated yellow. Warm and cool white are distinct types, so both still count (their
 * sum equals the publisher's joint warm+cool stage).
 *
 * Plain red/green/blue extras take the max against their base channel for the same reason. Under
 * publisher output that is a no-op (every bank of a primary carries the same value), but in DMX
 * Console manual mode each channel moves independently, so an added bank's slider must move the
 * swatch. `fixed` channels are utility/mode channels and never contribute colour.
 */
function mixPreviewRgb(
  light: DmxFixture,
  dmxValues: Record<number, number>,
  base: { red: number; green: number; blue: number },
): { r: number; g: number; b: number } {
  let red = base.red
  let green = base.green
  let blue = base.blue
  const valueByType = new Map<MixableChannelType, number>()

  for (const extra of light.extraChannels ?? []) {
    const value = dmxValues[extra.channel] || 0
    if (value === 0) continue
    if (extra.type === 'red') {
      red = Math.max(red, value)
    } else if (extra.type === 'green') {
      green = Math.max(green, value)
    } else if (extra.type === 'blue') {
      blue = Math.max(blue, value)
    } else if (MIXABLE_TYPE_SET.has(extra.type)) {
      const type = extra.type as MixableChannelType
      valueByType.set(type, Math.max(valueByType.get(type) ?? 0, value))
    }
  }

  const rgb = { r: red, g: green, b: blue }
  for (const [type, value] of valueByType) {
    const [er, eg, eb] = EMITTER_PRIMARIES[type]
    rgb.r += value * er
    rgb.g += value * eg
    rgb.b += value * eb
  }
  return rgb
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
    // 2D CSS preview clamps each channel to the 0–255 sRGB range. A fixture with colour extras
    // sums its emitters on top of the base primaries before scaling, which can exceed 255. The 3D
    // path keeps raw values so THREE bloom can drive HDR highlights.
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

  if (fixture === FixtureTypes.RGB || fixture === FixtureTypes.RGBMH) {
    const rgbChannels = channels as RgbDmxChannels
    const red = dmxValues[rgbChannels.red] || 0
    const green = dmxValues[rgbChannels.green] || 0
    const blue = dmxValues[rgbChannels.blue] || 0
    const dimmer = dmxValues[rgbChannels.masterDimmer] ?? 0
    const scale = dimmer / 255

    const mixed = mixPreviewRgb(light, dmxValues, { red, green, blue })

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
