import { DEFAULT_STROBE_CHANNEL_VALUES, isFixtureType, type DmxFixture } from '../types'
import type { StrobeSpeedSlot } from '../cues/types/cueTypes'
import {
  applyChannelMixPlan,
  buildChannelMixPlan,
  type ChannelMixPlan,
} from '../helpers/colorChannelMixer'
import { buildBrightnessScaleMap, scaleDmxValueByPercent } from '../helpers/brightnessScaling'
import { isRgbFamilyWithStrobeChannel } from '../helpers/strobeChannelRigInspection'
import { createLogger } from '../../shared/logger'
const log = createLogger('FixtureChannelWriter')

/**
 * Whether a fixture's own strobe-speed channel chops while `slot` is active: a strobe-enabled
 * RGB-family fixture whose template declares one. Dedicated STROBE fixtures are a separate device
 * class (no RGB to latch, no per-cue `strobeValues` model) and never do.
 */
export function strobeChannelChops(fixture: DmxFixture, slot: StrobeSpeedSlot | null): boolean {
  return slot != null && fixture.isStrobeEnabled && isRgbFamilyWithStrobeChannel(fixture)
}

function strobeChannelValue(fixture: DmxFixture, slot: StrobeSpeedSlot): number {
  return (fixture.strobeValues ?? DEFAULT_STROBE_CHANNEL_VALUES)[slot]
}

/** A light's values once the colour stages have run, ready to address. */
export interface LightOutput {
  red: number
  green: number
  blue: number
  intensity: number
  pan: number
  tilt: number
}

/**
 * Turns a light's resolved colour into bytes at its fixture's DMX addresses, one rig at a time.
 * Every write is range-checked, clamped and copied to each wire buffer the rig targets, with the
 * fixture's brightness scaling on the wire copy only. Faults report once per light until the rigs
 * change.
 */
export class FixtureChannelWriter {
  /** Light ids already reported for out-of-range channel numbers. */
  private _reportedBadChannelLights = new Set<string>()
  /** Light ids already reported for excluded extra channels. Separate from the range set, so a
   *  fixture with both faults reports both. */
  private _reportedInvalidExtraLights = new Set<string>()
  /** Light ids already reported for a fixture type this build does not know. */
  private _reportedUnknownTypeLights = new Set<string>()
  /**
   * Colour-mixing plans keyed by fixture object identity. `syncDmxLightWithTemplate` replaces a
   * fixture object whenever its channels or extras change and returns the same reference
   * otherwise, so identity is the dirty signal and the WeakMap lets go of dropped rigs' fixtures.
   * `null` means no mixing is needed, and is cached too.
   */
  private _mixPlans = new WeakMap<DmxFixture, ChannelMixPlan | null>()
  /** Brightness scale maps, keyed on identity like {@link _mixPlans}. */
  private _scaleMaps = new WeakMap<DmxFixture, Map<number, number> | null>()

  // Where writes land, re-pointed per rig and per light.
  private _wireBuffers: ReadonlyArray<Record<number, number>> = []
  private _ipcBuffer: Record<number, number> | null = null
  private _lightId = ''
  /** Brightness trim for the light being written. Cleared before fixed writes, since a pinned
   *  constant reaches the wire verbatim even on a scaled address. */
  private _scaleMap: Map<number, number> | null = null
  /** The mixer's writer, bound once. */
  private readonly _mixWrite = (channel: number, value: number): void =>
    this._write(channel, value, 'mixed channel')

  /** Points writes at a rig's wire buffers and its IPC buffer, when IPC is on. */
  public beginRig(
    wireBuffers: ReadonlyArray<Record<number, number>>,
    ipcBuffer: Record<number, number> | null,
  ): void {
    this._wireBuffers = wireBuffers
    this._ipcBuffer = ipcBuffer
  }

  /** Lets a fault reported under an earlier rig configuration report again. */
  public resetFaultReports(): void {
    this._reportedBadChannelLights.clear()
    this._reportedInvalidExtraLights.clear()
    this._reportedUnknownTypeLights.clear()
  }

  /**
   * Writes one light. `strobeSlot` is the active speed while the light's own strobe channel is
   * chopping, and null otherwise.
   */
  public writeLight(
    lightId: string,
    fixture: DmxFixture,
    output: Readonly<LightOutput>,
    strobeSlot: StrobeSpeedSlot | null,
    additiveWhite: boolean,
  ): void {
    if (!this._isKnownType(lightId, fixture)) return
    this._lightId = lightId
    this._scaleMap = this._scaleMapFor(fixture)

    // With a plan, the mixer owns the colour channels (named red, green, blue and white, plus any
    // extras). It splits the rgb into the fixture's declared emitters and writes what is left back
    // to the rgb channels. Without one, the switch below writes them.
    const mixPlan = this._mixPlanFor(fixture)
    if (mixPlan) {
      this._warnInvalidExtras(lightId, mixPlan)
      applyChannelMixPlan(
        mixPlan,
        output.red,
        output.green,
        output.blue,
        this._mixWrite,
        additiveWhite,
      )
    }

    for (const [channelName, channelNumber] of Object.entries(fixture.channels)) {
      let value: number = 0

      switch (channelName) {
        case 'red':
        case 'green':
        case 'blue':
          // The mixer owns these when there is a plan.
          if (mixPlan) continue
          value = output[channelName]
          break
        case 'masterDimmer':
          value = output.intensity
          break
        case 'pan':
          value = output.pan
          break
        case 'tilt':
          value = output.tilt
          break
        case 'strobeChannel':
          value = strobeSlot ? strobeChannelValue(fixture, strobeSlot) : 0
          break
        default:
          continue
      }

      this._write(channelNumber, value, channelName)
    }

    // Fixed channels go last on every frame, so one that collides with a base channel of the same
    // fixture wins, matching the unvisited pass and the console and calibration seeds. The editor
    // warns about duplicate numbers without blocking them, so this state reaches the wire.
    if (mixPlan) {
      this._scaleMap = null
      for (const fw of mixPlan.fixedWrites) this._write(fw.channel, fw.value, 'fixed channel')
    }
  }

  /**
   * Writes what fixtures no light state reached this frame still put on the wire: the pinned fixed
   * channels of planned fixtures, and the strobe channel of each whose hardware strobe is chopping
   * for `strobeSlot`. Colour channels need a state, so nothing else goes out.
   */
  public writeUnvisited(
    fixtures: ReadonlyMap<string, DmxFixture>,
    visited: ReadonlySet<string>,
    strobeSlot: StrobeSpeedSlot | null,
  ): void {
    this._scaleMap = null
    for (const [lightId, fixture] of fixtures) {
      if (visited.has(lightId) || !this._isKnownType(lightId, fixture)) continue
      this._lightId = lightId
      const strobeChannel = fixture.channels.strobeChannel
      if (
        strobeSlot &&
        typeof strobeChannel === 'number' &&
        strobeChannelChops(fixture, strobeSlot)
      ) {
        this._write(strobeChannel, strobeChannelValue(fixture, strobeSlot), 'strobeChannel')
      }
      const plan = this._mixPlanFor(fixture)
      if (!plan) continue
      this._warnInvalidExtras(lightId, plan)
      for (const fw of plan.fixedWrites) this._write(fw.channel, fw.value, 'fixed channel')
    }
  }

  private _write(channelNumber: number, value: number, channelLabel: string): void {
    // DMX addresses run 1 to 512. Anything else (0 for an unassigned template slot, or NaN,
    // negative or huge from a bad config already on disk) must not become a buffer key the wire
    // senders index with, so it is skipped and reported once per light. Mixer channels are
    // validated when the plan is built, so only the switch reaches this branch.
    if (!Number.isInteger(channelNumber) || channelNumber < 1 || channelNumber > 512) {
      if (!this._reportedBadChannelLights.has(this._lightId)) {
        this._reportedBadChannelLights.add(this._lightId)
        log.warn(
          `Light ${this._lightId}: channel "${channelLabel}" = ${channelNumber} is outside DMX 1-512; skipping`,
        )
      }
      return
    }
    const clamped = Number.isFinite(value) ? Math.max(0, Math.min(255, value)) : 0
    // Scaling is a property of the fixture, so the wire gets it and the IPC buffer keeps cue
    // intent. The preview re-applies it on request, rounding through the same helper.
    const scalePercent = this._scaleMap?.get(channelNumber)
    const wireValue =
      scalePercent === undefined ? clamped : scaleDmxValueByPercent(clamped, scalePercent)
    for (const buffer of this._wireBuffers) {
      buffer[channelNumber] = wireValue
    }
    if (this._ipcBuffer !== null) {
      this._ipcBuffer[channelNumber] = clamped
    }
  }

  /**
   * Whether this build knows the fixture's type, reporting one it does not once per light. Every
   * load and save boundary parses fixtures, which refuses an unknown type, and this check keeps
   * one that reaches the writer another way off the wire.
   */
  private _isKnownType(lightId: string, fixture: DmxFixture): boolean {
    if (isFixtureType(fixture.fixture)) return true
    if (!this._reportedUnknownTypeLights.has(lightId)) {
      this._reportedUnknownTypeLights.add(lightId)
      log.error(`Light ${lightId}: fixture type "${String(fixture.fixture)}" is unknown; skipping`)
    }
    return false
  }

  private _mixPlanFor(fixture: DmxFixture): ChannelMixPlan | null {
    if (this._mixPlans.has(fixture)) return this._mixPlans.get(fixture)!
    const plan = buildChannelMixPlan(fixture)
    this._mixPlans.set(fixture, plan)
    return plan
  }

  private _scaleMapFor(fixture: DmxFixture): Map<number, number> | null {
    if (this._scaleMaps.has(fixture)) return this._scaleMaps.get(fixture)!
    const scaleMap = buildBrightnessScaleMap(fixture)
    this._scaleMaps.set(fixture, scaleMap)
    return scaleMap
  }

  /**
   * Reports a plan's excluded extra channels once per light. Both passes call it, so a fixture no
   * cue addresses still explains its dead mode channel.
   */
  private _warnInvalidExtras(lightId: string, plan: ChannelMixPlan): void {
    if (plan.invalidChannels.length === 0) return
    if (this._reportedInvalidExtraLights.has(lightId)) return
    this._reportedInvalidExtraLights.add(lightId)
    log.warn(
      `Light ${lightId}: skipping invalid extra channels: ${plan.invalidChannels.join(', ')}`,
    )
  }
}
