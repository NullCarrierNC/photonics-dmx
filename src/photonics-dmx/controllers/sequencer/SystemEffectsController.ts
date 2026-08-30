import { RGBIO, Transition } from '../../types'
import { LightTransitionController } from './LightTransitionController'
import { ILayerManager, ISystemEffectsController } from './interfaces'
import { createLogger } from '../../../shared/logger'
const log = createLogger('SystemEffectsController')

/**
 * @class SystemEffectsController
 * @description Handles system-level effects like blackout .
 */
export class SystemEffectsController implements ISystemEffectsController {
  private lightTransitionController: LightTransitionController
  private layerManager: ILayerManager
  private isBlackingOut: boolean = false
  private _blackoutLayersUnder: number = 255
  /** Per-light fade timers of the in-flight blackout; cleared on cancel/dispose. */
  private pendingTimers: Set<NodeJS.Timeout> = new Set()
  /** Resolvers paired with {@link pendingTimers}, settled early on cancel so `blackout()` returns. */
  private pendingResolvers: Set<() => void> = new Set()
  /** Bumped at each blackout start; a continuation whose generation is stale must not touch state. */
  private generation = 0

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
   * As it's on layer 255 with a high priority, it will override all other effects below,
   * including strobe effects on layer 200.
   *
   * @param duration The duration of the blackout fade in milliseconds.
   * @returns A promise that resolves when the blackout is complete.
   */
  public async blackout(duration: number): Promise<void> {
    if (this.isBlackingOut) {
      log.warn(`Blackout is already in progress. Ignoring the new blackout request.`)
      return
    }

    if (duration === 0) {
      // Clear all active effects and queues for all layers
      const allLayers = this.layerManager.getAllLayers()
      for (const layer of allLayers) {
        this.layerManager.removeActiveEffect(layer, 'all')
        this.layerManager.removeQueuedEffect(layer, 'all')
      }
      this.lightTransitionController.immediateBlackout()

      // Trigger the immediate blackout callback if registered
      if (this.onBlackoutCompleteCallback) {
        this.onBlackoutCompleteCallback()
      }

      return
    }

    this.isBlackingOut = true
    const generation = ++this.generation

    log.info(`Initiating blackout for ${duration}ms.`)

    try {
      const allLightIds = this.lightTransitionController.getAllLightIds()
      if (allLightIds.length > 0) {
        // Use maximum layer to override everything (including strobe on layer 200)
        const blackoutLayer = 255

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
              layer: blackoutLayer,
            }

            this.lightTransitionController.setTransition(
              lightId,
              blackoutLayer,
              this.lightTransitionController.getLightState(lightId, 0),
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

        // Clear all effects and force black state
        const allLayers = this.layerManager.getAllLayers()
        for (const layer of allLayers) {
          this.layerManager.removeActiveEffect(layer, 'all')
          this.layerManager.removeQueuedEffect(layer, 'all')
        }

        // Force immediate black state for all lights while preserving pan/tilt
        allLightIds.forEach((lightId) => {
          // Get current state to check for existing pan/tilt values
          const currentLightState = this.lightTransitionController.getFinalLightState(lightId)

          // Create a base black state
          const blackState: RGBIO = {
            red: 0,
            green: 0,
            blue: 0,
            intensity: 0,
            opacity: 1.0,
            blendMode: 'replace',
          }

          // Only preserve pan/tilt for fixtures that already have them
          if (currentLightState && currentLightState.pan !== undefined) {
            blackState.pan = currentLightState.pan
          }

          if (currentLightState && currentLightState.tilt !== undefined) {
            blackState.tilt = currentLightState.tilt
          }

          this.lightTransitionController.setTransition(
            lightId,
            0, // Use base layer
            undefined, // No start state needed for immediate effect
            blackState,
            0, // Instant
            'linear',
          )
        })

        // The terminal wipe cleared every layer's effects, so lay a held overlay back down before

        // Trigger the callback after timed blackout completes as well
        if (this.onBlackoutCompleteCallback) {
          this.onBlackoutCompleteCallback()
        }
      }
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
      this.clearPendingBlackout()
      this.lightTransitionController.removeTransitionsByLayer(255)
      // The overlay lives above 255 so the sweep leaves it, but re-assert anyway: a cancel resumes
    }
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
