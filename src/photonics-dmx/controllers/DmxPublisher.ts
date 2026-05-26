import {
  RGBIO,
  RgbwDmxChannels,
  RgbDmxChannels,
  StrobeDmxChannels,
  MovingHeadDmxChannels,
  DmxRig,
  FixtureTypes,
  DEFAULT_STROBE_CHANNEL_VALUES,
  normalizeFixtureConfig,
  WireSenderId,
} from '../types'
import type { DmxValuesPayload } from '../../shared/ipcTypes'
import { DmxLightManager } from './DmxLightManager'
import {
  castToChannelType,
  mirrorDmxForMovingHeadInvert,
  percentToDmx,
} from '../helpers/dmxHelpers'
import { SenderManager } from './SenderManager'
import { LightStateManager } from './sequencer/LightStateManager'
import { getStrobeStateManager, StrobeStateManager } from './StrobeStateManager'
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
}

/**
 * Per-light snapshot of the brightest blended color seen during an active strobe cue.
 *
 * No `opacity`: by the time light state reaches the publisher, LightTransitionController has
 * already consumed the strobe's opacity envelope into rgb/intensity (replace-mode blend does
 * `channel * opacity`) and emits a constant `opacity: 1.0`. So peak brightness — not opacity —
 * is the signal that identifies the cue's highest-opacity moment.
 */
interface StrobePeakColor {
  red: number
  green: number
  blue: number
  intensity: number
}

/**
 * Per-wire-sender working state. One instance per active wire-sender slot. The publisher merges
 * routed rig channels into `buffer` each frame, then runs the dirty-skip / leading / trailing
 * governor against that slot's own history. Slots are created lazily as senders become enabled
 * and discarded when senders are disabled.
 *
 * IPC has its own (simpler) governor — see {@link IpcGovernor} — because its payload shape is
 * a tagged per-rig structure rather than a flat channel buffer.
 */
interface SenderSlotState {
  /** Per-frame working buffer — rebuilt each `publishNow`, reused to limit GC. */
  buffer: Record<number, number>
  /** Wall time of the last actual send. 0 = none yet (leading edge fires immediately). */
  lastSendTimeMs: number
  /** Last buffer actually handed to the sender; used for dirty-skip. */
  lastSentBuffer: Record<number, number>
  hasLastSent: boolean
  /** Snapshot of the most recent rate-limited frame, flushed by the trailing timer. */
  pendingBuffer: Record<number, number>
  hasPending: boolean
  trailingTimer: TimerHandle | null
}

function makeSlotState(): SenderSlotState {
  return {
    buffer: {},
    lastSendTimeMs: 0,
    lastSentBuffer: {},
    hasLastSent: false,
    pendingBuffer: {},
    hasPending: false,
    trailingTimer: null,
  }
}

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
  handler: (lights: Map<string, RGBIO>) => void
}

export class DmxPublisher {
  private _rigManagers: Map<string, { manager: DmxLightManager; rig: DmxRig }> = new Map()
  private _sender: SenderManager
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
  private _immediateBlackoutData: Record<number, number> = {}
  /** When true, `publish` ignores light states; output comes only from `setManualBuffer`. */
  private _manualMode = false
  /**
   * Per-light peak colour seen since the current strobe became active. The stock strobe cues
   * modulate opacity, which the blender bakes into rgb/intensity — so the brightest blended
   * frame corresponds to the cue's peak (highest-opacity) moment. We hold that peak for the
   * whole strobe so a hardware-strobe-channel light shows a steady color while its strobe
   * channel does the chopping. Reset when the strobe cue ends.
   */
  private _strobePeakColors: Map<string, StrobePeakColor> = new Map()
  /** Tracks whether a strobe was active on the previous publish, so we can clear the latch on transition. */
  private _lastStrobeActive = false

  // --- Output-rate governor (opt-in via DmxPublisherOptions.outputRateHz) ---
  /** Min ms between wire sends. 0 = governor disabled (legacy synchronous pass-through). */
  private _minIntervalMs = 0
  private _timing: PublisherTiming = REAL_TIMING
  /** Per-wire-sender governor + working buffer state. */
  private _slots: Map<WireSenderId, SenderSlotState> = new Map()
  /** Lightweight rate cap for the IPC preview path (separate from wire-slot governor). */
  private _ipc: IpcGovernor = { lastSendTimeMs: 0, pending: null, trailingTimer: null }

  constructor(
    senderManager: SenderManager,
    lightStateManager: LightStateManager | null,
    strobeStateManager: StrobeStateManager = getStrobeStateManager(),
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

    this.publish = this.publish.bind(this)
    if (this._lightStateManager) {
      this._lightStateManager.on('LightStatesUpdated', this.publish)
    }

    // Pre-build blackout buffer
    for (let channel = 1; channel <= 512; channel++) {
      this._immediateBlackoutData[channel] = 0
    }
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
      sub.lightStateManager.off('LightStatesUpdated', sub.handler)
    }
    this._chainSubscriptions = []
    if (this._lightStateManager) {
      this._lightStateManager.off('LightStatesUpdated', this.publish)
      this._lightStateManager = null
    }
    // Clear aggregated state — light ids that belonged to chains we're dropping must not
    // survive into the next frame.
    this._aggregatedLights.clear()

    for (const chain of chains) {
      const handler = (lights: Map<string, RGBIO>): void => {
        for (const [lightId, state] of lights) {
          this._aggregatedLights.set(lightId, state)
        }
        this._schedulePublishFlush()
      }
      chain.lightStateManager.on('LightStatesUpdated', handler)
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
  public publish = (lights: Map<string, RGBIO>): void => {
    if (this._manualMode) {
      return
    }
    this.publishNow(lights)
  }

  /**
   * DMX Console: send a raw universe buffer and take over output until {@link clearManualBuffer}.
   * Console mode broadcasts the same buffer to every enabled wire slot (routing applies to cue
   * output only — the console isn't rig-aware) and emits a `kind: 'manual'` IPC payload so the
   * console page sees its own loopback.
   */
  public setManualBuffer(buffer: Record<number, number>): void {
    this._manualMode = true
    this._resetGovernorAllSlots()

    // Normalise the input buffer once; broadcast to every enabled wire slot.
    const normalised: Record<number, number> = {}
    for (const [k, v] of Object.entries(buffer)) {
      const ch = Number(k)
      if (!Number.isFinite(ch) || ch < 1 || ch > 512) {
        continue
      }
      normalised[ch] = Math.max(0, Math.min(255, Math.round(v)))
    }
    const out = Object.keys(normalised).length === 0 ? this._immediateBlackoutData : normalised

    for (const wireId of this._sender.getEnabledWireSenders()) {
      try {
        this._sender.send(wireId, out)
      } catch (error) {
        log.error(`Failed to send manual DMX data to ${wireId}:`, error)
      }
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
    this._resetGovernorAllSlots()
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
    for (const [rigId] of this._rigManagers) {
      if (!currentRigIds.has(rigId)) {
        this._rigManagers.delete(rigId)
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
  }

  /**
   * Contains the logic for converting light states to DMX channels and sending them.
   * Produces one buffer per currently-enabled wire sender (populated according to each rig's
   * `outputs` routing) plus one buffer per active rig for the IPC preview. Wire slots dispatch
   * through their per-slot governor; the IPC payload goes through the separate IPC governor.
   */
  private publishNow(lights: Map<string, RGBIO>): void {
    // 1. Snapshot the set of currently-enabled wire-sender slots and reconcile state.
    const enabledWireSenders = this._sender.getEnabledWireSenders()
    const ipcEnabled = this._sender.isIpcEnabled()
    this._reconcileSlots(new Set(enabledWireSenders))

    // If nobody's listening on the wire and IPC is off, there's nothing to do.
    if (enabledWireSenders.length === 0 && !ipcEnabled) {
      return
    }

    // 2. Clear each wire slot's working buffer in place.
    for (const wireId of enabledWireSenders) {
      const slot = this._ensureSlot(wireId)
      for (const key of Object.keys(slot.buffer)) {
        delete slot.buffer[Number(key)]
      }
    }

    // Per-rig IPC buffers — fresh map each frame; entries are written only for active rigs that
    // produce any channel writes. Allocations are small (rig count is typically 1–3, each
    // buffer is sparse).
    const ipcRigBuffers: Record<string, Record<number, number>> = {}

    // 3. Strobe peak-hold state machine runs once per frame (across all rigs/lights).
    const activeStrobeSlot = this._strobeStateManager.getActive()
    if (this._lastStrobeActive && activeStrobeSlot == null) {
      this._strobePeakColors.clear()
    }
    this._lastStrobeActive = activeStrobeSlot != null

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

      for (const lightId of sortedLightIds) {
        const lightValue = lights.get(lightId)!
        const dmxLight = manager.getDmxLight(lightId)
        if (!dmxLight) {
          continue
        }

        const lightChannels = dmxLight.channels as RgbDmxChannels
        const hasStrobeChannel = typeof lightChannels.strobeChannel === 'number'
        // The "Strobe Channel?" runtime path is for RGB-family fixtures whose template declares an
        // extra hardware strobe-speed channel. Dedicated STROBE fixtures are a separate device
        // class (no RGB to latch, no per-cue `strobeValues` model) and are deliberately excluded.
        const isRgbFamilyWithStrobeChannel =
          hasStrobeChannel && dmxLight.fixture !== FixtureTypes.STROBE
        const strobeChannelActive =
          activeStrobeSlot != null && dmxLight.isStrobeEnabled && isRgbFamilyWithStrobeChannel

        let { red: r, green: g, blue: b, intensity } = lightValue
        const { pan, tilt } = lightValue

        // Hardware-strobe peak-hold: stock strobe cues flash opacity, which the blender folds
        // into rgb/intensity — so the post-blend stream swings between the peak (highest-opacity)
        // colour and the underlying primary cue. For a strobe-channel light we want a steady
        // colour while its hardware strobe channel does the chopping, so we track the brightest
        // sample seen since the strobe became active and always emit that. Brightness metric is
        // max(intensity, r, g, b) so a future constant-intensity coloured strobe still latches.
        if (strobeChannelActive) {
          const currentLevel = Math.max(intensity, r, g, b)
          const peak = this._strobePeakColors.get(lightId)
          if (!peak) {
            if (currentLevel > 0) {
              this._strobePeakColors.set(lightId, { red: r, green: g, blue: b, intensity })
            }
            // else: pre-peak (first frame is fully dark) — emit as-is until a non-zero arrives.
          } else {
            const peakLevel = Math.max(peak.intensity, peak.red, peak.green, peak.blue)
            if (currentLevel > peakLevel) {
              // New brighter peak: store it and emit the current frame as-is.
              this._strobePeakColors.set(lightId, { red: r, green: g, blue: b, intensity })
            } else {
              // Hold the established peak.
              r = peak.red
              g = peak.green
              b = peak.blue
              intensity = peak.intensity
            }
          }
        } else if (this._strobePeakColors.has(lightId)) {
          this._strobePeakColors.delete(lightId)
        }

        const isMovingHead =
          dmxLight.fixture === FixtureTypes.RGBMH || dmxLight.fixture === FixtureTypes.RGBWMH
        let panOut: number
        let tiltOut: number
        if (isMovingHead) {
          const cfg = normalizeFixtureConfig(dmxLight.config)
          const homePanDmxLogical = percentToDmx(cfg.panHome, cfg.panMin, cfg.panMax)
          const homeTiltDmxLogical = percentToDmx(cfg.tiltHome, cfg.tiltMin, cfg.tiltMax)
          const homePanDmx = cfg.invertPan
            ? mirrorDmxForMovingHeadInvert(homePanDmxLogical, cfg.panMin, cfg.panMax)
            : homePanDmxLogical
          const homeTiltDmx = cfg.invertTilt
            ? mirrorDmxForMovingHeadInvert(homeTiltDmxLogical, cfg.tiltMin, cfg.tiltMax)
            : homeTiltDmxLogical
          if (pan != null) {
            const panDmx = percentToDmx(pan, cfg.panMin, cfg.panMax)
            panOut = cfg.invertPan
              ? mirrorDmxForMovingHeadInvert(panDmx, cfg.panMin, cfg.panMax)
              : panDmx
          } else {
            panOut = homePanDmx
          }
          if (tilt != null) {
            const tiltDmx = percentToDmx(tilt, cfg.tiltMin, cfg.tiltMax)
            tiltOut = cfg.invertTilt
              ? mirrorDmxForMovingHeadInvert(tiltDmx, cfg.tiltMin, cfg.tiltMax)
              : tiltDmx
          } else {
            tiltOut = homeTiltDmx
          }
        } else {
          panOut = pan ?? dmxLight.config?.panHome ?? 0
          tiltOut = tilt ?? dmxLight.config?.tiltHome ?? 0
        }

        const channelsInput: { [key: string]: number } = {
          red: r,
          green: g,
          blue: b,
          masterDimmer: intensity,
          pan: panOut,
          tilt: tiltOut,
        }

        let dmxChannelData
        try {
          dmxChannelData = castToChannelType(dmxLight.fixture, channelsInput)
        } catch (error) {
          log.error(`Error casting channels for Light ID: ${lightId} - ${error}`)
          continue
        }

        for (const [channelName, channelNumber] of Object.entries(dmxLight.channels)) {
          let value: number = 0

          switch (channelName) {
            case 'red':
              value = (dmxChannelData as RgbDmxChannels | RgbwDmxChannels).red
              break
            case 'green':
              value = (dmxChannelData as RgbDmxChannels | RgbwDmxChannels).green
              break
            case 'blue':
              value = (dmxChannelData as RgbDmxChannels | RgbwDmxChannels).blue
              break
            case 'masterDimmer':
              value = (dmxChannelData as RgbDmxChannels | RgbwDmxChannels | StrobeDmxChannels)
                .masterDimmer
              break
            case 'pan':
              value = (dmxChannelData as MovingHeadDmxChannels).pan
              break
            case 'tilt':
              value = (dmxChannelData as MovingHeadDmxChannels).tilt
              break
            case 'strobeChannel':
              if (strobeChannelActive && activeStrobeSlot) {
                const values = dmxLight.strobeValues ?? DEFAULT_STROBE_CHANNEL_VALUES
                value = values[activeStrobeSlot]
              } else {
                value = 0
              }
              break
            default:
              continue
          }

          const clamped = Math.max(0, Math.min(255, value))
          for (const wireId of wireTargets) {
            // _reconcileSlots ensured every enabled wire sender has slot state.
            this._slots.get(wireId)!.buffer[channelNumber] = clamped
          }
          if (ipcBuffer !== null) {
            ipcBuffer[channelNumber] = clamped
          }
        }
      }
    }

    // 5. Dispatch each wire slot that received writes through its per-slot governor.
    for (const wireId of enabledWireSenders) {
      const slot = this._slots.get(wireId)!
      if (Object.keys(slot.buffer).length > 0) {
        this._dispatchSender(wireId, slot)
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

  private _ensureSlot(wireId: WireSenderId): SenderSlotState {
    let slot = this._slots.get(wireId)
    if (!slot) {
      slot = makeSlotState()
      this._slots.set(wireId, slot)
    }
    return slot
  }

  /**
   * Removes governor state for wire-sender slots that are no longer enabled (cancelling any
   * in-flight trailing timer). Called once per frame; cheap because the active set is small.
   * A stale trailing timer that already fired before this point will hit a disabled slot in
   * `SenderManager.send`, which silently no-ops.
   */
  private _reconcileSlots(activeIds: Set<WireSenderId>): void {
    for (const [wireId, slot] of this._slots) {
      if (!activeIds.has(wireId)) {
        this._cancelTrailingFor(slot)
        this._slots.delete(wireId)
      }
    }
  }

  /**
   * Per-wire-slot output governor. `publishNow` always runs every frame (the strobe peak-hold
   * state machine depends on seeing every blended frame), but the actual wire send is governed
   * here so weak adapters aren't fed at the render tick rate.
   *
   *  - Governor disabled (no `outputRateHz`): legacy behaviour — send every frame, no dirty-skip.
   *  - Dirty-skip: identical to the last sent frame for this slot → don't send.
   *  - Rate gate: leading-edge send when the slot's interval has elapsed; otherwise snapshot the
   *    frame and arm a single trailing timer so the latest state is always flushed (no stale tail).
   *
   * Each slot has its own `lastSendTimeMs` and dirty-skip cache, so traffic on one sender does
   * not suppress traffic on another. `_minIntervalMs` is a global Hz preference shared across
   * all slots.
   */
  private _dispatchSender(wireId: WireSenderId, slot: SenderSlotState): void {
    if (this._minIntervalMs <= 0) {
      this._sendToSender(wireId, slot, slot.buffer)
      return
    }

    if (slot.hasLastSent && this._buffersEqual(slot.buffer, slot.lastSentBuffer)) {
      // Latest intent already matches the wire for this slot: nothing to send, and any earlier
      // deferred frame for this slot is now superseded — drop it so the trailing timer can't
      // flush a stale value.
      this._cancelTrailingFor(slot)
      return
    }

    const now = this._timing.now()
    const elapsed = now - slot.lastSendTimeMs
    if (!slot.hasLastSent || elapsed >= this._minIntervalMs) {
      this._cancelTrailingFor(slot)
      slot.lastSendTimeMs = now
      this._sendToSender(wireId, slot, slot.buffer)
      return
    }

    // Within the rate window: keep the latest frame and arm a trailing flush if not already.
    this._snapshotInto(slot.pendingBuffer, slot.buffer)
    slot.hasPending = true
    if (slot.trailingTimer === null) {
      const delay = this._minIntervalMs - elapsed
      slot.trailingTimer = this._timing.setTimer(() => this._flushTrailingFor(wireId, slot), delay)
    }
  }

  /** Trailing-timer callback: emit the most recent rate-limited frame for this slot. */
  private _flushTrailingFor(wireId: WireSenderId, slot: SenderSlotState): void {
    slot.trailingTimer = null
    if (!slot.hasPending) {
      return
    }
    slot.hasPending = false
    if (slot.hasLastSent && this._buffersEqual(slot.pendingBuffer, slot.lastSentBuffer)) {
      return
    }
    slot.lastSendTimeMs = this._timing.now()
    this._sendToSender(wireId, slot, slot.pendingBuffer)
  }

  /** Hand a buffer to the wire sender for one slot and record it for dirty-skip. */
  private _sendToSender(
    wireId: WireSenderId,
    slot: SenderSlotState,
    buffer: Record<number, number>,
  ): void {
    try {
      this._sender.send(wireId, buffer)
    } catch (error) {
      log.error(`Failed to send DMX data to ${wireId}:`, error)
      return
    }
    if (this._minIntervalMs > 0) {
      this._snapshotInto(slot.lastSentBuffer, buffer)
      slot.hasLastSent = true
    }
  }

  private _cancelTrailingFor(slot: SenderSlotState): void {
    if (slot.trailingTimer !== null) {
      this._timing.clearTimer(slot.trailingTimer)
      slot.trailingTimer = null
    }
    slot.hasPending = false
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

  /** Reset governor state across all slots so cue output resumes cleanly (leading-edge). */
  private _resetGovernorAllSlots(): void {
    for (const slot of this._slots.values()) {
      this._cancelTrailingFor(slot)
      slot.lastSendTimeMs = 0
      slot.hasLastSent = false
      for (const key of Object.keys(slot.lastSentBuffer)) {
        delete slot.lastSentBuffer[Number(key)]
      }
    }
    this._cancelTrailingIpc()
    this._ipc.lastSendTimeMs = 0
  }

  /** Copy `src` into the persistent `dest` object (clear-then-fill) to keep allocations down. */
  private _snapshotInto(dest: Record<number, number>, src: Record<number, number>): void {
    for (const key of Object.keys(dest)) {
      delete dest[Number(key)]
    }
    for (const [k, v] of Object.entries(src)) {
      dest[Number(k)] = v
    }
  }

  private _buffersEqual(a: Record<number, number>, b: Record<number, number>): boolean {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) {
      return false
    }
    for (const k of aKeys) {
      if (a[Number(k)] !== b[Number(k)]) {
        return false
      }
    }
    return true
  }

  public async shutdown(): Promise<void> {
    try {
      this.clearManualBuffer()
      // Remove all event listeners (single-source path uses removeAllListeners; per-chain
      // path uses per-subscription off()).
      if (this._lightStateManager) {
        this._lightStateManager.removeAllListeners()
        this._lightStateManager = null
      }
      for (const sub of this._chainSubscriptions) {
        sub.lightStateManager.off('LightStatesUpdated', sub.handler)
      }
      this._chainSubscriptions = []
      this._aggregatedLights.clear()

      // Send a final blackout to every enabled wire sender. Blackout must hit every sender
      // regardless of per-rig routing.
      for (const wireId of this._sender.getEnabledWireSenders()) {
        try {
          this._sender.send(wireId, this._immediateBlackoutData)
        } catch (err) {
          log.error(`Error sending final blackout to ${wireId}:`, err)
        }
      }
      // Mirror the blackout on the IPC preview so the renderer sees the final state.
      if (this._sender.isIpcEnabled()) {
        this._cancelTrailingIpc()
        this._sender.sendIpc({ kind: 'manual', buffer: this._immediateBlackoutData })
      }
      log.info('DmxPublisher sent final blackout signal')

      // Cancel any in-flight trailing timers so we don't keep the event loop alive.
      for (const slot of this._slots.values()) {
        this._cancelTrailingFor(slot)
      }
      this._slots.clear()

      log.info('DmxPublisher has been successfully shut down.')
    } catch (error) {
      log.error('Error during DmxPublisher shutdown:', error)
      throw error
    }
  }
}
