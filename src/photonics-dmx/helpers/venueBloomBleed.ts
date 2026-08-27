/**
 * Bloom bleed: the one venue effect that acts between fixtures rather than on each one alone.
 *
 * Kept apart from the per-light colour stages because it works over a whole run of neighbours at
 * once, on parallel arrays the caller owns, and shares nothing with the matrix and curve pipeline.
 */

function clampByte(value: number): number {
  if (value <= 0) return 0
  if (value >= 255) return 255
  return Math.round(value)
}

export interface VenueBloomSpec {
  /**
   * Fraction of full output a fixture must exceed before it blooms at all, with the spill ramping
   * up from nothing at the threshold to full at the top. Cues run part way up the dimmer, so this
   * sits well below the 0.6 the game uses against a rendered image.
   */
  threshold: number
  /** Extra output a fully bloomed fixture gives itself. */
  selfGain: number
  /** Fraction of its colour a fully bloomed fixture gives each neighbour. */
  spill: number
}

/**
 * One run of fixtures standing next to each other, as parallel arrays the caller owns and reuses.
 * `count` entries are live; the arrays may be longer.
 */
export interface VenueBleedChain {
  red: Float64Array
  green: Float64Array
  blue: Float64Array
  intensity: Float64Array
  /** Scratch for light actually emitted, cleared by {@link applyVenueBleed}. */
  emitRed: Float64Array
  emitGreen: Float64Array
  emitBlue: Float64Array
  /** Scratch for incoming spill, cleared by {@link applyVenueBleed}. */
  spillRed: Float64Array
  spillGreen: Float64Array
  spillBlue: Float64Array
  count: number
}

/**
 * Spreads colour between fixtures standing next to each other, in place.
 *
 * A fixture blooms in proportion to how far its output sits above the threshold, brightening itself
 * and giving each immediate neighbour a fraction of its colour. Every fixture receives spill,
 * whether or not it is already lit, so two lit neighbours tint each other while each keeps its own
 * colour dominant. Ends of the chain do not wrap.
 *
 * Sources are read before any result is written, so the exchange is symmetric and colour cannot
 * compound around the chain within a frame.
 */
export function applyVenueBleed(chain: VenueBleedChain, spec: VenueBloomSpec): void {
  const { red, green, blue, intensity, count } = chain
  const { emitRed, emitGreen, emitBlue, spillRed, spillGreen, spillBlue } = chain
  if (count === 0) return

  const thresholdByte = spec.threshold * 255
  const headroom = 255 - thresholdByte

  // A fixture emits its colour scaled by the master dimmer, so the arithmetic has to happen in
  // emitted light. Working on the colour channels alone would attenuate spill twice, once through
  // the colour it writes and again through the dimmer it opens, leaving a wash far too dark to see.
  for (let i = 0; i < count; i++) {
    const scale = intensity[i]! / 255
    emitRed[i] = red[i]! * scale
    emitGreen[i] = green[i]! * scale
    emitBlue[i] = blue[i]! * scale
    spillRed[i] = 0
    spillGreen[i] = 0
    spillBlue[i] = 0
  }

  let anyBloom = false
  for (let i = 0; i < count; i++) {
    // Brightness, not luma: a fixture at full red reads as bright to the eye even though its luma
    // is well under half scale.
    const level = Math.max(emitRed[i]!, emitGreen[i]!, emitBlue[i]!)
    if (level <= thresholdByte) continue
    anyBloom = true
    const excess = headroom <= 0 ? 1 : Math.min(1, (level - thresholdByte) / headroom)

    const give = spec.spill * excess
    const r = emitRed[i]! * give
    const g = emitGreen[i]! * give
    const b = emitBlue[i]! * give
    if (i > 0) {
      spillRed[i - 1]! += r
      spillGreen[i - 1]! += g
      spillBlue[i - 1]! += b
    }
    if (i < count - 1) {
      spillRed[i + 1]! += r
      spillGreen[i + 1]! += g
      spillBlue[i + 1]! += b
    }

    const self = 1 + spec.selfGain * excess
    spillRed[i]! += emitRed[i]! * (self - 1)
    spillGreen[i]! += emitGreen[i]! * (self - 1)
    spillBlue[i]! += emitBlue[i]! * (self - 1)
  }

  if (!anyBloom) return

  for (let i = 0; i < count; i++) {
    if (spillRed[i] === 0 && spillGreen[i] === 0 && spillBlue[i] === 0) continue

    const totalR = Math.min(255, emitRed[i]! + spillRed[i]!)
    const totalG = Math.min(255, emitGreen[i]! + spillGreen[i]!)
    const totalB = Math.min(255, emitBlue[i]! + spillBlue[i]!)
    const peak = Math.max(totalR, totalG, totalB)
    if (peak <= 0) continue

    // Split the wanted output back into a colour and a dimmer level whose product is what the
    // fixture should emit. Opening the dimmer no further than needed keeps the cue's own level.
    const dimmer = Math.max(intensity[i]!, peak)
    const toColor = 255 / dimmer
    red[i] = clampByte(totalR * toColor)
    green[i] = clampByte(totalG * toColor)
    blue[i] = clampByte(totalB * toColor)
    intensity[i] = clampByte(dimmer)
  }
}
