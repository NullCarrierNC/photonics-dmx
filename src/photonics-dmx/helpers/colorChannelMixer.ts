import {
  EXTRA_CHANNEL_TYPES,
  FixtureTypes,
  MIXABLE_CHANNEL_TYPES,
  isValidDmxChannel,
  type DmxFixture,
  type MixableChannelType,
} from '../types'

/**
 * Substitution colour mixer for fixtures with extra colour channels (white / warm+cool white /
 * amber / orange / lime / uv), plus duplicate red/green/blue banks and pinned "fixed" channels.
 *
 * The engine's internal colour is RGB + intensity only. When a fixture declares extra colour
 * emitters, this module decomposes that RGB into the extra channels the same way a real RGBW/RGBWA
 * fixture would: it moves energy OUT of the RGB channels into the emitter channels (substitution),
 * so total output stays colour-accurate and never exceeds the original per-primary energy. A
 * fixture with no extra emitters produces no plan at all — the publisher then writes its channels
 * one by one, so a plain fixture pays nothing for this module existing.
 *
 * White is not special here: an RGBW fixture is modelled as an RGB fixture carrying a `white` extra
 * channel, so it flows through the same stage as any other emitter.
 *
 * See {@link EMITTER_PRIMARIES} for the RGB approximation of each emitter; the ordering of the
 * extraction stages is fixed (see {@link buildChannelMixPlan}) and never affects chromaticity — it
 * only decides which emitter carries a given part of the load.
 */

/**
 * The RGB an emitter contributes at full drive (DMX 255), normalised so the largest component is
 * 1.0 (guarantees every derived drive value is ≤ 255). Amber/orange/lime deliberately match the
 * named-colour palette (`colorMap` in dmxHelpers) so a cue colour of "amber" maps ~1:1 onto an
 * amber emitter. Shared with the renderer preview so preview and wire agree by construction.
 */
export const EMITTER_PRIMARIES: Readonly<
  Record<MixableChannelType, readonly [number, number, number]>
> = {
  white: [1.0, 1.0, 1.0],
  warmWhite: [1.0, 0.75, 0.5],
  coolWhite: [0.8, 0.9, 1.0],
  amber: [1.0, 0.75, 0.0],
  orange: [1.0, 0.5, 0.0],
  lime: [0.5, 1.0, 0.0],
  uv: [0.5, 0.0, 1.0],
}

export interface MixStage {
  /** Emitter triple for this stage (summed when warm + cool white share a stage). */
  er: number
  eg: number
  eb: number
  /** Valid (1–512) DMX channel numbers that all receive this stage's rounded drive value. */
  channels: number[]
}

export interface ChannelMixPlan {
  /** Populated stages in canonical extraction order. */
  stages: MixStage[]
  /** Named red channel + every `red`-typed extra (all receive the residual red). */
  redChannels: number[]
  greenChannels: number[]
  blueChannels: number[]
  /** `fixed` channels + their clamped constant value; written every published frame, never mixed. */
  fixedWrites: Array<{ channel: number; value: number }>
  /** Human labels of extra channels excluded for invalid numbers, for once-per-light logging. */
  invalidChannels: string[]
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(255, Math.round(value)))
}

/**
 * Precomputes a fixture's mixing plan from its named channels + `extraChannels`. Returns `null` when
 * no mixing is needed (no mixable emitters, no red/green/blue extras, no fixed channels) and nothing
 * needs reporting — the caller then takes the per-channel path. A fixture whose extras are *all*
 * excluded for a real misconfiguration still gets a plan, which is how
 * {@link ChannelMixPlan.invalidChannels} reaches the caller's log; that plan has no stages, so it
 * mixes to the same values the per-channel path writes. Called once per fixture object (memoised by
 * the publisher on identity).
 */
export function buildChannelMixPlan(fixture: DmxFixture): ChannelMixPlan | null {
  const named = fixture.channels as unknown as Record<string, number>
  const extras = fixture.extraChannels ?? []
  const isStrobe = fixture.fixture === FixtureTypes.STROBE

  const invalidChannels: string[] = []
  const fixedWrites: Array<{ channel: number; value: number }> = []

  // Excluded extras. An unassigned channel (0) is an ordinary in-progress template state — the
  // fixture can't be placed in a rig at all until it's assigned (see `myValidDmxLightsAtom`) — so it
  // is reported but never forces a plan into existence on its own. Anything else is a real
  // misconfiguration the caller must be able to log.
  let reportableProblems = 0
  const exclude = (label: string, reportable: boolean): void => {
    invalidChannels.push(label)
    if (reportable) reportableProblems += 1
  }

  // Named red/green/blue are owned by the mixer when a plan exists (the publisher skips its own
  // red/green/blue cases), so they must receive the residual too.
  const redChannels: number[] = []
  const greenChannels: number[] = []
  const blueChannels: number[] = []
  if (isValidDmxChannel(named.red)) redChannels.push(named.red)
  if (isValidDmxChannel(named.green)) greenChannels.push(named.green)
  if (isValidDmxChannel(named.blue)) blueChannels.push(named.blue)

  // Valid channel numbers per mixable type. A white emitter is an ordinary extra channel: an RGBW
  // fixture is RGB plus a `white` extra, so its white lands here like any other emitter.
  const mixableChannels: Record<MixableChannelType, number[]> = {
    white: [],
    warmWhite: [],
    coolWhite: [],
    amber: [],
    orange: [],
    lime: [],
    uv: [],
  }

  let hasRgbExtra = false
  extras.forEach((ec, i) => {
    const label = `extra channel ${i + 1} (${ec.type})`

    if (ec.type === 'fixed') {
      if (isValidDmxChannel(ec.channel)) {
        fixedWrites.push({ channel: ec.channel, value: clampByte(ec.value ?? 0) })
      } else {
        exclude(label, ec.channel !== 0)
      }
      return
    }

    // A colour-less strobe has no residual home for a colour channel.
    if (isStrobe) {
      exclude(label, true)
      return
    }

    if (!isValidDmxChannel(ec.channel)) {
      exclude(label, ec.channel !== 0)
      return
    }

    if (ec.type === 'red') {
      redChannels.push(ec.channel)
      hasRgbExtra = true
    } else if (ec.type === 'green') {
      greenChannels.push(ec.channel)
      hasRgbExtra = true
    } else if (ec.type === 'blue') {
      blueChannels.push(ec.channel)
      hasRgbExtra = true
    } else {
      mixableChannels[ec.type as MixableChannelType].push(ec.channel)
    }
  })

  const stages: MixStage[] = []

  // Stage order: broadest-spectrum emitters first. white → warm+cool white → amber → orange → lime
  // → uv. Order never changes chromaticity (reconstruction is exact) — only which emitter carries
  // the load. Warm and cool white share one stage against their summed triple when both exist, so a
  // neutral-white cue drives them equally instead of pinning one at full and leaving the other dark.
  if (mixableChannels.white.length) {
    const [er, eg, eb] = EMITTER_PRIMARIES.white
    stages.push({ er, eg, eb, channels: mixableChannels.white })
  }

  const ww = mixableChannels.warmWhite
  const cw = mixableChannels.coolWhite
  if (ww.length && cw.length) {
    const w = EMITTER_PRIMARIES.warmWhite
    const c = EMITTER_PRIMARIES.coolWhite
    stages.push({ er: w[0] + c[0], eg: w[1] + c[1], eb: w[2] + c[2], channels: [...ww, ...cw] })
  } else if (ww.length) {
    const [er, eg, eb] = EMITTER_PRIMARIES.warmWhite
    stages.push({ er, eg, eb, channels: ww })
  } else if (cw.length) {
    const [er, eg, eb] = EMITTER_PRIMARIES.coolWhite
    stages.push({ er, eg, eb, channels: cw })
  }

  for (const type of ['amber', 'orange', 'lime', 'uv'] as const) {
    if (mixableChannels[type].length) {
      const [er, eg, eb] = EMITTER_PRIMARIES[type]
      stages.push({ er, eg, eb, channels: mixableChannels[type] })
    }
  }

  if (stages.length === 0 && !hasRgbExtra && fixedWrites.length === 0 && reportableProblems === 0) {
    return null
  }

  return { stages, redChannels, greenChannels, blueChannels, fixedWrites, invalidChannels }
}

/**
 * Per-frame hot path: decomposes `(red, green, blue)` into the plan's emitter stages and residual
 * RGB, emitting each channel write through `write`. `fixed` channels are NOT written here (they are
 * emitted directly by the publisher, so they still fire for fixtures no cue has addressed). Inputs
 * are sanitised to the legacy `clamp(value, 0, 255)` domain so NaN/negative colour can't poison
 * sender buffers or inflate sibling channels. Zero allocation.
 */
export function applyChannelMixPlan(
  plan: ChannelMixPlan,
  red: number,
  green: number,
  blue: number,
  write: (channel: number, value: number) => void,
): void {
  let r = Number.isFinite(red) ? Math.max(0, Math.min(255, red)) : 0
  let g = Number.isFinite(green) ? Math.max(0, Math.min(255, green)) : 0
  let b = Number.isFinite(blue) ? Math.max(0, Math.min(255, blue)) : 0

  for (const stage of plan.stages) {
    // Drive is limited by the tightest residual/emitter ratio across the components this emitter
    // actually lights. A zero emitter component doesn't constrain the drive, but a zero residual in
    // a lit component forces v = 0 (this is what keeps UV dark on pure red or pure blue).
    let v = Infinity
    if (stage.er > 0) v = Math.min(v, r / stage.er)
    if (stage.eg > 0) v = Math.min(v, g / stage.eg)
    if (stage.eb > 0) v = Math.min(v, b / stage.eb)
    if (!Number.isFinite(v)) v = 0
    if (v < 0) v = 0

    const driveValue = Math.max(0, Math.min(255, Math.round(v)))
    for (const channel of stage.channels) write(channel, driveValue)

    // Subtract the (float) drive so the residual stays colour-accurate for later stages + the RGB
    // remainder. The emitter triple is subtracted once regardless of how many channels share it.
    r -= v * stage.er
    g -= v * stage.eg
    b -= v * stage.eb
  }

  const redOut = Math.max(0, Math.round(r))
  const greenOut = Math.max(0, Math.round(g))
  const blueOut = Math.max(0, Math.round(b))
  for (const channel of plan.redChannels) write(channel, redOut)
  for (const channel of plan.greenChannels) write(channel, greenOut)
  for (const channel of plan.blueChannels) write(channel, blueOut)
}

// Re-exported so callers importing the mixer get the vocabulary from one place.
export { EXTRA_CHANNEL_TYPES, MIXABLE_CHANNEL_TYPES }
