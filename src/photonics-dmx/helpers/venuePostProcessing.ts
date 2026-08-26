import { POST_PROCESSING_VALUES, type PostProcessing } from '../cues/types/cueTypes'

/**
 * Mirrors YARG's on-screen venue post-processing onto DMX colour output. Each state YARG reports
 * is a composition of greyscale / tint / contrast / posterize / invert / trail / grain primitives,
 * so the lighting rig shifts with the venue instead of staying at the cue's raw colour.
 *
 * Colour work compiles to one affine 3x4 matrix plus one 256-entry curve lookup, so composing the
 * primitives happens once per state rather than per light.
 */

/** Rec.601 luma weights, matching how the game's greyscale reads on screen. */
const LUMA_R = 0.299
const LUMA_G = 0.587
const LUMA_B = 0.114

/** Time quantum for grain flicker, chosen so grain re-rolls at roughly video rate. */
const GRAIN_PERIOD_MS = 33

/**
 * How faint an afterglow is once its {@link VenueEffectSpec.trailMs} has elapsed. Trails carry a
 * duration rather than the game's trail-length coefficient, which is a per-frame factor and maps to
 * wildly different durations across a narrow range of values.
 */
const TRAIL_FLOOR = 0.1

/**
 * Level a full white flash must still emit for a colour to reach a flashing light. The states that
 * invert leave nothing at all and the darkest state that merely dims leaves 91, so this sits clear
 * of both.
 */
const MIN_VISIBLE_FLASH = 32

export interface VenueColor {
  r: number
  g: number
  b: number
  /** Master dimmer. Effects reach it because that is where a rig's tonal range lives. */
  intensity: number
}

/**
 * Row-major affine 3x4: `out_row = m[row*4+0]*r + m[row*4+1]*g + m[row*4+2]*b + m[row*4+3]`.
 */
type AffineMatrix = Float64Array

export interface VenueEffectSpec {
  matrix?: AffineMatrix
  /** Gain applied before the contrast curve. */
  brightness?: number
  /** Exposure stops; the curve gain is `2 ** exposure`. */
  exposure?: number
  /** Contrast multiplier around mid-grey. 1 leaves the curve linear. */
  contrast?: number
  /** Quantisation step count. */
  posterize?: number
  /** How long an afterglow takes to fade to {@link TRAIL_FLOOR} of the colour that cast it. */
  trailMs?: number
  /** Rate at which a held colour is re-sampled. */
  choppyHz?: number
  /** Peak fraction a light's level swings by between grain samples. */
  grainAmount?: number
  /** Spreads colour from bright fixtures onto the fixtures either side of them. */
  bloom?: VenueBloomSpec
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

export interface CompiledColorTransform {
  /** `null` leaves the channels untouched. */
  matrix: AffineMatrix | null
  /** `null` leaves the curve linear. */
  lut: Uint8Array | null
  /** The colour stages leave a full white flash too dark to read as one. */
  extinguishesFlash: boolean
}

function affine(
  rr: number,
  rg: number,
  rb: number,
  ro: number,
  gr: number,
  gg: number,
  gb: number,
  go: number,
  br: number,
  bg: number,
  bb: number,
  bo: number,
): AffineMatrix {
  return Float64Array.from([rr, rg, rb, ro, gr, gg, gb, go, br, bg, bb, bo])
}

/** Every channel collapses to luma. */
function greyscale(): AffineMatrix {
  return affine(LUMA_R, LUMA_G, LUMA_B, 0, LUMA_R, LUMA_G, LUMA_B, 0, LUMA_R, LUMA_G, LUMA_B, 0)
}

/** Luma driving a coloured cast, as the game's tinted looks do. */
function lumaTint(tr: number, tg: number, tb: number): AffineMatrix {
  return affine(
    LUMA_R * tr,
    LUMA_G * tr,
    LUMA_B * tr,
    0,
    LUMA_R * tg,
    LUMA_G * tg,
    LUMA_B * tg,
    0,
    LUMA_R * tb,
    LUMA_G * tb,
    LUMA_B * tb,
    0,
  )
}

/** `amount` of 1 is fully grey, 0 leaves saturation alone. */
function desaturate(amount: number): AffineMatrix {
  const keep = 1 - amount
  return affine(
    keep + amount * LUMA_R,
    amount * LUMA_G,
    amount * LUMA_B,
    0,
    amount * LUMA_R,
    keep + amount * LUMA_G,
    amount * LUMA_B,
    0,
    amount * LUMA_R,
    amount * LUMA_G,
    keep + amount * LUMA_B,
    0,
  )
}

function invert(): AffineMatrix {
  return affine(-1, 0, 0, 255, 0, -1, 0, 255, 0, 0, -1, 255)
}

function sepia(): AffineMatrix {
  return affine(0.393, 0.769, 0.189, 0, 0.349, 0.686, 0.168, 0, 0.272, 0.534, 0.131, 0)
}

function channelGain(gr: number, gg: number, gb: number): AffineMatrix {
  return affine(gr, 0, 0, 0, 0, gg, 0, 0, 0, 0, gb, 0)
}

/** Luma ramps the output between two colours, giving the polarised and duotone looks. */
function duotone(
  low: readonly [number, number, number],
  high: readonly [number, number, number],
): AffineMatrix {
  const span = [high[0] - low[0], high[1] - low[1], high[2] - low[2]]
  return affine(
    (span[0] * LUMA_R) / 255,
    (span[0] * LUMA_G) / 255,
    (span[0] * LUMA_B) / 255,
    low[0],
    (span[1] * LUMA_R) / 255,
    (span[1] * LUMA_G) / 255,
    (span[1] * LUMA_B) / 255,
    low[1],
    (span[2] * LUMA_R) / 255,
    (span[2] * LUMA_G) / 255,
    (span[2] * LUMA_B) / 255,
    low[2],
  )
}

/** Applies `second` to the result of `first`. */
function compose(second: AffineMatrix, first: AffineMatrix): AffineMatrix {
  const out = new Float64Array(12)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      let sum = 0
      for (let k = 0; k < 3; k++) {
        sum += second[row * 4 + k] * first[k * 4 + col]
      }
      out[row * 4 + col] = sum
    }
    let offset = second[row * 4 + 3]
    for (let k = 0; k < 3; k++) {
      offset += second[row * 4 + k] * first[k * 4 + 3]
    }
    out[row * 4 + 3] = offset
  }
  return out
}

const BLACK: readonly [number, number, number] = [0, 0, 0]
const RED: readonly [number, number, number] = [255, 0, 0]
const BLUE: readonly [number, number, number] = [0, 0, 255]

/**
 * How each state YARG reports is rendered on the rig. Sourced from the game's own effect
 * composition, with the parts that have no lighting analogue (bloom, scanlines, mirror,
 * chromatic aberration) dropped.
 */
export const VENUE_EFFECT_SPECS: Readonly<Record<PostProcessing, VenueEffectSpec>> = {
  Default: {},
  Unknown: {},
  Mirror: {},
  Bloom: { bloom: { threshold: 0.25, selfGain: 0.5, spill: 0.35 } },
  Scanlines: {},
  Bright: { brightness: 1.15 },
  Contrast: { contrast: 1.35 },
  Posterize: { posterize: 4 },
  PhotoNegative: { matrix: invert() },
  BlackAndWhite: { matrix: greyscale() },
  SepiaTone: { matrix: sepia() },
  SilverTone: { matrix: lumaTint(0.98, 1.0, 1.08) },
  Choppy_BlackAndWhite: {
    matrix: greyscale(),
    contrast: 1.25,
    choppyHz: 8,
    grainAmount: 0.08,
  },
  Polarized_BlackAndWhite: { matrix: greyscale(), contrast: 1.5 },
  Polarized_RedAndBlue: { matrix: duotone(RED, BLUE) },
  PhotoNegative_RedAndBlack: { matrix: compose(duotone(BLACK, RED), invert()) },
  Desaturated_Red: { matrix: compose(channelGain(1.3, 0.7, 0.7), desaturate(0.6)) },
  Desaturated_Blue: { matrix: compose(channelGain(0.7, 0.8, 1.3), desaturate(0.6)) },
  Contrast_Red: { matrix: channelGain(1.25, 0.8, 0.8), contrast: 1.3 },
  Contrast_Green: { matrix: channelGain(0.8, 1.25, 0.8), contrast: 1.3 },
  Contrast_Blue: { matrix: channelGain(0.8, 0.8, 1.25), contrast: 1.3 },
  Scanlines_BlackAndWhite: { matrix: greyscale() },
  Scanlines_Blue: { matrix: lumaTint(0, 0.7, 2.0), contrast: 1.2 },
  Scanlines_Security: { matrix: lumaTint(0, 1.0, 0.65), contrast: 1.2, grainAmount: 0.06 },
  Grainy_Film: { exposure: -0.75, grainAmount: 0.05 },
  Grainy_ChromaticAbberation: { matrix: desaturate(0.35), grainAmount: 0.05 },
  Trails: { trailMs: 450 },
  Trails_Long: { trailMs: 650 },
  Trails_Desaturated: { matrix: desaturate(0.5), posterize: 10, trailMs: 650 },
  Trails_Flickery: {
    matrix: compose(channelGain(1.3, 0.7, 0.7), desaturate(0.6)),
    contrast: 1.2,
    trailMs: 450,
    grainAmount: 0.15,
  },
  Trails_Spacey: { brightness: 1.1, trailMs: 900 },
}

function clampByte(value: number): number {
  if (value <= 0) return 0
  if (value >= 255) return 255
  return Math.round(value)
}

/** Curve stages run gain, then contrast, then quantisation. */
function buildLut(spec: VenueEffectSpec): Uint8Array | null {
  const gain = (spec.brightness ?? 1) * (spec.exposure === undefined ? 1 : 2 ** spec.exposure)
  const contrast = spec.contrast ?? 1
  const posterize = spec.posterize
  if (gain === 1 && contrast === 1 && posterize === undefined) {
    return null
  }
  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    let value = i * gain
    if (contrast !== 1) {
      value = (value - 128) * contrast + 128
    }
    if (posterize !== undefined && posterize > 1) {
      const step = 255 / (posterize - 1)
      value = Math.round(clampByte(value) / step) * step
    }
    lut[i] = clampByte(value)
  }
  return lut
}

/**
 * What a full white flash still emits once the colour stages have run, as the preview reads it:
 * the brightest channel scaled by the master dimmer.
 */
function flashLevelThrough(matrix: AffineMatrix | null, lut: Uint8Array | null): number {
  let r = 255
  let g = 255
  let b = 255
  let intensity = 255
  if (matrix) {
    r = clampByte(matrix[0] * 255 + matrix[1] * 255 + matrix[2] * 255 + matrix[3])
    g = clampByte(matrix[4] * 255 + matrix[5] * 255 + matrix[6] * 255 + matrix[7])
    b = clampByte(matrix[8] * 255 + matrix[9] * 255 + matrix[10] * 255 + matrix[11])
  }
  if (lut) {
    r = lut[r]
    g = lut[g]
    b = lut[b]
    intensity = lut[intensity]
  }
  return (Math.max(r, g, b) * intensity) / 255
}

const compiledCache = new Map<PostProcessing, CompiledColorTransform>()

/** Compiles a state's colour stages once and reuses the result. */
export function compileVenueColorTransform(state: PostProcessing): CompiledColorTransform {
  const cached = compiledCache.get(state)
  if (cached) return cached
  const spec = VENUE_EFFECT_SPECS[state] ?? VENUE_EFFECT_SPECS.Default
  const matrix = spec.matrix ?? null
  const lut = buildLut(spec)
  const compiled: CompiledColorTransform = {
    matrix,
    lut,
    extinguishesFlash: flashLevelThrough(matrix, lut) < MIN_VISIBLE_FLASH,
  }
  compiledCache.set(state, compiled)
  return compiled
}

/** True when a state changes output at all, letting callers skip the whole stage. */
export function isVenueEffectActive(state: PostProcessing): boolean {
  const spec = VENUE_EFFECT_SPECS[state] ?? VENUE_EFFECT_SPECS.Default
  const compiled = compileVenueColorTransform(state)
  return (
    compiled.matrix !== null ||
    compiled.lut !== null ||
    spec.trailMs !== undefined ||
    spec.choppyHz !== undefined ||
    spec.grainAmount !== undefined ||
    spec.bloom !== undefined
  )
}

/**
 * The bloom settings for a state, or `null` when it does not spread light. Callers use the null
 * case to stay on the cheaper per-light path.
 */
export function venueBloomSpec(state: PostProcessing): VenueBloomSpec | null {
  return (VENUE_EFFECT_SPECS[state] ?? VENUE_EFFECT_SPECS.Default).bloom ?? null
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

/** True for a value the transform recognises. */
export function isPostProcessingState(value: unknown): value is PostProcessing {
  return typeof value === 'string' && (POST_PROCESSING_VALUES as readonly string[]).includes(value)
}

function hashLightId(lightId: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < lightId.length; i++) {
    hash ^= lightId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Stable pseudo-random in [0, 1) for a light at a point in time. */
function hash01(idHash: number, bucket: number): number {
  let h = (idHash ^ Math.imul(bucket, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

interface PerLightVenueState {
  idHash: number
  trailR: number
  trailG: number
  trailB: number
  trailI: number
  /** Negative until the first sample lands. */
  trailAtMs: number
  heldR: number
  heldG: number
  heldB: number
  heldI: number
  /** Negative until the first hold lands. */
  heldBucket: number
}

/**
 * Applies the active venue effect to per-light colour. Holds the temporal state the trail, choppy
 * and grain looks need.
 *
 * `transform` is idempotent for a repeated light id at the same timestamp, so a light reached more
 * than once in a frame does not advance its trail or re-roll its grain.
 */
export class VenuePostProcessor {
  private _state: PostProcessing = 'Default'
  private _spec: VenueEffectSpec = VENUE_EFFECT_SPECS.Default
  private _compiled: CompiledColorTransform = compileVenueColorTransform('Default')
  private _active = false
  private _lights = new Map<string, PerLightVenueState>()

  public getState(): PostProcessing {
    return this._state
  }

  public setState(state: PostProcessing): void {
    if (state === this._state) return
    this._state = state
    this._spec = VENUE_EFFECT_SPECS[state] ?? VENUE_EFFECT_SPECS.Default
    this._compiled = compileVenueColorTransform(state)
    this._active = isVenueEffectActive(state)
    this._lights.clear()
  }

  public isActive(): boolean {
    return this._active
  }

  /** Non-null only while a state that spreads light between fixtures is active. */
  public getBloomSpec(): VenueBloomSpec | null {
    return this._spec.bloom ?? null
  }

  /** Drops trail/latch history without changing the observed venue effect. */
  public clearTemporalState(): void {
    this._lights.clear()
  }

  private _stateFor(lightId: string): PerLightVenueState {
    let entry = this._lights.get(lightId)
    if (!entry) {
      entry = {
        idHash: hashLightId(lightId),
        trailR: 0,
        trailG: 0,
        trailB: 0,
        trailI: 0,
        trailAtMs: -1,
        heldR: 0,
        heldG: 0,
        heldB: 0,
        heldI: 0,
        heldBucket: -1,
      }
      this._lights.set(lightId, entry)
    }
    return entry
  }

  public transform(
    lightId: string,
    r: number,
    g: number,
    b: number,
    intensity: number,
    nowMs: number,
    out: VenueColor,
    strobeFlash = false,
  ): void {
    const { matrix, lut } = this._compiled

    // A light the strobe drives keeps its cue colour under a state that leaves a flash too dark to
    // read. Those states declare no curve and no time-based stage, so this one exit covers them.
    if (strobeFlash && this._compiled.extinguishesFlash) {
      out.r = clampByte(r)
      out.g = clampByte(g)
      out.b = clampByte(b)
      out.intensity = clampByte(intensity)
      return
    }

    let tr = r
    let tg = g
    let tb = b
    let ti = clampByte(intensity)

    if (matrix) {
      const mr = matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3]
      const mg = matrix[4] * r + matrix[5] * g + matrix[6] * b + matrix[7]
      const mb = matrix[8] * r + matrix[9] * g + matrix[10] * b + matrix[11]
      tr = clampByte(mr)
      tg = clampByte(mg)
      tb = clampByte(mb)
    } else {
      tr = clampByte(tr)
      tg = clampByte(tg)
      tb = clampByte(tb)
    }

    if (lut) {
      tr = lut[tr]
      tg = lut[tg]
      tb = lut[tb]
      // Cue colours are mostly saturated primaries, and 0 and 255 are fixed points of these
      // curves, so a curve applied to colour alone would leave a red wash untouched. The master
      // dimmer is where a rig's tonal range actually lives, so the curve has to reach it.
      ti = lut[ti]
    }

    const { trailMs, choppyHz, grainAmount } = this._spec
    const hasTemporalStage =
      trailMs !== undefined || choppyHz !== undefined || grainAmount !== undefined
    if (strobeFlash || !hasTemporalStage) {
      out.r = tr
      out.g = tg
      out.b = tb
      out.intensity = ti
      return
    }

    const light = this._stateFor(lightId)

    if (grainAmount !== undefined) {
      const bucket = Math.floor(nowMs / GRAIN_PERIOD_MS)
      const swing = 1 + grainAmount * (hash01(light.idHash, bucket) * 2 - 1)
      tr = clampByte(tr * swing)
      tg = clampByte(tg * swing)
      tb = clampByte(tb * swing)
    }

    if (trailMs !== undefined && trailMs > 0) {
      if (light.trailAtMs < 0) {
        light.trailR = tr
        light.trailG = tg
        light.trailB = tb
        light.trailI = ti
      } else {
        const decay = TRAIL_FLOOR ** ((nowMs - light.trailAtMs) / trailMs)
        light.trailR = Math.max(tr, light.trailR * decay)
        light.trailG = Math.max(tg, light.trailG * decay)
        light.trailB = Math.max(tb, light.trailB * decay)
        // A cue switches a fixture off through the master dimmer, so a trail that held colour
        // alone would decay behind a closed shutter and never be seen.
        light.trailI = Math.max(ti, light.trailI * decay)
      }
      light.trailAtMs = nowMs
      tr = clampByte(light.trailR)
      tg = clampByte(light.trailG)
      tb = clampByte(light.trailB)
      ti = clampByte(light.trailI)
    }

    if (choppyHz !== undefined && choppyHz > 0) {
      const bucket = Math.floor(nowMs / (1000 / choppyHz))
      if (bucket !== light.heldBucket) {
        light.heldBucket = bucket
        light.heldR = tr
        light.heldG = tg
        light.heldB = tb
        light.heldI = ti
      }
      tr = light.heldR
      tg = light.heldG
      tb = light.heldB
      ti = light.heldI
    }

    out.r = tr
    out.g = tg
    out.b = tb
    out.intensity = ti
  }
}
