import {
  DmxFixture,
  FixtureTypes,
  MIXABLE_CHANNEL_TYPES,
  RgbDmxChannels,
  type MixableChannelType,
} from '../../../photonics-dmx/types'
import { EMITTER_PRIMARIES } from '../../../photonics-dmx/helpers/colorChannelMixer'
import { EXTRA_CHANNEL_TYPE_LABELS, extraChannelDisplayLabel } from './lightChannelDisplay'

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

/** One colour channel of a fixture, as its own swatch. */
export interface ChannelBreakdownEntry {
  /** Display label, numbered across base + extras ("Red", "Red 2", "Amber"). */
  label: string
  /** Raw DMX drive on that channel, 0–255. */
  value: number
  /** `rgb(...)` for the emitter at that drive. */
  css: string
}

/** Unit primaries for the base channels, so they mix into the swatch table like any emitter. */
const BASE_PRIMARIES: Readonly<
  Record<'red' | 'green' | 'blue', readonly [number, number, number]>
> = {
  red: [1, 0, 0],
  green: [0, 1, 0],
  blue: [0, 0, 1],
}

function swatchCss(value: number, [er, eg, eb]: readonly [number, number, number]): string {
  return `rgb(${Math.round(value * er)}, ${Math.round(value * eg)}, ${Math.round(value * eb)})`
}

/**
 * Drive on a channel, or 0 when the channel number is outside DMX 1–512. An unassigned channel is
 * stored as 0, which would otherwise index a `0` key rather than reading as dark.
 */
function channelValue(dmxValues: Record<number, number>, channel: number): number {
  if (!Number.isInteger(channel) || channel < 1 || channel > 512) return 0
  return dmxValues[channel] || 0
}

/**
 * Per-channel swatches for a fixture's colour channels — the components behind the single mixed
 * circle the 2D preview shows. Base red/green/blue come first, then each colour extra in array
 * order, so a duplicate bank sits beside the primary it doubles ("Red" next to "Red 2") instead of
 * being invisible in the blend. Plain RGB fixtures get the row too: reading the primaries out of a
 * blended circle by eye is guesswork whether or not extras are involved.
 *
 * Returns `null` only when a fixture has no colour channels at all (a dedicated strobe). `fixed`
 * extras are utility/mode channels and never appear.
 *
 * Swatch colours are the raw channel drive against the emitter primary, deliberately NOT scaled by
 * the master dimmer: these mirror the DMX numbers on the channel list and stay readable while the
 * dimmer rides, which is the diagnostic the mixed circle can't give.
 */
export function getLightColorChannelBreakdown(
  light: DmxFixture,
  dmxValues: Record<number, number>,
): ChannelBreakdownEntry[] | null {
  if (light.fixture === FixtureTypes.STROBE) return null

  const extras = light.extraChannels ?? []
  const channels = light.channels as RgbDmxChannels
  const entries: ChannelBreakdownEntry[] = []
  for (const base of ['red', 'green', 'blue'] as const) {
    const channel = channels[base]
    if (typeof channel !== 'number' || channel <= 0) continue
    const value = channelValue(dmxValues, channel)
    entries.push({
      label: EXTRA_CHANNEL_TYPE_LABELS[base],
      value,
      css: swatchCss(value, BASE_PRIMARIES[base]),
    })
  }

  extras.forEach((ec, i) => {
    if (ec.type === 'fixed') return
    const value = channelValue(dmxValues, ec.channel)
    const primary =
      ec.type === 'red' || ec.type === 'green' || ec.type === 'blue'
        ? BASE_PRIMARIES[ec.type]
        : EMITTER_PRIMARIES[ec.type as MixableChannelType]
    // Indexed against the full extras array so the numbering matches the channel list exactly.
    entries.push({
      label: extraChannelDisplayLabel(light, i),
      value,
      css: swatchCss(value, primary),
    })
  })

  // A fixture with every colour channel unassigned has nothing to show, so no empty row renders.
  return entries.length > 0 ? entries : null
}
