import { applyWaitUntil } from './waitUntil'
import { performance } from 'perf_hooks'
import { EffectTransition, RGBIO } from '../../types'
import { LightTransitionController } from './LightTransitionController'
import { isPositionOnly } from './lightBlending'
import { FrameContext, LightEffectState, ILayerManager, ITransitionEngine } from './interfaces'
import { IEffectManager } from './interfaces'
import { createLogger } from '../../../shared/logger'
const log = createLogger('TransitionEngine')

/**
 * @class TransitionEngine
 * @description Handles moving effect transitions through their states.
 *
 */
export class TransitionEngine implements ITransitionEngine {
  private lightTransitionController: LightTransitionController
  private layerManager: ILayerManager
  private effectManager!: IEffectManager

  /**
   * When an effect on layer > 0 finishes with no successor, removal of its LTC layer
   * state is deferred to the next frame so a cue-called / beat that runs later in the
   * same tick can start a new effect without a one-frame black gap.
   */
  private _pendingLayerRemovals: Array<{
    layer: number
    lightId: string
    /** When true, wait one updateTransitions pass so LTC can composite a terminal snap. */
    deferOneFrame?: boolean
  }> = []

  /**
   * When true, next updateTransitions clears pan/tilt from layer state so fixtures return to
   * configured home via DmxPublisher. Deferred one frame like _pendingLayerRemovals.
   */
  private _pendingPanTiltClear = false

  /**
   * @constructor
   * @param lightTransitionController The underlying transition controller
   * @param layerManager The layer manager instance
   */
  constructor(lightTransitionController: LightTransitionController, layerManager: ILayerManager) {
    this.lightTransitionController = lightTransitionController
    this.layerManager = layerManager
  }

  /**
   * Gets the current time using performance.now() for absolute time
   * @returns The current time in milliseconds
   */
  private getCurrentTime(): number {
    return performance.now()
  }

  public advanceFrame(frame: FrameContext): void {
    this.updateTransitions(frame)
  }

  /**
   * Set the effect manager reference
   * This needs to be set after construction to avoid circular dependencies
   * @param effectManager The effect manager instance
   */
  public setEffectManager(effectManager: IEffectManager): void {
    this.effectManager = effectManager
  }

  /** Applies a transition's `waitUntil` clause, preparing the next transition if it advances. */
  private holdUntil(
    activeEffect: LightEffectState,
    transition: EffectTransition,
    currentTime: number,
  ): void {
    applyWaitUntil(activeEffect, transition, currentTime, (effect, next, time) =>
      this.prepareTransition(effect, next, time),
    )
  }

  /**
   * Helper method to ensure a LightEffectState has a lastEndState
   * @param effect The effect to ensure has lastEndState
   */
  private ensureLastEndState(effect: LightEffectState): void {
    if (!effect.lastEndState) {
      // Get the current state for this light on this layer
      const currentState = this.lightTransitionController.getLightState(
        effect.lightId,
        effect.layer,
      )
      if (currentState) {
        effect.lastEndState = { ...currentState }
      } else {
        // Default black state if no current state exists
        effect.lastEndState = {
          red: 0,
          green: 0,
          blue: 0,
          intensity: 0,
          opacity: 1.0,
          blendMode: 'replace',
        }
      }
    }
  }

  /**
   * Gets the underlying light transition controller
   * @returns The light transition controller
   */
  public getLightTransitionController(): LightTransitionController {
    return this.lightTransitionController
  }

  public schedulePanTiltClear(): void {
    this._pendingPanTiltClear = true
  }

  public cancelPanTiltClear(): void {
    this._pendingPanTiltClear = false
  }

  /**
   * Updates all active transitions using a single timestamp for atomic calculations.
   * This method is called by the Clock system to advance transitions incrementally.
   *
   * @param deltaTime The time elapsed since last update in milliseconds (unused)
   */
  public updateTransitions(frame?: FrameContext): void {
    const currentTime = frame?.frameStartTime ?? this.getCurrentTime()

    const stillDeferred: typeof this._pendingLayerRemovals = []
    for (const { layer, lightId, deferOneFrame } of this._pendingLayerRemovals) {
      if (deferOneFrame) {
        stillDeferred.push({ layer, lightId, deferOneFrame: false })
        continue
      }
      const hasNewEffect = this.layerManager.getActiveEffect(layer, lightId) !== undefined
      const hasQueuedEffect = this.layerManager.getQueuedEffect(layer, lightId) !== undefined
      // A finished move leaves its aim on the layer, so the head holds it and the next move eases
      // from it. Stopping motion clears the aim through the pan/tilt clear.
      const holdsAim = isPositionOnly(this.lightTransitionController.getLightState(lightId, layer))
      if (!hasNewEffect && !hasQueuedEffect && !holdsAim) {
        this.lightTransitionController.removeLightLayer(lightId, layer)
      }
    }
    this._pendingLayerRemovals = stillDeferred

    if (this._pendingPanTiltClear) {
      this.lightTransitionController.clearPanTilt()
      this._pendingPanTiltClear = false
    }

    const effectsToRemove: Array<{ layer: number; lightId: string }> = []

    // Process ALL light effects using the SAME currentTime
    this.layerManager.getActiveEffects().forEach((layerMap, layer) => {
      this.layerManager.setLayerLastUsed(layer, currentTime)

      layerMap.forEach((lightEffect, lightId) => {
        if (lightEffect.currentTransitionIndex >= lightEffect.transitions.length) {
          effectsToRemove.push({ layer, lightId })
          return
        }

        const currentTransition = lightEffect.transitions[lightEffect.currentTransitionIndex]

        // Process state machine - all use the same currentTime
        switch (lightEffect.state) {
          case 'idle':
            this.prepareTransition(lightEffect, currentTransition, currentTime)
            break
          case 'waitingFor':
            this.handleWaitingFor(lightEffect, currentTransition, currentTime)
            break
          case 'transitioning':
            this.handleTransitioning(lightEffect, currentTransition, currentTime)
            break
          case 'waitingUntil':
            this.handleWaitingUntil(lightEffect, currentTransition, currentTime)
            break
          default:
            log.warn(`Unknown state "${lightEffect.state}" for effect "${lightEffect.effect.id}".`)
        }
      })
    })

    this.finalizeCompletedEffects(effectsToRemove)

    // Clean up unused layers
    this.layerManager.cleanupUnusedLayers(currentTime)
  }

  /**
   * Removes each given effect from the active map, fires its completion callback, and starts
   * any queued successor. A slot left empty on a layer above 0 defers its layer state removal
   * through {@link _pendingLayerRemovals}.
   *
   * Removal runs as its own pass over the whole batch before any callback fires. A completion
   * callback can re-enter the graph and submit again, and every name in the batch is free by
   * then, so a submission naming a sibling of the effect that triggered it is accepted.
   *
   * @param effectsToRemove The (layer, light) pairs whose effect has finished
   */
  private finalizeCompletedEffects(
    effectsToRemove: Array<{ layer: number; lightId: string }>,
    options?: { deferLayerRemovalOneFrame?: boolean },
  ): void {
    const finished: Array<{
      layer: number
      lightId: string
      effect: LightEffectState
    }> = []
    for (const { layer, lightId } of effectsToRemove) {
      const justFinishedEffect = this.layerManager.getActiveEffect(layer, lightId)
      if (!justFinishedEffect) continue
      this.layerManager.removeActiveEffect(layer, lightId)
      finished.push({ layer, lightId, effect: justFinishedEffect })
    }

    for (const { layer, lightId, effect: justFinishedEffect } of finished) {
      if (this.effectManager && typeof this.effectManager.onLightEffectComplete === 'function') {
        this.effectManager.onLightEffectComplete(justFinishedEffect)
      }

      // After callback, check if a new effect was started for this light
      // (callbacks can synchronously add new effects via addEffect)
      const newEffectStarted = this.layerManager.getActiveEffect(layer, lightId) !== undefined

      let startedQueuedEffect = false
      if (!newEffectStarted && this.effectManager) {
        startedQueuedEffect = this.effectManager.startNextEffectInQueue(layer, lightId)
      } else if (!newEffectStarted) {
        const nextQueuedEffect = this.layerManager.getQueuedEffect(layer, lightId)
        if (nextQueuedEffect) {
          log.warn(
            `Cannot start next queued effect for layer ${layer}, light ${lightId} - no effect manager set`,
          )
          this.layerManager.removeQueuedEffect(layer, lightId)
          startedQueuedEffect = true
        }
      }

      if (!startedQueuedEffect && !newEffectStarted) {
        if (layer > 0) {
          this.queuePendingLayerRemoval(layer, lightId, options?.deferLayerRemovalOneFrame === true)
        }
      }
    }
  }

  /**
   * Queues a layer's state for removal next pass, merging with any pending entry for the same
   * (layer, lightId) slot rather than adding a second one. A deferred entry wins the merge, so a
   * slot already waiting one frame for a blend is never removed early by a plain entry landing
   * afterward.
   */
  private queuePendingLayerRemoval(layer: number, lightId: string, deferOneFrame: boolean): void {
    const existing = this._pendingLayerRemovals.find(
      (entry) => entry.layer === layer && entry.lightId === lightId,
    )
    if (existing) {
      existing.deferOneFrame = existing.deferOneFrame || deferOneFrame
      return
    }
    this._pendingLayerRemovals.push({ layer, lightId, deferOneFrame })
  }

  /**
   * Removes and completes every active effect that has advanced past its last transition,
   * including one whose terminal colour already blended in an earlier frame's pass and is only
   * being reaped now. Either way, a layer left empty on a non-base layer waits one more
   * updateTransitions pass before its state is cleared, so the terminal colour still composites
   * for one frame the way an effect finishing inside `updateTransitions` itself would.
   *
   * A song event releases an effect parked on `waitUntilCondition` by advancing it past its
   * last transition, and a cue reacting to that same event raises the effect again in the
   * same synchronous pass. Running on release keeps the name free for that submission.
   */
  public reapCompletedEffects(): void {
    const effectsToRemove: Array<{ layer: number; lightId: string }> = []

    // Collect before mutating: completion callbacks can synchronously add new effects.
    this.layerManager.getActiveEffects().forEach((layerMap, layer) => {
      layerMap.forEach((lightEffect, lightId) => {
        if (lightEffect.currentTransitionIndex >= lightEffect.transitions.length) {
          effectsToRemove.push({ layer, lightId })
        }
      })
    })

    if (effectsToRemove.length === 0) return

    this.finalizeCompletedEffects(effectsToRemove, {
      deferLayerRemovalOneFrame: true,
    })
  }

  /**
   * Prepares the transition by setting it to the 'waitingFor' state.
   * If no wait is needed, the transition starts immediately.
   *
   * @param activeEffect The active effect record
   * @param transition The current transition to prepare
   * @param currentTime The current timestamp (shared across all calculations)
   */
  public prepareTransition(
    activeEffect: LightEffectState,
    transition: EffectTransition,
    currentTime: number,
  ): void {
    activeEffect.state = 'waitingFor'
    if (transition.waitForCondition === 'none') {
      this.startTransition(activeEffect, transition, currentTime)
    } else {
      activeEffect.transitionStartTime = currentTime
      if (transition.waitForCondition === 'delay') {
        activeEffect.waitEndTime = currentTime + transition.waitForTime
      } else {
        activeEffect.waitEndTime = currentTime
      }
    }
  }

  /**
   * Checks if the transition can start now if we're waiting on a delay or immediate start.
   *
   * @param activeEffect The active effect record
   * @param transition The current transition being waited on
   * @param currentTime The current timestamp (shared across all calculations)
   */
  public handleWaitingFor(
    activeEffect: LightEffectState,
    transition: EffectTransition,
    currentTime: number,
  ): void {
    if (transition.waitForCondition === 'delay') {
      if (currentTime >= activeEffect.waitEndTime) {
        this.startTransition(activeEffect, transition, currentTime)
      }
    } else if (transition.waitForCondition === 'none') {
      this.startTransition(activeEffect, transition, currentTime)
    }
  }

  /**
   * Starts a transition and configures the LightTransitionController
   *
   * @param activeEffect The active effect record
   * @param transition The current transition to execute
   * @param currentTime The current timestamp (shared across all calculations)
   */
  public startTransition(
    activeEffect: LightEffectState,
    transition: EffectTransition,
    currentTime: number,
  ): void {
    this.ensureLastEndState(activeEffect)

    // Since this is a per-light effect, we work with the single light in the transition
    const light = transition.lights[0]

    // First check if there's a saved state in the effect's lastEndState
    let startState: RGBIO | undefined = undefined

    if (activeEffect.lastEndState) {
      // Use the effect's stored state if available - this is crucial for smooth transitions
      startState = activeEffect.lastEndState
    }

    // If still no state, check the current light state in the controller
    if (!startState) {
      startState = this.lightTransitionController.getLightState(light.id, transition.layer)
    }

    // If all else fails, use a transparent state so new effects fade in cleanly
    if (!startState) {
      startState = {
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 0,
        blendMode: 'replace',
      }
    }

    // A colour with no pan/tilt of its own is left as-is: the publisher already parks any undriven
    // axis at the fixture's configured home, so a colour-only transition on a layer above a
    // position or motion layer does not need to (and must not) carry a pan/tilt value that would
    // win the blend and drag the head to home for the transition's duration.
    const color = transition.transform.color

    this.lightTransitionController.setTransition(
      light.id,
      transition.layer,
      startState,
      color,
      transition.transform.duration,
      transition.transform.easing,
    )

    if (transition.transform.duration > 0) {
      activeEffect.state = 'transitioning'
      activeEffect.transitionStartTime = currentTime
      activeEffect.waitEndTime = currentTime + transition.transform.duration
    } else {
      // Duration is 0 — snap to end colour immediately but defer completion to the next
      // frame so the LTC has a chance to blend this layer before it is torn down.
      activeEffect.lastEndState = color
      activeEffect.state = 'waitingUntil'
      if (transition.waitUntilCondition === 'none') {
        // Intentionally left as 'waitingUntil' — handleWaitingUntil will advance on the
        // next updateTransitions call, after the current frame's blend pass has run.
      } else {
        this.holdUntil(activeEffect, transition, currentTime)
      }
    }
  }

  /**
   * Handles the transitioning state and wait conditions. Checks if the transition is done.
   *
   * @param activeEffect The active effect record
   * @param transition The current transition being processed
   * @param currentTime The current timestamp (shared across all calculations)
   */
  public handleTransitioning(
    activeEffect: LightEffectState,
    transition: EffectTransition,
    currentTime: number,
  ): void {
    this.ensureLastEndState(activeEffect)

    if (currentTime >= activeEffect.waitEndTime) {
      // Since this is a per-light effect, we just update the lastEndState directly
      activeEffect.lastEndState = transition.transform.color
      activeEffect.state = 'waitingUntil'
      if (transition.waitUntilCondition === 'none') {
        activeEffect.currentTransitionIndex += 1
        activeEffect.state = 'idle'
      } else {
        this.holdUntil(activeEffect, transition, currentTime)
      }
    }
  }

  /**
   * Handles the 'waitingUntil' state, checking if we can move to next transition.
   *
   * @param activeEffect The active effect record
   * @param transition The current transition being processed
   * @param currentTime The current timestamp (shared across all calculations)
   */
  public handleWaitingUntil(
    activeEffect: LightEffectState,
    transition: EffectTransition,
    currentTime: number,
  ): void {
    if (transition.waitUntilCondition === 'delay') {
      if (currentTime >= activeEffect.waitEndTime) {
        activeEffect.currentTransitionIndex += 1
        activeEffect.state = 'idle'
      }
    } else if (
      transition.waitUntilCondition === 'none' ||
      transition.waitUntilConditionCount === 0
    ) {
      activeEffect.currentTransitionIndex += 1
      activeEffect.state = 'idle'
    }
  }
}
