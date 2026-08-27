import type { PostProcessing } from '../cues/types/cueTypes'
import type { RGBIO, LightingConfiguration } from '../types'
import { DmxLightManager } from './DmxLightManager'
import { VenuePostProcessor, type VenueColor } from '../helpers/venuePostProcessing'
import {
  applyVenueBleed,
  type VenueBleedChain,
  type VenueBloomSpec,
} from '../helpers/venueBloomBleed'
import {
  PASSTHROUGH_FRAME_RIG_VIEW,
  type ProcessedLightColor,
  type PublisherFrameContext,
  type PublisherFrameProcessor,
  type PublisherFrameRigView,
} from './PublisherFrameProcessor'

export interface VenueFrameProcessorOptions {
  /** Omitted means enabled. */
  enabled?: boolean
}

/**
 * A rig's fixtures grouped into runs of physical neighbours, with the scratch the bleed works over.
 *
 * One run per row. Rows stay separate so colour never jumps between the front and back of the
 * stage, and a run does not wrap, so the fixtures at each end of a row have one neighbour.
 */
interface VenueBleedRig {
  lightIds: string[]
  indexById: Map<string, number>
  runs: VenueBleedChain[]
  red: Float64Array
  green: Float64Array
  blue: Float64Array
  intensity: Float64Array
}

/**
 * Groups a rig's rows into neighbour runs. The front and back lists are already ordered by
 * `position`, which is what puts fixtures next to the ones they physically sit beside.
 *
 * The strobe group is left out. Its published colour is a peak held by the strobe latch, so
 * bleeding it would wash the rig with a steady colour rather than a flash.
 */
function buildVenueBleedRig(manager: DmxLightManager): VenueBleedRig {
  const lightIds: string[] = []
  const indexById = new Map<string, number>()
  const bounds: Array<{ start: number; length: number }> = []

  for (const group of ['front', 'back'] as const) {
    const lights = manager.getLightsInGroup(group)
    if (lights.length === 0) continue
    bounds.push({ start: lightIds.length, length: lights.length })
    for (const light of lights) {
      indexById.set(light.id, lightIds.length)
      lightIds.push(light.id)
    }
  }

  const size = lightIds.length
  const red = new Float64Array(size)
  const green = new Float64Array(size)
  const blue = new Float64Array(size)
  const intensity = new Float64Array(size)
  const emitRed = new Float64Array(size)
  const emitGreen = new Float64Array(size)
  const emitBlue = new Float64Array(size)
  const spillRed = new Float64Array(size)
  const spillGreen = new Float64Array(size)
  const spillBlue = new Float64Array(size)

  const runs = bounds.map(({ start, length }) => ({
    red: red.subarray(start, start + length),
    green: green.subarray(start, start + length),
    blue: blue.subarray(start, start + length),
    intensity: intensity.subarray(start, start + length),
    emitRed: emitRed.subarray(start, start + length),
    emitGreen: emitGreen.subarray(start, start + length),
    emitBlue: emitBlue.subarray(start, start + length),
    spillRed: spillRed.subarray(start, start + length),
    spillGreen: spillGreen.subarray(start, start + length),
    spillBlue: spillBlue.subarray(start, start + length),
    count: length,
  }))

  return { lightIds, indexById, runs, red, green, blue, intensity }
}

/**
 * Venue post-processing frame stage: per-light YARG transforms plus optional rig-wide bloom bleed.
 */
export class VenueFrameProcessor implements PublisherFrameProcessor {
  private _proc = new VenuePostProcessor()
  private _enabled: boolean
  private _scratch: VenueColor = { r: 0, g: 0, b: 0, intensity: 0 }
  /** Per-rig neighbour runs, keyed on config object identity like mix plans in DmxPublisher. */
  private _bleedRigs = new WeakMap<LightingConfiguration, VenueBleedRig>()

  constructor(options: VenueFrameProcessorOptions = {}) {
    this._enabled = options.enabled ?? true
  }

  public isFrameProcessingActive(): boolean {
    return this._enabled && this._proc.isActive()
  }

  public setVenuePostProcessing(state: PostProcessing): void {
    this._proc.setState(state)
  }

  public getVenuePostProcessing(): PostProcessing {
    return this._proc.getState()
  }

  /**
   * Hot-swap the venue post-processing preference. Disabling bypasses output and clears temporal
   * history without replacing the observed YARG effect.
   */
  public setVenuePostProcessingEnabled(enabled: boolean): void {
    this._enabled = enabled
    if (!enabled) {
      this._proc.clearTemporalState()
    }
  }

  public prepareRigFrame(
    config: LightingConfiguration,
    manager: DmxLightManager,
    lights: ReadonlyMap<string, Readonly<RGBIO>>,
    ctx: PublisherFrameContext,
  ): PublisherFrameRigView {
    if (!this.isFrameProcessingActive()) {
      return PASSTHROUGH_FRAME_RIG_VIEW
    }

    const bloom = this._proc.getBloomSpec()
    const bleedRig = bloom ? this._getBleedRig(config, manager) : null
    if (bleedRig && bloom) {
      this._runBleedPass(bleedRig, lights, bloom, ctx.nowMs)
    }

    // One view per rig, so two rigs prepared in the same frame stay independent. The per-light
    // stage inside it allocates nothing.
    return {
      isActive: () => true,
      colorFor: (lightId, input, out, strobeFlash) =>
        this._colorFor(lightId, input, bleedRig, ctx.nowMs, out, strobeFlash),
    }
  }

  private _colorFor(
    lightId: string,
    input: Readonly<RGBIO>,
    bleedRig: VenueBleedRig | null,
    nowMs: number,
    out: ProcessedLightColor,
    strobeFlash = false,
  ): void {
    // Bloom is the one spec carrying a bleed. It declares no trail, choppy or grain and it leaves a
    // flash at full, so the bled colour needs neither exemption.
    if (bleedRig) {
      const bleedIndex = bleedRig.indexById.get(lightId)
      if (bleedIndex !== undefined) {
        out.r = bleedRig.red[bleedIndex]!
        out.g = bleedRig.green[bleedIndex]!
        out.b = bleedRig.blue[bleedIndex]!
        out.intensity = bleedRig.intensity[bleedIndex]!
        return
      }
    }

    this._proc.transform(
      lightId,
      input.red,
      input.green,
      input.blue,
      input.intensity,
      nowMs,
      this._scratch,
      strobeFlash,
    )
    out.r = this._scratch.r
    out.g = this._scratch.g
    out.b = this._scratch.b
    out.intensity = this._scratch.intensity
  }

  private _getBleedRig(config: LightingConfiguration, manager: DmxLightManager): VenueBleedRig {
    const cached = this._bleedRigs.get(config)
    if (cached) return cached
    const built = buildVenueBleedRig(manager)
    this._bleedRigs.set(config, built)
    return built
  }

  private _runBleedPass(
    bleedRig: VenueBleedRig,
    lights: ReadonlyMap<string, Readonly<RGBIO>>,
    bloom: VenueBloomSpec,
    nowMs: number,
  ): void {
    const { lightIds, red, green, blue, intensity } = bleedRig

    for (let i = 0; i < lightIds.length; i++) {
      const lightValue = lights.get(lightIds[i]!)
      if (!lightValue) {
        red[i] = 0
        green[i] = 0
        blue[i] = 0
        intensity[i] = 0
        continue
      }
      this._proc.transform(
        lightIds[i]!,
        lightValue.red,
        lightValue.green,
        lightValue.blue,
        lightValue.intensity,
        nowMs,
        this._scratch,
      )
      red[i] = this._scratch.r
      green[i] = this._scratch.g
      blue[i] = this._scratch.b
      intensity[i] = this._scratch.intensity
    }

    for (const run of bleedRig.runs) {
      applyVenueBleed(run, bloom)
    }
  }
}
