import { Effect, EffectTransition, normalizeFixtureConfig, RGBIO, TrackedLight } from '../../types'
import { IEffectTransformer, ILayerManager, LightEffectState } from './interfaces'
import { LightTransitionController } from './LightTransitionController'
import { PersistentEffectRun, PersistentRunRegistry } from './PersistentRunRegistry'
import { createLogger } from '../../../shared/logger'

const log = createLogger('EffectScheduler')

/** What the scheduler needs from EffectManager to run and retire effects. */
export interface EffectSchedulerDeps {
  layerManager: ILayerManager
  effectTransformer: IEffectTransformer
  lightTransitionController: LightTransitionController
  persistentRuns: PersistentRunRegistry
  /** Fire the completion callback held for this effect, once its last light finishes. */
  fireCompletionCallback(name: string): void
}

/**
 * Runs effects once they have been accepted for submission: starting a light's transitions,
 * queueing behind or replacing an active effect, advancing a layer's queue when one retires, and
 * restarting a persistent run after every light it targets reports completion.
 *
 * EffectManager owns whether a submission is accepted (validation, blackout, duplicate names) and
 * the effect-level state around it; this owns what happens to lights and layers afterwards.
 */
export class EffectScheduler {
  constructor(private readonly deps: EffectSchedulerDeps) {}

  private get layerManager(): ILayerManager {
    return this.deps.layerManager
  }

  private get effectTransformer(): IEffectTransformer {
    return this.deps.effectTransformer
  }

  private get lightTransitionController(): LightTransitionController {
    return this.deps.lightTransitionController
  }

  private get persistentRuns(): PersistentRunRegistry {
    return this.deps.persistentRuns
  }

  // Reusable default state template
  private defaultStateTemplate: RGBIO = {
    red: 0,
    green: 0,
    blue: 0,
    intensity: 0,
    opacity: 1.0,
    blendMode: 'replace',
  }

  /**
   * Creates a default black state for lights with no previous state.
   * Returns a copy so each light has its own instance.
   * @returns A new RGBIO object with black/default values
   */
  private createDefaultState(): RGBIO {
    return { ...this.defaultStateTemplate }
  }

  /**
   * Starts an effect with optimized batch initialization.
   * Pre-computes initial states and immediately sets up transitions for lights
   * with waitForCondition='none' to ensure simultaneous activation.
   *
   * All lights start using the same timestamp for atomic synchronization.
   *
   * @param name The name of the effect
   * @param effect The effect data
   * @param lights The lights to apply the effect to
   * @param layer The layer to apply the effect on
   * @param transitions The transitions to apply
   * @param isPersistent Whether the effect should persist after completion
   * @param effectRunId Run this start belongs to, required for a persistent effect to loop: the run
   *   only restarts once every light reports completion against its id
   */
  public startEffect(
    name: string,
    effect: Effect,
    lights: TrackedLight[],
    layer: number,
    transitions: EffectTransition[],
    isPersistent = false,
    effectRunId?: string,
  ): void {
    if (isPersistent && !effectRunId) {
      // Every caller registers a run before starting a persistent effect, so this combination means
      // a run id was dropped somewhere and the effect will run once and stop looping silently.
      log.warn(`Persistent effect ${name} started on layer ${layer} without a run id, cannot loop`)
    }

    // Get current time once for all lights - atomic synchronization
    const currentTime = performance.now()

    // Pre-compute initial states for all lights in a single pass
    const initialStates = new Map<string, RGBIO>()

    lights.forEach((light) => {
      // Try to get existing state from layer manager
      let initialState = this.layerManager.getLightState(layer, light.id)

      // Try transition controller if layer manager has no state
      if (!initialState) {
        initialState = this.lightTransitionController.getLightState(light.id, layer)
      }

      // If no state exists, use default (create once per light)
      if (!initialState) {
        initialState = this.createDefaultState()
      }

      initialStates.set(light.id, initialState)
    })

    // Process all lights and prepare their effects
    lights.forEach((light) => {
      // Expand transitions to one-light-per-transition for this specific light
      const lightTransitions = this.effectTransformer
        .expandTransitionsByLight(transitions)
        .filter((t) => t.lights.some((l) => l.id === light.id))

      if (lightTransitions.length === 0) return

      const lightEffect: LightEffectState = {
        name,
        effect,
        transitions: lightTransitions,
        lightId: light.id,
        layer,
        currentTransitionIndex: 0,
        state: 'waitingFor' as const, // Start in 'waitingFor' instead of 'idle'
        transitionStartTime: currentTime,
        waitEndTime: currentTime,
        isPersistent,
        lastEndState: initialStates.get(light.id), // Pre-computed state
        effectRunId,
      }

      // Get the first transition
      const firstTransition = lightTransitions[0]

      if (firstTransition.waitForCondition === 'none') {
        // Prepare the color with pan/tilt defaults if needed
        const color = { ...firstTransition.transform.color }
        if (light.config) {
          const cfg = normalizeFixtureConfig(light.config)
          if (color.pan === undefined) {
            color.pan = cfg.panHome
          }
          if (color.tilt === undefined) {
            color.tilt = cfg.tiltHome
          }
        }

        // Set transition directly on the controller
        this.lightTransitionController.setTransition(
          light.id,
          layer,
          initialStates.get(light.id),
          color,
          firstTransition.transform.duration,
          firstTransition.transform.easing,
        )

        if (firstTransition.transform.duration > 0) {
          // Update effect state to transitioning
          lightEffect.state = 'transitioning'
          lightEffect.transitionStartTime = currentTime
          lightEffect.waitEndTime = currentTime + firstTransition.transform.duration
        } else {
          // Duration is 0 — snap to end colour immediately but defer completion to the next
          // frame so the LTC has a chance to blend this layer before it is torn down.
          lightEffect.lastEndState = color
          lightEffect.state = 'waitingUntil'
          if (firstTransition.waitUntilCondition === 'delay') {
            lightEffect.transitionStartTime = currentTime
            const count = firstTransition.waitUntilConditionCount ?? 1
            const delayMs = count > 0 ? count * firstTransition.waitUntilTime : 0
            lightEffect.waitEndTime = currentTime + delayMs
          } else if (firstTransition.waitUntilCondition === 'none') {
            // Intentionally left as 'waitingUntil' — handleWaitingUntil will advance on the
            // next updateTransitions call, after the current frame's blend pass has run.
          } else {
            lightEffect.transitionStartTime = currentTime
            lightEffect.waitEndTime = currentTime
          }
        }
      } else if (firstTransition.waitForCondition === 'delay') {
        // Set up delay-based waiting
        lightEffect.waitEndTime = currentTime + firstTransition.waitForTime
      }

      // Add the effect to the layer manager
      this.layerManager.addActiveEffect(layer, light.id, lightEffect)
    })
  }

  /**
   * Applies the supplied transitions to their respective layers/lights.
   * Handles replacement vs queue logic and passes through the effect-level
   * run identifier when the effect is persistent.
   */
  public applyEffectTransitions(
    name: string,
    effect: Effect,
    transitionsByLayerAndLight: Map<number, Map<string, EffectTransition[]>>,
    isPersistent: boolean,
    effectRunId?: string,
  ): void {
    transitionsByLayerAndLight.forEach((layerMap, layer) => {
      layerMap.forEach((transitionsForLight, lightId) => {
        const targetLight = transitionsForLight[0].lights.find((l) => l.id === lightId)
        if (!targetLight) {
          log.warn(
            `No tracked light found for ${lightId} on layer ${layer} when applying effect ${name}`,
          )
          return
        }

        const activeEffect = this.layerManager.getActiveEffect(layer, lightId)

        if (activeEffect) {
          if (activeEffect.name === name) {
            this.layerManager.addQueuedEffect(layer, lightId, {
              name,
              effect,
              isPersistent,
              lightId,
              effectRunId,
            })
          } else {
            this.removeEffectByLayer(layer, false)
            this.layerManager.removeQueuedEffect(layer, lightId)
            this.startEffect(
              name,
              effect,
              [targetLight],
              layer,
              transitionsForLight,
              isPersistent,
              effectRunId,
            )
          }
        } else {
          this.startEffect(
            name,
            effect,
            [targetLight],
            layer,
            transitionsForLight,
            isPersistent,
            effectRunId,
          )
        }
      })
    })
  }

  /**
   * The 'replace' apply path: for each (layer, light) slot the effect targets, cancels the active
   * and queued effect on that slot and starts the new transitions immediately, easing from the
   * light's current state.
   */
  public replaceEffectTransitions(
    name: string,
    effect: Effect,
    transitionsByLayerAndLight: Map<number, Map<string, EffectTransition[]>>,
    isPersistent: boolean,
    effectRunId?: string,
  ): void {
    transitionsByLayerAndLight.forEach((layerMap, layer) => {
      layerMap.forEach((transitionsForLight, lightId) => {
        const targetLight = transitionsForLight[0].lights.find((l) => l.id === lightId)
        if (!targetLight) {
          log.warn(
            `No tracked light found for ${lightId} on layer ${layer} when replacing effect ${name}`,
          )
          return
        }

        const activeEffect = this.layerManager.getActiveEffect(layer, lightId)
        if (activeEffect) {
          if (activeEffect.effectRunId) {
            this.persistentRuns.cancel(activeEffect.effectRunId)
          }
          this.layerManager.removeActiveEffect(layer, lightId)
        }
        this.layerManager.removeQueuedEffect(layer, lightId)

        this.startEffect(
          name,
          effect,
          [targetLight],
          layer,
          transitionsForLight,
          isPersistent,
          effectRunId,
        )
      })
    })
  }

  /**
   * Removes an effect from a specific layer.
   *
   * Intentionally layer-wide: it clears the effect for every light on the layer, treating a
   * non-base layer as a single shared effect "slot" rather than per-light state. This matches the
   * current shared-layer effect model, even though `interfaces.ts` types effects per-light;
   * scoping removal to individual lights would require reworking how persistent runs are tracked.
   * @param layer The layer from which to remove the effect
   * @param shouldRemoveTransitions Whether to remove transition (colour) data too
   */
  public removeEffectByLayer(layer: number, shouldRemoveTransitions: boolean): void {
    // Get all active effects for this layer
    const activeEffects = this.layerManager.getActiveEffects().get(layer)
    if (!activeEffects) return

    // Convert to array to avoid modifying the map while iterating
    const lightIds = Array.from(activeEffects.keys())
    const lightsToCleanup: string[] = []

    // Process each light's effect on this layer
    for (const lightId of lightIds) {
      const effectState = activeEffects.get(lightId)
      if (effectState?.effectRunId) {
        this.persistentRuns.cancel(effectState.effectRunId)
      }
      // Remove the effect from active effects
      this.layerManager.removeActiveEffect(layer, lightId)

      // Start the next effect in queue for this light on this layer if one exists
      const hasNextEffect = this.startNextEffectInQueue(layer, lightId)
      //  console.log(`Removing effect from layer ${layer}, light ${lightId}. Has next effect: ${hasNextEffect}`);

      // If we're removing the effect and there's no next effect in the queue,
      // also reset layer tracking to prevent cleanup after grace period
      if (!hasNextEffect) {
        this.layerManager.resetLayerTracking(layer)
      }

      // Clean up transitions ONLY if requested AND there's no next effect.
      // Layer 0 is the base layer: do not remove its state so the last running cue's light state persists.
      if (shouldRemoveTransitions && !hasNextEffect && layer > 0) {
        lightsToCleanup.push(lightId)
      }
    }

    // Batch cleanup all lights that need transition removal
    if (lightsToCleanup.length > 0) {
      for (const lightId of lightsToCleanup) {
        this.lightTransitionController.removeLightLayer(lightId, layer)
      }
    }
  }

  /**
   * Starts the next effect in the queue for a specific layer and light
   * @param layer The layer to start the next effect on
   * @param lightId The light ID to start the next effect on
   */
  public startNextEffectInQueue(layer: number, lightId: string): boolean {
    const nextEffect = this.layerManager.getQueuedEffect(layer, lightId)
    if (!nextEffect) return false

    // Resolve everything the start depends on before consuming the entry, so a queue slot is never
    // emptied for a start that then doesn't happen.
    const transitions = nextEffect.effect.transitions.filter((t) => t.layer === layer)
    const targetLight = transitions[0]?.lights.find((l) => l.id === lightId)

    if (transitions.length === 0 || !targetLight) {
      // Nothing startable in this entry. Drop it anyway so a malformed one can't wedge the slot.
      this.layerManager.removeQueuedEffect(layer, lightId)
      log.warn(
        `Discarding queued effect ${nextEffect.name} for light ${lightId} on layer ${layer}: no transitions target it`,
      )
      return false
    }

    this.layerManager.removeQueuedEffect(layer, lightId)

    // Scoped to the light this entry was queued for. The transition's `lights` array covers every
    // light the effect targets, so starting across it would overwrite the other lights' state on
    // this layer, each of which owns its own queue slot.
    // The entry's own run id, not a fresh one. This light is already counted in that run's light
    // total, so it needs to report its completion against the same run for the run to finish and
    // restart. Minting a new id here would split one logical run in two, and the original could
    // never reach zero remaining lights. A run cancelled while the entry sat in the queue is simply
    // not found on completion, which correctly stops the loop.
    this.startEffect(
      nextEffect.name,
      nextEffect.effect,
      [targetLight],
      layer,
      transitions,
      nextEffect.isPersistent,
      nextEffect.effectRunId,
    )

    return true
  }

  /**
   * Called when a light finishes its active effect so effect-level persistence
   * can determine whether the overall run should restart.
   * Also fires completion callbacks if all lights in an effect have completed.
   */
  public onLightEffectComplete(effectState: LightEffectState): void {
    // Fire the completion callback for this effect (if no other lights are still running it)
    if (!this.isEffectRunningOnAnotherLight(effectState.name, effectState.lightId)) {
      // This was the last light for this effect - fire the callback
      this.deps.fireCompletionCallback(effectState.name)
    }

    // Handle persistence
    if (!effectState.effectRunId) {
      return
    }

    const run = this.persistentRuns.get(effectState.effectRunId)
    if (!run) {
      return
    }

    run.remainingLights = Math.max(0, run.remainingLights - 1)
    if (run.remainingLights === 0) {
      this.restartPersistentRun(run)
    }
  }

  /**
   * Restarts the supplied persistent run by re-applying its original
   * transitions while preserving the shared run identifier.
   */
  private restartPersistentRun(run: PersistentEffectRun): void {
    if (!this.persistentRuns.has(run.id)) {
      return
    }
    run.remainingLights = run.totalLights
    this.applyEffectTransitions(run.name, run.effect, run.transitionsByLayerAndLight, true, run.id)
  }

  /** Whether an effect of this name is active for any light other than the given one. */
  private isEffectRunningOnAnotherLight(name: string, lightId: string): boolean {
    return Array.from(this.layerManager.getActiveEffects().values()).some((layerMap) =>
      Array.from(layerMap.values()).some(
        (activeEffect) => activeEffect.name === name && activeEffect.lightId !== lightId,
      ),
    )
  }
}
