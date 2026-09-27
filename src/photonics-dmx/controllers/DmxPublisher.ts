import {
  RGBIO,
  DmxRig,
  isMovingHead,
  DEFAULT_WHITE_CHANNEL_MIX_MODE,
  WireSenderId,
  type WhiteChannelMixMode,
} from '../types'
import type { DmxValuesPayload } from '../../shared/ipcTypes'
import { DmxLightManager } from './DmxLightManager'
import { blackoutUniverse, normaliseUniverseBuffer } from '../helpers/dmxHelpers'
import { scaleDmxValueByPercent } from '../helpers/brightnessScaling'
import { resolveMovingHeadAxes, StrobePeakLatch } from './publisherLightOutput'
import { FixtureChannelWriter, strobeChannelChops, type LightOutput } from './fixtureChannelWriter'
import type { PublisherSenders } from './SenderManager'
import { LightStateManager, type LightStatesListener } from './sequencer/LightStateManager'
import type {
  ProcessedLightColor,
  PublisherFrameContext,
  PublisherFrameProcessor,
  PublisherFrameRigView,
} from './PublisherFrameProcessor'
import { VenueFrameProcessor } from './VenueFrameProcessor'
import { WireSlotGovernor } from './wireSlotGovernor'
import { WireOutputDelay } from './WireOutputDelay'
import { StrobeStateManager } from './StrobeStateManager'
import { MASTER_DIMMER_MAX_PERCENT, MasterOutputState } from './MasterOutputState'
import { createLogger } from '../../shared/logger'
const log = createLogger('DmxPublisher')

/** Opaque timer handle so the output governor can be driven by injected fakes in tests. */
type TimerHandle = ReturnType<typeof setTimeout>

/**
 * Time + timer source for the output-rate governor. Defaults to real wall-clock/timers;
 * tests inject a deterministic implementation (mirrors the device-factory injection pattern
 * used by the USB senders).
 */
export interface PublisherTiming {
  now(): number
  setTimer(cb: () => void, ms: number): TimerHandle
  clearTimer(handle: TimerHandle): void
}

const REAL_TIMING: PublisherTiming = {
  now: () => performance.now(),
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (handle) => clearTimeout(handle),
}

/** Optional construction options. Omitting `outputRateHz` leaves the governor disabled. */
export interface DmxPublisherOptions {
  /**
   * Max DMX output frames/sec. When set (> 0) the publisher coalesces redundant / over-rate
   * frames so cheap USB / low-end sACN adapters aren't fire-hosed at the render tick rate.
   * The same interval is mirrored onto the IPC preview path (without dirty-skip, since the
   * renderer tolerates redundant frames cheaply). Unset/0 = legacy behaviour: every published
   * frame is sent synchronously.
   */
  outputRateHz?: number
  timing?: PublisherTiming
  /** Initial White Channel Mix Mode; {@link DmxPublisher.setWhiteChannelMixMode} swaps it live. */
  whiteChannelMixMode?: WhiteChannelMixMode
  /**
   * Frame-processing stage inserted after cue blending and before strobe latch / DMX encoding.
   * Whoever supplies it keeps the reference and drives it; the publisher only reads from it.
   */
  frameProcessor?: PublisherFrameProcessor
  /**
   * Master dimmer / blackout / strobe-gate controls. Same ownership rule as `frameProcessor`:
   * the caller keeps the reference and mutates it, the publisher only reads. Omitting it gives a
   * private instance at its defaults, which is full output with strobes enabled.
   */
  masterOutput?: MasterOutputState
  /** Milliseconds to hold wire output, read per frame. See {@link WireOutputDelay}. */
  getLagCompensationMs?: () => number
}

/**
 * Per-light snapshot of the brightest blended color seen during an active strobe cue.
 *
 * No `opacity`: by the time light state reaches the publisher, LightTransitionController has
 * already consumed the strobe's opacity envelope into rgb/intensity (replace-mode blend does
 * `channel * opacity`) and emits a constant `opacity: 1.0`. So peak brightness — not opacity —
 * is the signal that identifies the cue's highest-opacity moment.
 */
/**
 * Lightweight rate cap for the IPC preview path. Mirrors `_minIntervalMs` but skips dirty-skip
 * (renderer tolerates redundant frames; comparing the multi-buffer payload isn't worth it) and
 * keeps a single trailing timer to flush the most recent payload at the end of an idle window.
 */
interface IpcGovernor {
  lastSendTimeMs: number
  pending: DmxValuesPayload | null
  trailingTimer: TimerHandle | null
}

/**
 * Prepares DMX data to be sent to individual lights by mapping channel names to the
 * fixture's channel numbers and setting their values accordingly.
 *
 * **Wire routing.** Each `DmxRig` may declare an `outputs: WireSenderId[]` whitelist; the
 * publisher builds one buffer per enabled wire-sender slot and writes a rig's channels only
 * into the slots it is routed to. A rig with `outputs === undefined` publishes to every enabled
 * wire sender (legacy default).
 *
 * **IPC preview.** The IPC channel does not participate in `outputs` routing. The publisher
 * builds one channel buffer per active rig, keyed by rig id, and forwards the whole map to the
 * renderer as a {@link DmxValuesPayload} (`kind: 'rigs'`). The renderer's preview rig-selector
 * picks which rig's buffer to render. This is what prevents collisions when rigs targeting
 * different physical universes happen to share channel numbers.
 */
/**
 * One chain → one subscription. The publisher takes ownership of removing this on
 * `setRigChains` so a chain that goes away can't keep firing into a stale aggregated map.
 */
interface ChainSubscription {
  rigId: string
  lightStateManager: LightStateManager
  handler: LightStatesListener
}

export class DmxPublisher {
  private _rigManagers: Map<string, { manager: DmxLightManager; rig: DmxRig }> = new Map()
  private _sender: PublisherSenders
  /**
   * Single-source `LightStateManager` subscription used when the publisher is wired to one
   * merged stream (the historical model). Mutually exclusive with `_chainSubscriptions`:
   * `setRigChains` clears this when switching to per-chain demux.
   */
  private _lightStateManager: LightStateManager | null
  /**
   * Per-rig `LightStateManager` subscriptions. When populated, each chain's emission writes
   * its rig's lights into `_aggregatedLights`, and a coalesced flush calls `publishNow`
   * with the merged map so the wire/IPC output paths see the full state every frame.
   */
  private _chainSubscriptions: ChainSubscription[] = []
  /** Aggregated lights across all subscribed chains. Cleared in `shutdown`. */
  private _aggregatedLights = new Map<string, RGBIO>()
  /** Microtask-coalesced publish: many chain emissions in one synchronous burst → one publish. */
  private _publishScheduled = false
  private _strobeStateManager: StrobeStateManager
  private _immediateBlackoutData: Record<number, number> = blackoutUniverse()
  /** When true, `publish` ignores light states; output comes only from `setManualBuffer`. */
  private _manualMode = false
  /** Set once `shutdown` has sent the final blackout. Nothing may reach the wire afterwards. */
  private _isShutDown = false
  /** Turns each light's resolved colour into bytes at its fixture's addresses. */
  private readonly _channelWriter = new FixtureChannelWriter()
  /** Reused for every light in a frame, so handing one to the writer allocates nothing. */
  private _lightOutput: LightOutput = { red: 0, green: 0, blue: 0, intensity: 0, pan: 0, tilt: 0 }
  /** Steady colour for a fixture whose own strobe channel is chopping. */
  private _strobePeakLatch = new StrobePeakLatch()

  /** How a `white` emitter is driven; see {@link WhiteChannelMixMode}. */
  private _whiteChannelMixMode: WhiteChannelMixMode = DEFAULT_WHITE_CHANNEL_MIX_MODE

  private _frameProcessor: PublisherFrameProcessor
  /** Master dimmer / blackout / strobe gate, read once per frame and never written here. */
  private _masterOutput: MasterOutputState
  /**
   * Most recent light states handed to {@link publishNow}, so {@link refreshOutput} can re-emit
   * the current look when a global control changes. Held by reference: in chain mode this is the
   * publisher's own aggregated map, so it stays current for free.
   */
  private _lastPublishedLights: ReadonlyMap<string, Readonly<RGBIO>> = new Map()
  /** Last buffer given to {@link setManualBuffer}, pre-gate, for the same reason. */
  private _lastManualBuffer: Record<number, number> | null = null
  /** Re-pointed per rig rather than rebuilt. */
  private _frameContext: PublisherFrameContext = { nowMs: 0, rigId: '' }
  /** Reused across every fixture in a frame so the colour stage allocates nothing. */
  private _frameColor: ProcessedLightColor = { r: 0, g: 0, b: 0, intensity: 0 }

  // --- Output-rate governor (opt-in via DmxPublisherOptions.outputRateHz) ---
  /** Min ms between wire sends. 0 = governor disabled (legacy synchronous pass-through). */
  private _minIntervalMs = 0
  private _timing: PublisherTiming = REAL_TIMING
  /** Per-wire-sender governor + working buffer state. */
  private readonly _governor: WireSlotGovernor
  /** Holds wire frames for the output delay, leaving the IPC preview immediate. */
  private readonly _wireDelay: WireOutputDelay
  /** Lightweight rate cap for the IPC preview path (separate from wire-slot governor). */
  private _ipc: IpcGovernor = { lastSendTimeMs: 0, pending: null, trailingTimer: null }

  constructor(
    senderManager: PublisherSenders,
    lightStateManager: LightStateManager | null,
    strobeStateManager: StrobeStateManager = new StrobeStateManager(),
    options: DmxPublisherOptions = {},
  ) {
    this._sender = senderManager
    this._lightStateManager = lightStateManager
    this._strobeStateManager = strobeStateManager
    if (options.timing) {
      this._timing = options.timing
    }
    const hz = options.outputRateHz
    if (typeof hz === 'number' && Number.isFinite(hz) && hz > 0) {
      this._minIntervalMs = 1000 / hz
    }
    if (options.whiteChannelMixMode) {
      this._whiteChannelMixMode = options.whiteChannelMixMode
    }
    this._frameProcessor = options.frameProcessor ?? new VenueFrameProcessor()
    this._masterOutput = options.masterOutput ?? new MasterOutputState()
    // The governor sends through the delay, so the hold sits below its rate gate and leaves its
    // dirty-skip and trailing-timer bookkeeping on real time.
    this._wireDelay = new WireOutputDelay(
      { send: (wireId, buffer) => this._sender.send(wireId, buffer) },
      this._timing,
      options.getLagCompensationMs ?? ((): number => 0),
    )
    this._governor = new WireSlotGovernor(this._wireDelay, this._timing, this._minIntervalMs)

    this.publish = this.publish.bind(this)
    if (this._lightStateManager) {
      this._lightStateManager.onLightStatesUpdated(this.publish)
    }
    this._strobeStateManager.on('change', this._onStrobeSlotChange)
  }

  /**
   * The strobe slot drives the hardware strobe channels, so a slot change goes out even when no
   * light changed. On the chain path it rides the flush a light update in the same tick queued.
   */
  private readonly _onStrobeSlotChange = (): void => {
    if (this._chainSubscriptions.length > 0) {
      this._schedulePublishFlush()
      return
    }
    queueMicrotask(() => this.publish(this._lastPublishedLights))
  }

  /**
   * Subscribe to one `LightStateManager` per rig chain. Each chain's emission carries only
   * its rig's lights; the publisher merges them into one aggregated map and coalesces
   * multiple synchronous emissions in a tick into a single `publishNow` call via a
   * microtask. Disposes any prior chain subscriptions, and the single-source subscription
   * passed at construction (if any).
   */
  public setRigChains(
    chains: Array<{ rigId: string; lightStateManager: LightStateManager }>,
  ): void {
    // Tear down any prior chain subscriptions and the legacy single-source subscription so
    // we can't double-publish.
    for (const sub of this._chainSubscriptions) {
      sub.lightStateManager.offLightStatesUpdated(sub.handler)
    }
    this._chainSubscriptions = []
    if (this._lightStateManager) {
      this._lightStateManager.offLightStatesUpdated(this.publish)
      this._lightStateManager = null
    }
    // Clear aggregated state — light ids that belonged to chains we're dropping must not
    // survive into the next frame.
    this._aggregatedLights.clear()

    for (const chain of chains) {
      const handler = (lights: ReadonlyMap<string, Readonly<RGBIO>>): void => {
        for (const [lightId, state] of lights) {
          this._aggregatedLights.set(lightId, state)
        }
        this._schedulePublishFlush()
      }
      chain.lightStateManager.onLightStatesUpdated(handler)
      this._chainSubscriptions.push({
        rigId: chain.rigId,
        lightStateManager: chain.lightStateManager,
        handler,
      })
    }
  }

  /** Coalesce synchronous chain emissions into one publish per tick via a microtask. */
  private _schedulePublishFlush(): void {
    if (this._publishScheduled) return
    this._publishScheduled = true
    queueMicrotask(() => {
      this._publishScheduled = false
      this.publish(this._aggregatedLights)
    })
  }

  /**
   * Publishes the provided light states to the DMX senders by
   * mapping the desired channels to each DMX fixture's channels.
   */
  public publish = (lights: ReadonlyMap<string, Readonly<RGBIO>>): void => {
    if (this._manualMode || this._isShutDown) {
      return
    }
    this.publishNow(lights)
  }

  /**
   * DMX Console: send a raw universe buffer and take over output until {@link clearManualBuffer}.
   * Console mode broadcasts the same buffer to every enabled wire slot (routing applies to cue
   * output only — the console isn't rig-aware) and emits a `kind: 'manual'` IPC payload so the
   * console page sees its own loopback.
   *
   * Values reach the wire exactly as given, with no brightness scaling: the console is a raw
   * per-channel takeover, and calibration depends on reading back the number you typed. The master
   * dimmer is excluded for that reason. Blackout is not: it is a safety control, and a console path
   * that kept emitting through it would not be a blackout.
   */
  public setManualBuffer(buffer: Record<number, number>): void {
    if (this._isShutDown) {
      return
    }
    this._manualMode = true
    this._lastManualBuffer = buffer
    this._resetGovernorAllSlots()

    const normalised = normaliseUniverseBuffer(buffer)
    const out =
      this._masterOutput.isBlackoutActive() || Object.keys(normalised).length === 0
        ? this._immediateBlackoutData
        : normalised

    const writeWires = (): void => {
      for (const wireId of this._sender.getEnabledWireSenders()) {
        this._governor.markWritten(wireId, out)
        void this._wireDelay.send(wireId, out)
      }
    }
    if (this._masterOutput.isBlackoutActive()) {
      this._wireDelay.emitNow(writeWires)
    } else {
      writeWires()
    }
    if (this._sender.isIpcEnabled()) {
      this._dispatchIpc({ kind: 'manual', buffer: out })
    }
  }

  /**
   * Resume cue-driven output from {@link LightStatesUpdated}.
   */
  public clearManualBuffer(): void {
    this._manualMode = false
    // Resume cue output at the leading edge (next frame sends immediately).
    this._resetGovernorAllSlots()
  }

  /**
   * Hot-swap the output rate. Called when the user changes the Global DMX Publishing Rate
   * preference so the change applies without tearing down senders. Values <= 0 disable the
   * governor (legacy pass-through). Any in-flight trailing frames are dropped and the next
   * publish goes out at the new leading edge.
   */
  public setOutputRateHz(hz: number): void {
    const next = typeof hz === 'number' && Number.isFinite(hz) && hz > 0 ? 1000 / hz : 0
    if (next === this._minIntervalMs) {
      return
    }
    this._minIntervalMs = next
    this._governor.setMinIntervalMs(next)
    this._resetGovernorAllSlots()
  }

  /**
   * Hot-swap the White Channel Mix Mode. Takes effect on the next published frame; nothing is
   * cached per mode, so no governor or plan reset is needed.
   */
  public setWhiteChannelMixMode(mode: WhiteChannelMixMode): void {
    this._whiteChannelMixMode = mode
  }

  /**
   * Re-emit the current look after {@link MasterOutputState} changed. A running show would pick a
   * new level up on its next frame anyway, but a rig idle between songs publishes nothing, and a
   * blackout that waited for the next cue would not be a blackout. Console mode re-sends its last
   * raw buffer through the same gate. The governor reset puts the re-emit on the leading edge
   * rather than waiting out the current rate window.
   */
  public refreshOutput(): void {
    if (this._isShutDown) {
      return
    }
    this._resetGovernorAllSlots()
    // Blackout, master dimmer and the strobe gate all re-emit through here, and an operator
    // reaching for any of them means now, not once the output delay has run down.
    this._wireDelay.emitNow(() => {
      if (this._manualMode) {
        if (this._lastManualBuffer !== null) {
          this.setManualBuffer(this._lastManualBuffer)
        }
        return
      }
      this.publishNow(this._lastPublishedLights)
    })
  }

  /**
   * Updates the active rigs being published.
   * Only active rigs (where active === true) will be included.
   * @param activeRigs Array of active DMX rigs
   */
  public updateActiveRigs(activeRigs: DmxRig[]): void {
    // Filter to only active rigs
    const rigsToPublish = activeRigs.filter((rig) => rig.active === true)

    // Remove managers for rigs that are no longer active or have been deleted
    const currentRigIds = new Set(rigsToPublish.map((rig) => rig.id))
    let removedAny = false
    for (const [rigId] of this._rigManagers) {
      if (!currentRigIds.has(rigId)) {
        this._rigManagers.delete(rigId)
        removedAny = true
      }
    }

    // Add or update managers for active rigs
    for (const rig of rigsToPublish) {
      const existing = this._rigManagers.get(rig.id)
      if (existing) {
        // Update existing manager if config changed
        if (existing.rig.config !== rig.config) {
          existing.manager.setConfiguration(rig.config)
          existing.rig = rig
        } else {
          // Just update rig metadata (active, name, outputs)
          existing.rig = rig
        }
      } else {
        // Create new manager for this rig
        const manager = new DmxLightManager(rig.config)
        this._rigManagers.set(rig.id, { manager, rig })
      }
    }

    // Rig configuration just changed, so a fault the user has since fixed should be able to
    // report again rather than staying suppressed for the life of the process.
    this._channelWriter.resetFaultReports()

    // A dropped rig's channels are released on the next frame, so publish one now rather than
    // waiting for a light state that may never arrive if the rig set is now empty.
    if (removedAny && !this._manualMode) {
      this.publishNow(this._aggregatedLights)
    }
  }

  /**
   * Contains the logic for converting light states to DMX channels and sending them.
   * Produces one buffer per currently-enabled wire sender (populated according to each rig's
   * `outputs` routing) plus one buffer per active rig for the IPC preview. Wire slots dispatch
   * through their per-slot governor; the IPC payload goes through the separate IPC governor.
   */
  private publishNow(lights: ReadonlyMap<string, Readonly<RGBIO>>): void {
    this._lastPublishedLights = lights

    // 1. Snapshot the set of currently-enabled wire-sender slots and reconcile state.
    const enabledWireSenders = this._sender.getEnabledWireSenders()
    const ipcEnabled = this._sender.isIpcEnabled()
    this._governor.reconcile(new Set(enabledWireSenders))

    // If nobody's listening on the wire and IPC is off, there's nothing to do.
    if (enabledWireSenders.length === 0 && !ipcEnabled) {
      return
    }

    // 2. Clear each wire slot's working buffer in place.
    for (const wireId of enabledWireSenders) {
      const slot = this._governor.slotFor(wireId)
      for (const key of Object.keys(slot.buffer)) {
        delete slot.buffer[Number(key)]
      }
    }

    // Per-rig IPC buffers — fresh map each frame; entries are written only for active rigs that
    // produce any channel writes. Allocations are small (rig count is typically 1–3, each
    // buffer is sparse).
    const ipcRigBuffers: Record<string, Record<number, number>> = {}

    // 3. Global output controls, read once for the whole frame.
    //
    // The strobe gate has to disarm two independent mechanisms. Treating the slot as inactive
    // covers the hardware strobe-speed channel, which is driven from `activeStrobeSlot` below. It
    // does NOT cover the opacity-driven flash: the blender has already folded that into the rgb /
    // intensity values arriving here, so those lights are zeroed individually in the light loop,
    // which is what `suppressedStrobeLightIds` is for. A blackout disarms both as well.
    const masterPercent = this._masterOutput.getOutputPercent()
    const requestedStrobeSlot = this._strobeStateManager.getActive()
    const strobeSuppressed =
      requestedStrobeSlot != null &&
      (!this._masterOutput.isStrobeOutputEnabled() || this._masterOutput.isBlackoutActive())
    const activeStrobeSlot = strobeSuppressed ? null : requestedStrobeSlot

    // Strobe peak-hold state machine runs once per frame (across all rigs/lights).
    this._strobePeakLatch.beginFrame(activeStrobeSlot != null)

    // One timestamp for the whole frame, so a light reached by more than one rig neither advances
    // its trail twice nor re-rolls its grain.
    const frameProcActive = this._frameProcessor.isFrameProcessingActive()
    this._frameContext.nowMs = frameProcActive ? this._timing.now() : 0

    // Sort light IDs for consistent processing order
    const sortedLightIds = Array.from(lights.keys()).sort((a, b) => a.localeCompare(b))

    // 4. For each active rig, resolve its wire targets and write per-light channel values into
    //    each target wire slot's buffer AND into the rig's own IPC buffer.
    for (const [rigId, { manager, rig }] of this._rigManagers) {
      if (!rig.active) {
        continue
      }

      const wireTargets = this._resolveRigOutputs(rig, enabledWireSenders)
      // Rig's own IPC buffer is created lazily once we know we'll write something. Allocate
      // up-front when IPC is enabled so even rigs with zero channel writes still appear as an
      // empty entry (tests can assert "rig is active and present in payload").
      let ipcBuffer: Record<number, number> | null = null
      if (ipcEnabled) {
        ipcBuffer = {}
        ipcRigBuffers[rigId] = ipcBuffer
      }
      if (wireTargets.length === 0 && !ipcEnabled) {
        // Nowhere this rig's channels could go — skip the per-light work.
        continue
      }

      // reconcile() ensured every enabled wire sender has slot state.
      this._channelWriter.beginRig(
        wireTargets.map((wireId) => this._governor.slotFor(wireId).buffer),
        ipcBuffer,
      )

      // Skipped entirely while no effect is running, which is the common case.
      let frameView: PublisherFrameRigView | null = null
      if (frameProcActive) {
        this._frameContext.rigId = rigId
        frameView = this._frameProcessor.prepareRigFrame(
          rig.config,
          manager,
          lights,
          this._frameContext,
        )
      }

      // Lights a strobe drives: the venue bypass below needs them, and so does `strobe-rgbw`.
      const strobeLightIds = activeStrobeSlot != null ? manager.getStrobeLightIds() : null
      // The same set, but only while the strobe gate is holding a strobe back. Exactly one of the
      // two is ever non-null, so a suppressed strobe gets none of the strobe-specific treatment
      // above and is simply published dark.
      const suppressedStrobeLightIds = strobeSuppressed ? manager.getStrobeLightIds() : null

      // Fixtures reached below via the light-states map. Anything left over (a fixture no cue has
      // addressed, or a strobe-group light excluded from cue targeting) gets its pinned `fixed`
      // channels emitted in a follow-up pass so mode/macro channels still publish.
      const visitedLightIds = new Set<string>()

      for (const lightId of sortedLightIds) {
        const lightValue = lights.get(lightId)!
        const dmxLight = manager.getDmxLight(lightId)
        if (!dmxLight) {
          continue
        }
        visitedLightIds.add(lightId)

        const strobeChannelActive = strobeChannelChops(dmxLight, activeStrobeSlot)
        // White Channel Mix Mode. Under `strobe-rgbw` either strobe mechanism counts — the flash
        // path (strobe set) or the hardware chop, whose colour the latch below resolves to the
        // flash peak. A fixture with no white emitter has no plan stage to apply this to.
        const additiveWhite =
          this._whiteChannelMixMode === 'always-rgbw' ||
          (this._whiteChannelMixMode === 'strobe-rgbw' &&
            (strobeChannelActive || strobeLightIds?.has(lightId) === true))

        let { red: r, green: g, blue: b, intensity } = lightValue
        const { pan, tilt } = lightValue

        // A light the strobe drives takes the venue colour minus the stages a flash cannot survive.
        // Hardware-strobe fixtures latch steady, so they keep every stage.
        const strobeFlashActive = strobeLightIds?.has(lightId) === true && !strobeChannelActive

        // Ahead of the strobe latch and the mixer so a latched colour and any derived white /
        // amber / UV emitter follow the venue effect too.
        if (frameView !== null && frameView.isActive()) {
          frameView.colorFor(lightId, lightValue, this._frameColor, strobeFlashActive)
          r = this._frameColor.r
          g = this._frameColor.g
          b = this._frameColor.b
          intensity = this._frameColor.intensity
        }

        // Hardware-strobe peak-hold: stock strobe cues flash opacity, which the blender folds
        // into rgb/intensity — so the post-blend stream swings between the peak (highest-opacity)
        // colour and the underlying primary cue. For a strobe-channel light we want a steady
        // colour while its hardware strobe channel does the chopping, so we track the brightest
        // sample seen since the strobe became active and always emit that. Brightness metric is
        // max(intensity, r, g, b) so a future constant-intensity coloured strobe still latches.
        const held = this._strobePeakLatch.resolve(lightId, strobeChannelActive, {
          red: r,
          green: g,
          blue: b,
          intensity,
        })
        r = held.red
        g = held.green
        b = held.blue
        intensity = held.intensity

        // Global output controls, applied to colour and intensity only, and after the latch above
        // so it still tracks true cue peaks rather than freezing whatever the fader happened to
        // read. Pan, tilt, strobe speed and pinned `fixed` channels are excluded by construction:
        // they are written below from values this block never touches.
        if (suppressedStrobeLightIds?.has(lightId) === true) {
          r = 0
          g = 0
          b = 0
          intensity = 0
        }
        if (masterPercent !== MASTER_DIMMER_MAX_PERCENT) {
          r = scaleDmxValueByPercent(r, masterPercent)
          g = scaleDmxValueByPercent(g, masterPercent)
          b = scaleDmxValueByPercent(b, masterPercent)
          intensity = scaleDmxValueByPercent(intensity, masterPercent)
        }

        const { panOut, tiltOut } = isMovingHead(dmxLight)
          ? resolveMovingHeadAxes(dmxLight, rig, pan, tilt)
          : {
              panOut: pan ?? dmxLight.config?.panHome ?? 0,
              tiltOut: tilt ?? dmxLight.config?.tiltHome ?? 0,
            }

        const output = this._lightOutput
        output.red = r
        output.green = g
        output.blue = b
        output.intensity = intensity
        output.pan = panOut
        output.tilt = tiltOut
        this._channelWriter.writeLight(
          lightId,
          dmxLight,
          output,
          strobeChannelActive ? activeStrobeSlot : null,
          additiveWhite,
        )
      }

      // Unvisited-fixture pass: fixtures no light state addressed this frame (pre-first-cue
      // lights, or strobe-group lights excluded from cue targeting) still get their pinned `fixed`
      // channels and a chopping strobe channel.
      this._channelWriter.writeUnvisited(
        manager.getAllDmxLights(),
        visitedLightIds,
        activeStrobeSlot,
      )
    }

    // 5. Release channels that stopped being addressed, then dispatch each wire slot through its
    //    per-slot governor. A slot with nothing left to say sends nothing.
    for (const wireId of enabledWireSenders) {
      const slot = this._governor.slotFor(wireId)
      this._governor.releaseUnwrittenChannels(slot)
      if (Object.keys(slot.buffer).length > 0) {
        this._governor.dispatch(wireId, slot)
      }
    }

    // 6. Dispatch the per-rig IPC payload through its own (simpler) rate cap.
    if (ipcEnabled) {
      this._dispatchIpc({ kind: 'rigs', rigBuffers: ipcRigBuffers })
    }
  }

  /**
   * Resolves a rig's effective wire-output set against the currently enabled senders.
   *  - `outputs: undefined`  → every enabled wire sender (legacy default).
   *  - `outputs: []`         → no wire senders (rig still feeds IPC; that path is independent).
   *  - `outputs: [...]`      → listed senders intersected with currently-enabled wire senders;
   *                             entries naming a disabled sender are silently dropped.
   */
  private _resolveRigOutputs(rig: DmxRig, enabledWireSenders: WireSenderId[]): WireSenderId[] {
    if (rig.outputs === undefined) {
      return enabledWireSenders.slice()
    }
    const targets: WireSenderId[] = []
    for (const id of rig.outputs) {
      if (enabledWireSenders.includes(id)) {
        targets.push(id)
      }
    }
    return targets
  }

  /**
   * IPC rate cap: mirrors `_minIntervalMs` (so a 44 Hz preference doesn't produce 100 Hz of
   * renderer traffic) but is significantly simpler than the wire-slot governor — no dirty-skip
   * (the renderer tolerates redundant frames cheaply) and a single trailing timer to flush the
   * latest payload at the end of an idle window.
   *
   * Per-rig buffers in the payload are allocated fresh each frame (not reused across frames),
   * so stashing `pending = payload` is safe — there's no risk of the next frame overwriting
   * its entries.
   */
  private _dispatchIpc(payload: DmxValuesPayload): void {
    if (this._minIntervalMs <= 0) {
      this._sender.sendIpc(payload)
      return
    }

    const now = this._timing.now()
    const elapsed = now - this._ipc.lastSendTimeMs
    if (this._ipc.lastSendTimeMs === 0 || elapsed >= this._minIntervalMs) {
      this._cancelTrailingIpc()
      this._ipc.lastSendTimeMs = now
      this._sender.sendIpc(payload)
      return
    }

    // Within the rate window: replace pending with the latest payload (per-rig buffers are
    // fresh allocations, so a reference snapshot is sufficient) and arm a trailing flush.
    this._ipc.pending = payload
    if (this._ipc.trailingTimer === null) {
      const delay = this._minIntervalMs - elapsed
      this._ipc.trailingTimer = this._timing.setTimer(() => this._flushTrailingIpc(), delay)
    }
  }

  private _flushTrailingIpc(): void {
    this._ipc.trailingTimer = null
    const pending = this._ipc.pending
    if (pending === null) {
      return
    }
    this._ipc.pending = null
    this._ipc.lastSendTimeMs = this._timing.now()
    this._sender.sendIpc(pending)
  }

  private _cancelTrailingIpc(): void {
    if (this._ipc.trailingTimer !== null) {
      this._timing.clearTimer(this._ipc.trailingTimer)
      this._ipc.trailingTimer = null
    }
    this._ipc.pending = null
  }

  /** Reset governor state so cue output resumes cleanly on a leading edge. */
  private _resetGovernorAllSlots(): void {
    this._governor.resetAll()
    this._cancelTrailingIpc()
    this._ipc.lastSendTimeMs = 0
  }

  public shutdown(): void {
    try {
      this.clearManualBuffer()
      // Remove all event listeners (single-source path uses removeAllListeners; per-chain
      // path uses per-subscription off()).
      if (this._lightStateManager) {
        this._lightStateManager.removeAllListeners()
        this._lightStateManager = null
      }
      this._strobeStateManager.off('change', this._onStrobeSlotChange)
      for (const sub of this._chainSubscriptions) {
        sub.lightStateManager.offLightStatesUpdated(sub.handler)
      }
      this._chainSubscriptions = []
      this._aggregatedLights.clear()
      // Set before the blackout below, so a flush queued earlier finds the publisher shut down
      // and drops its write.
      this._isShutDown = true
      this._rigManagers.clear()

      // Drop anything still held by the output delay, then blacken straight at the sender: a
      // final blackout is never something to hold back.
      this._wireDelay.clear()
      // Send a final blackout to every enabled wire sender. Blackout must hit every sender
      // regardless of per-rig routing.
      for (const wireId of this._sender.getEnabledWireSenders()) {
        void this._sender.send(wireId, this._immediateBlackoutData)
      }
      // Mirror the blackout on the IPC preview so the renderer sees the final state.
      if (this._sender.isIpcEnabled()) {
        this._cancelTrailingIpc()
        this._sender.sendIpc({ kind: 'manual', buffer: this._immediateBlackoutData })
      }
      log.info('DmxPublisher sent final blackout signal')

      // Cancel any in-flight trailing timers so we don't keep the event loop alive.
      this._governor.dispose()

      log.info('DmxPublisher has been successfully shut down.')
    } catch (error) {
      log.error('Error during DmxPublisher shutdown:', error)
      throw error
    }
  }
}
