import { RGBIO, Transition } from '../../types'
import { LightTransitionController } from './LightTransitionController'
import { ILayerManager, ISystemEffectsController } from './interfaces'
import { createLogger } from '../../../shared/logger'
import { BLACKOUT_LAYER } from '../../constants/nodeConstants'
const log = createLogger('SystemEffectsController')

/**
 * @class SystemEffectsController
 * @description Handles system-level effects like blackout .
 */
export class SystemEffectsController implements ISystemEffectsController {
  private lightTransitionController: LightTransitionController
  private layerManager: ILayerManager
  private isBlackingOut: boolean = false
  private _blackoutLayersUnder: number = BLACKOUT_LAYER
  /** Per-light fade timers of the in-flight blackout; cleared on cancel/dispose. */
  private pendingTimers: Set<NodeJS.Timeout> = new Set()
  /** Resolvers paired with {@link pendingTimers}, settled early on cancel so `blackout()` returns. */
  private pendingResolvers: Set<() => void> = new Set()
  /** Bumped at each blackout start; a continuation whose generation is stale must not touch state. */
  private generation = 0
  /** Whether the running blackout has already reported a request it refused. */
  private reportedRefusal = false

  // Callback for blackout completion events (both immediate and timed)
  private onBlackoutCompleteCallback: (() => void) | null = null

  /**
   * @constructor
   * @param lightTransitionController The underlying transition controller
   * @param layerManager The layer manager instance
   * @param timeoutManager The timeout manager
   */
  constructor(lightTransitionController: LightTransitionController, layerManager: ILayerManager) {
    this.lightTransitionController = lightTransitionController
    this.layerManager = layerManager
  }

  /**
   * Registers a callback to be called when a blackout completes (either immediate or timed)
   */
  public setOnBlackoutCompleteCallback(callback: () => void): void {
    this.onBlackoutCompleteCallback = callback
  }

  /**
   * Checks if a blackout is currently active
   * @returns Whether blackout is active
   */
  public isBlackoutActive(): boolean {
    return this.isBlackingOut
  }

  /**
   * Hold or release an occlusion over the whole rig: every light publishes dark while the running
   * cue keeps advancing underneath, and reappears at its natural state the moment it is released.
   *
   * Delegated to the transition controller, which gates the published colour rather than stacking an
   * overlay on a layer. A layer would not survive: `setEffect` clears every transition through
   * `removeAllEffects`, as do the blackout paths, so the next cue to submit would drop it.
   */
  public holdOcclusion(on: boolean): void {
    this.lightTransitionController.setOcclusionHeld(on)
  }

  /** Whether the occlusion is currently held. */
  public isOcclusionHeld(): boolean {
    return this.lightTransitionController.isOcclusionHeld()
  }

  /**
   * Initiates a blackout effect that visually fades out all lights.
   * If called, we set isBlackingOut and schedule a transition on layer 255,
   * then clear all active effects after the fade completes.
   * Layer 255 is the blackout's alone, so it overrides every cue's effects, the strobes included.
   *
   * @param duration The duration of the blackout fade in milliseconds.
   * @returns A promise that resolves when the blackout is complete.
   */
  public async blackout(duration: number): Promise<void> {
    if (duration === 0) {
      // Dark now is what the caller asked for, so it takes over a fade rather than queueing behind
      // one. The fade's terminal wipe is generation gated, and cancelling moves the generation on.
      if (this.isBlackingOut) {
        this.cancelBlackout()
      }
    } else if (this.isBlackingOut) {
      // A cue streaming blackouts asks again on every frame, so the refusal is reported once for
      // the run that refused it.
      if (!this.reportedRefusal) {
        this.reportedRefusal = true
        log.warn('Blackout is already in progress. Ignoring this and any further requests.')
      }
      return
    }

    if (duration === 0) {
      this.wipeToBlack()
      return
    }

    this.isBlackingOut = true
    this.reportedRefusal = false
    const generation = ++this.generation

    log.info(`Initiating blackout for ${duration}ms.`)

    try {
      // Every light the rig publishes, which is the source the instant path takes through
      // immediateBlackout.
      const allLightIds = this.lightTransitionController.getLightStateManagerTrackedLights()

      // Set transitions for all lights
      const transitionPromises = allLightIds.map((lightId) => {
        return new Promise<void>((resolve) => {
          // Get current light state to check for existing pan/tilt values
          const currentLightState = this.lightTransitionController.getFinalLightState(lightId)

          // Create a base blackout color without pan/tilt
          const blackoutColor: RGBIO = {
            red: 0,
            green: 0,
            blue: 0,
            intensity: 0,
            opacity: 1.0,
            blendMode: 'replace',
          }

          // Only preserve pan/tilt for fixtures that already have them
          if (currentLightState && currentLightState.pan !== undefined) {
            blackoutColor.pan = currentLightState.pan
          }

          if (currentLightState && currentLightState.tilt !== undefined) {
            blackoutColor.tilt = currentLightState.tilt
          }

          // Create a blackout transition that only preserves existing pan/tilt values
          const blackoutTransition: Transition = {
            transform: {
              color: blackoutColor,
              easing: 'linear',
              duration: duration,
            },
            layer: BLACKOUT_LAYER,
          }

          // Fade from the light's current blended output, not its layer-0 state: a colour effect
          // on a higher layer (or no layer-0 state at all) would otherwise pop or snap to black at
          // the start of the fade instead of dimming smoothly from what is actually on screen.
          this.lightTransitionController.setTransition(
            lightId,
            BLACKOUT_LAYER,
            currentLightState ?? this.lightTransitionController.getLightState(lightId, 0),
            blackoutTransition.transform.color,
            blackoutTransition.transform.duration,
            blackoutTransition.transform.easing,
          )
          // Resolve after the transition duration (plus one frame time to ensure completion).
          // Tracked so cancelBlackout/dispose can clear the timer and settle the promise early.
          const timer = setTimeout(() => {
            this.pendingTimers.delete(timer)
            this.pendingResolvers.delete(resolve)
            resolve()
          }, duration + 16)
          this.pendingTimers.add(timer)
          this.pendingResolvers.add(resolve)
        })
      })

      // Wait for all transitions to complete
      await Promise.all(transitionPromises)

      // A cancelled or superseded blackout must not run the terminal wipe: cancelBlackout has
      // already removed the fade transitions, and whatever cue started since owns the lights now.
      if (this.generation !== generation || !this.isBlackingOut) {
        return
      }

      // The same wipe as an instant blackout. Deleting the effects alone would leave their layer
      // states in the transition controller (a primary cue keeps its effects up when it stops), and
      // they would reappear the moment the fade's own layer-255 black was gone.
      this.wipeToBlack()
    } catch (error) {
      log.error('An error occurred during blackout:', error)
    } finally {
      // Only the current blackout may clear the flag — a stale continuation resuming after a
      // cancel-then-restart would otherwise mark the NEW blackout as finished mid-fade.
      if (this.generation === generation) {
        this.isBlackingOut = false
      }
    }
  }

  /**
   * Cancels a blackout mid-fade.
   * We remove transitions from the blackout layer so new effects can override, clear the fade
   * timers, and settle the in-flight `blackout()` promise (its terminal wipe is generation-gated).
   */
  public cancelBlackout(): void {
    if (this.isBlackingOut) {
      log.warn('Cancelling in-progress blackout.')
      this.isBlackingOut = false
      // The fade's continuation checks the generation as well as the flag, so move it on here and
      // whatever follows the cancel cannot be wiped by the fade it replaced.
      this.generation++
      this.clearPendingBlackout()
      this.lightTransitionController.removeTransitionsByLayer(BLACKOUT_LAYER)
    }
  }

  /**
   * Drops every effect, queue and layer state and publishes black, keeping each moving head's
   * pan/tilt. Ends both the instant blackout and a completed fade.
   */
  private wipeToBlack(): void {
    for (const layer of this.layerManager.getAllLayers()) {
      this.layerManager.removeActiveEffect(layer, 'all')
      this.layerManager.removeQueuedEffect(layer, 'all')
    }
    this.lightTransitionController.immediateBlackout()
    this.onBlackoutCompleteCallback?.()
  }

  /**
   * Releases blackout timers/promises on owner teardown so nothing fires after shutdown.
   */
  public dispose(): void {
    this.isBlackingOut = false
    this.clearPendingBlackout()
  }

  private clearPendingBlackout(): void {
    for (const timer of this.pendingTimers) {
      clearTimeout(timer)
    }
    this.pendingTimers.clear()
    const resolvers = [...this.pendingResolvers]
    this.pendingResolvers.clear()
    for (const resolve of resolvers) {
      resolve()
    }
  }

  /**
   * Gets the layer threshold used for blackout operations
   * @returns The layer number below which effects are blocked during blackout
   */
  public getBlackoutLayersUnder(): number {
    return this._blackoutLayersUnder
  }
}
