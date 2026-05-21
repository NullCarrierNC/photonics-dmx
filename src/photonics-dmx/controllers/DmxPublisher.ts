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
} from '../types'
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
   * Unset/0 = legacy behaviour: every published frame is sent synchronously, no dirty-skip.
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
 * Prepares DMX data to be sent to individual lights by
 * mapping the provided channel names to the individual
 * fixture's channel numbers and setting their values accordingly.
 * These are then passed to a Sender for actual output.
 */
export class DmxPublisher {
  private _rigManagers: Map<string, { manager: DmxLightManager; rig: DmxRig }> = new Map()
  private _sender: SenderManager
  private _lightStateManager: LightStateManager
  private _strobeStateManager: StrobeStateManager
  private _immediateBlackoutData: Record<number, number> = {}
  /** Reused each frame to reduce GC */
  private _mergedBuffer: Record<number, number> = {}
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
  /** Wall time of the last actual send. 0 = none yet (leading edge fires immediately). */
  private _lastSendTimeMs = 0
  /** Last buffer actually handed to the sender; used for dirty-skip. Persistent to limit GC. */
  private _lastSentBuffer: Record<number, number> = {}
  private _hasLastSent = false
  /** Snapshot of the most recent rate-limited frame, flushed by the trailing timer. */
  private _pendingBuffer: Record<number, number> = {}
  private _hasPending = false
  private _trailingTimer: TimerHandle | null = null

  constructor(
    senderManager: SenderManager,
    lightStateManager: LightStateManager,
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
    this._lightStateManager.on('LightStatesUpdated', this.publish)

    // Pre-build blackout buffer
    for (let channel = 1; channel <= 512; channel++) {
      this._immediateBlackoutData[channel] = 0
    }
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
   */
  public setManualBuffer(buffer: Record<number, number>): void {
    this._manualMode = true
    // Console takes over immediately; drop any in-flight governed/trailing cue frame.
    this._resetGovernor()
    for (const key of Object.keys(this._mergedBuffer)) {
      delete this._mergedBuffer[Number(key)]
    }
    for (const [k, v] of Object.entries(buffer)) {
      const ch = Number(k)
      if (!Number.isFinite(ch) || ch < 1 || ch > 512) {
        continue
      }
      this._mergedBuffer[ch] = Math.max(0, Math.min(255, Math.round(v)))
    }
    if (Object.keys(this._mergedBuffer).length === 0) {
      for (let ch = 1; ch <= 512; ch++) {
        this._mergedBuffer[ch] = this._immediateBlackoutData[ch]
      }
    }
    try {
      this._sender.send(this._mergedBuffer)
    } catch (error) {
      log.error('Failed to send manual DMX data:', error)
    }
  }

  /**
   * Resume cue-driven output from {@link LightStatesUpdated}.
   */
  public clearManualBuffer(): void {
    this._manualMode = false
    // Resume cue output at the leading edge (next frame sends immediately).
    this._resetGovernor()
    for (const key of Object.keys(this._mergedBuffer)) {
      delete this._mergedBuffer[Number(key)]
    }
  }

  /**
   * Hot-swap the output rate. Called when the user changes the Global DMX Publishing Rate
   * preference so the change applies without tearing down senders. Values <= 0 disable the
   * governor (legacy pass-through). Any in-flight trailing frame is dropped and the next
   * publish goes out at the new leading edge.
   */
  public setOutputRateHz(hz: number): void {
    const next = typeof hz === 'number' && Number.isFinite(hz) && hz > 0 ? 1000 / hz : 0
    if (next === this._minIntervalMs) {
      return
    }
    this._minIntervalMs = next
    this._resetGovernor()
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
          // Just update rig metadata (active, name)
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
   * Contains the logic for converting light states
   * to DMX channels and sending them.
   * Merges all active rigs into one buffer and sends to all enabled senders.
   * Uses a persistent _mergedBuffer to avoid per-frame allocations.
   */
  private publishNow(lights: Map<string, RGBIO>): void {
    for (const key of Object.keys(this._mergedBuffer)) {
      delete this._mergedBuffer[Number(key)]
    }

    const activeStrobeSlot = this._strobeStateManager.getActive()
    // Drop the peak colors when transitioning out of an active strobe so the next strobe cue
    // starts fresh (re-establishes its own peak from the new cue's first frames).
    if (this._lastStrobeActive && activeStrobeSlot == null) {
      this._strobePeakColors.clear()
    }
    this._lastStrobeActive = activeStrobeSlot != null

    // Sort light IDs for consistent processing order
    const sortedLightIds = Array.from(lights.keys()).sort((a, b) => a.localeCompare(b))

    for (const [_rigId, { manager, rig }] of this._rigManagers) {
      if (!rig.active) {
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

          this._mergedBuffer[channelNumber] = Math.max(0, Math.min(255, value))
        }
      }
    }

    if (Object.keys(this._mergedBuffer).length > 0) {
      this._dispatch(this._mergedBuffer)
    }
  }

  /**
   * Output boundary. `publishNow` always runs every frame (the strobe peak-hold state machine
   * depends on seeing every blended frame), but the actual wire send is governed here so weak
   * adapters aren't fed at the render tick rate:
   *
   *  - Governor disabled (no `outputRateHz`): legacy behaviour — send every frame, no dirty-skip.
   *  - Dirty-skip: identical to the last sent frame → don't send. sACN `minRefreshRate` /
   *    Art-Net `base_refresh_interval` / the USB libs re-transmit their last buffer on their own
   *    keep-alive timer, so DMX continuity is preserved while redundant traffic is dropped.
   *  - Rate gate: leading-edge send when the interval has elapsed; otherwise snapshot the frame
   *    and arm a single trailing timer so the latest state is always flushed (no stale tail).
   */
  private _dispatch(buffer: Record<number, number>): void {
    if (this._minIntervalMs <= 0) {
      this._send(buffer)
      return
    }

    if (this._hasLastSent && this._buffersEqual(buffer, this._lastSentBuffer)) {
      // Latest intent already matches the wire: nothing to send, and any earlier deferred
      // frame is now superseded — drop it so the trailing timer can't flush a stale value.
      this._cancelTrailing()
      return
    }

    const now = this._timing.now()
    const elapsed = now - this._lastSendTimeMs
    if (!this._hasLastSent || elapsed >= this._minIntervalMs) {
      this._cancelTrailing()
      this._lastSendTimeMs = now
      this._send(buffer)
      return
    }

    // Within the rate window: keep the latest frame and arm a trailing flush if not already.
    this._snapshotInto(this._pendingBuffer, buffer)
    this._hasPending = true
    if (this._trailingTimer === null) {
      const delay = this._minIntervalMs - elapsed
      this._trailingTimer = this._timing.setTimer(() => this._flushTrailing(), delay)
    }
  }

  /** Trailing-timer callback: emit the most recent rate-limited frame (re-checking dirty). */
  private _flushTrailing(): void {
    this._trailingTimer = null
    if (!this._hasPending) {
      return
    }
    this._hasPending = false
    if (this._hasLastSent && this._buffersEqual(this._pendingBuffer, this._lastSentBuffer)) {
      return
    }
    this._lastSendTimeMs = this._timing.now()
    this._send(this._pendingBuffer)
  }

  /** Hand a buffer to the sender and record it for dirty-skip. */
  private _send(buffer: Record<number, number>): void {
    try {
      this._sender.send(buffer)
    } catch (error) {
      log.error('Failed to send DMX data:', error)
      return
    }
    if (this._minIntervalMs > 0) {
      this._snapshotInto(this._lastSentBuffer, buffer)
      this._hasLastSent = true
    }
  }

  private _cancelTrailing(): void {
    if (this._trailingTimer !== null) {
      this._timing.clearTimer(this._trailingTimer)
      this._trailingTimer = null
    }
    this._hasPending = false
  }

  /** Reset governor state so cue output resumes cleanly (leading-edge) after manual mode. */
  private _resetGovernor(): void {
    this._cancelTrailing()
    this._lastSendTimeMs = 0
    this._hasLastSent = false
    for (const key of Object.keys(this._lastSentBuffer)) {
      delete this._lastSentBuffer[Number(key)]
    }
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
      // Remove all event listeners
      this._lightStateManager.removeAllListeners()

      // Send a blackout signal to all DMX channels
      if (this._sender) {
        try {
          this._sender.send(this._immediateBlackoutData)
          log.info('DmxPublisher sent final blackout signal')
        } catch (err) {
          log.error('Error sending final blackout signal:', err)
        }
      }

      log.info('DmxPublisher has been successfully shut down.')
    } catch (error) {
      log.error('Error during DmxPublisher shutdown:', error)
      throw error
    }
  }
}
