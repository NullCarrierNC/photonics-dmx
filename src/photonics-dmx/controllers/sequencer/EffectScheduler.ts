import { applyWaitUntil } from './waitUntil'
import { Effect, EffectTransition, RGBIO, TrackedLight } from '../../types'
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
  fireCompletionCallback(name: string, cancelled?: boolean): void
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
        // A colour with no pan/tilt of its own is left as-is: the publisher already parks any
        // undriven axis at the fixture's configured home, so a colour-only transition on a layer
        // above a position or motion layer does not need to (and must not) carry a pan/tilt value
        // that would win the blend and drag the head to home for the transition's duration.
        const color = firstTransition.transform.color

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
          if (firstTransition.waitUntilCondition === 'none') {
            // Intentionally left as 'waitingUntil' — handleWaitingUntil will advance on the
            // next updateTransitions call, after the current frame's blend pass has run.
          } else {
            applyWaitUntil(lightEffect, firstTransition, currentTime)
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
   * run identifier when the effect is persistent. An entry already waiting on a slot starts first,
   * so this call queues behind it or evicts it as it does a running effect. A queued entry this
   * call drops never runs, so its waiter is told once the name is neither running nor queued
   * anywhere.
   */
  public applyEffectTransitions(
    name: string,
    effect: Effect,
    transitionsByLayerAndLight: Map<number, Map<string, EffectTransition[]>>,
    isPersistent: boolean,
    effectRunId?: string,
  ): void {
    const displaced = new Set<string>()
    transitionsByLayerAndLight.forEach((layerMap, layer) => {
      layerMap.forEach((transitionsForLight, lightId) => {
        const targetLight = transitionsForLight[0].lights.find((l) => l.id === lightId)
        if (!targetLight) {
          log.warn(
            `No tracked light found for ${lightId} on layer ${layer} when applying effect ${name}`,
          )
          return
        }

        // Slots sit empty with an entry still waiting only between finalizeCompletedEffects'
        // removal and successor passes. The start can also tell a waiter as it discards a malformed
        // entry, and that waiter can claim the slot, so read the slot after it either way.
        let activeEffect = this.layerManager.getActiveEffect(layer, lightId)
        if (!activeEffect) {
          this.startNextEffectInQueue(layer, lightId)
          activeEffect = this.layerManager.getActiveEffect(layer, lightId)
        }

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
            // Cancel and drop any queued successor before evicting the active effect: the
            // incoming effect claims this slot outright, ahead of the queued same-name run that
            // removeEffectForLight's successor pass starts when a slot empties.
            const queued = this.layerManager.getQueuedEffect(layer, lightId)
            if (queued) {
              displaced.add(queued.name)
              if (queued.effectRunId) {
                this.persistentRuns.cancel(queued.effectRunId)
              }
            }
            this.layerManager.removeQueuedEffect(layer, lightId)
            this.removeEffectForLight(layer, lightId, false, displaced)
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

    this.fireForUnscheduled(displaced)
  }

  /**
   * The 'replace' apply path: for each (layer, light) slot the effect targets, cancels the active
   * and queued effect on that slot and starts the new transitions immediately, easing from the
   * light's current state. A displaced active or queued effect under a different name never
   * reaches `onLightEffectComplete`, so its waiter is told here instead, once per name and only
   * once the name is neither running nor queued anywhere.
   */
  public replaceEffectTransitions(
    name: string,
    effect: Effect,
    transitionsByLayerAndLight: Map<number, Map<string, EffectTransition[]>>,
    isPersistent: boolean,
    effectRunId?: string,
  ): void {
    const evicted = new Set<string>()
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
          if (activeEffect.name !== name) {
            evicted.add(activeEffect.name)
          }
          this.layerManager.removeActiveEffect(layer, lightId)
        }
        const queued = this.layerManager.getQueuedEffect(layer, lightId)
        if (queued) {
          if (queued.effectRunId) {
            this.persistentRuns.cancel(queued.effectRunId)
          }
          if (queued.name !== name) {
            evicted.add(queued.name)
          }
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

    this.fireForUnscheduled(evicted)
  }

  /**
   * Removes every effect on a layer, whatever its name, for callers that own the whole layer.
   * @param layer The layer to clear
   * @param shouldRemoveTransitions Whether to remove transition (colour) data too
   */
  public removeEffectByLayer(layer: number, shouldRemoveTransitions: boolean): void {
    const activeEffects = this.layerManager.getActiveEffects().get(layer)
    if (!activeEffects) return
    // Snapshotted, because the removal below starts queued successors back into this same map.
    this.removeEffectsForLights(layer, Array.from(activeEffects.keys()), shouldRemoveTransitions)
  }

  /**
   * Removes one named effect from a layer, on every light it runs on, and leaves the layer's other
   * effects running. Queued entries under the name on the layer go first, so the removal cannot
   * start one of them in a slot it has just freed.
   * @param name The name of the effect to remove
   * @param layer The layer from which to remove it
   * @param shouldRemoveTransitions Whether to remove transition (colour) data too
   */
  public removeEffectByName(name: string, layer: number, shouldRemoveTransitions: boolean): void {
    const queued = this.layerManager.getEffectQueue().get(layer)
    for (const [lightId, entry] of Array.from(queued ?? [])) {
      if (entry.name !== name) continue
      this.persistentRuns.cancel(entry.effectRunId)
      this.layerManager.removeQueuedEffect(layer, lightId)
    }

    const activeEffects = this.layerManager.getActiveEffects().get(layer)
    if (!activeEffects) return
    // Snapshotted, because the removal below starts queued successors back into this same map.
    const lightIds = Array.from(activeEffects)
      .filter(([, effectState]) => effectState.name === name)
      .map(([lightId]) => lightId)
    if (lightIds.length > 0) {
      this.removeEffectsForLights(layer, lightIds, shouldRemoveTransitions)
    }
  }

  /**
   * Displaces the active effect on one light, leaving the rest of the layer running.
   *
   * What a submission needs when it takes a slot from a different effect: clearing the whole layer
   * there would evict lights the same submission had already started, and fire their completion
   * callbacks as cancelled while their transitions were still in flight.
   *
   * @param evictedInto Collects the evicted names for the caller to settle once it has installed
   *   its own effect, instead of telling their waiters here. A waiter can submit an effect onto the
   *   slot as it hears, so a caller midway through claiming that slot passes this and calls
   *   {@link fireForUnscheduled} afterwards.
   */
  public removeEffectForLight(
    layer: number,
    lightId: string,
    shouldRemoveTransitions: boolean,
    evictedInto?: Set<string>,
  ): void {
    this.removeEffectsForLights(layer, [lightId], shouldRemoveTransitions, evictedInto)
  }

  private removeEffectsForLights(
    layer: number,
    lightIds: string[],
    shouldRemoveTransitions: boolean,
    evictedInto?: Set<string>,
  ): void {
    const activeEffects = this.layerManager.getActiveEffects().get(layer)
    if (!activeEffects) return

    const lightsToCleanup: string[] = []
    const evicted = evictedInto ?? new Set<string>()

    // Process each light's effect on this layer
    for (const lightId of lightIds) {
      const effectState = activeEffects.get(lightId)
      if (effectState) {
        evicted.add(effectState.name)
      }
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

    // An evicted effect never reaches onLightEffectComplete, so tell its waiter the run ended here.
    // A queued run of the same name taking the slot means the effect is still going, so skip those.
    if (!evictedInto) {
      this.fireForUnscheduled(evicted)
    }
  }

  /**
   * Drops every queued entry held under this name and cancels the runs they belong to, so a name
   * being submitted again has nothing left waiting from an earlier submission.
   *
   * Waiters are left alone: they are held per name, and the submission doing this is about to
   * schedule that name again, so they resolve on its run.
   */
  public dropQueuedByName(name: string): void {
    const slots: Array<[number, string]> = []
    // Snapshotted, because removing the last entry on a layer drops the layer from this same map.
    for (const [layer, layerMap] of this.layerManager.getEffectQueue()) {
      for (const [lightId, entry] of layerMap) {
        if (entry.name === name) {
          slots.push([layer, lightId])
        }
      }
    }

    for (const [layer, lightId] of slots) {
      const entry = this.layerManager.getQueuedEffect(layer, lightId)
      if (entry?.name !== name) continue
      this.persistentRuns.cancel(entry.effectRunId)
      this.layerManager.removeQueuedEffect(layer, lightId)
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
    // emptied for a start that then doesn't happen. The transitions are this light's own on this
    // layer, grouped as a submission groups them, since the effect's other transitions on the layer
    // can target other lights, each owning its own queue slot.
    const transitions =
      this.effectTransformer
        .groupTransitionsByLayerAndLight(nextEffect.effect.transitions)
        .get(layer)
        ?.get(lightId) ?? []
    const targetLight = transitions[0]?.lights.find((l) => l.id === lightId)

    if (!targetLight) {
      // Nothing startable in this entry. Drop it anyway so a malformed one can't wedge the slot.
      this.persistentRuns.cancel(nextEffect.effectRunId)
      this.layerManager.removeQueuedEffect(layer, lightId)
      log.warn(
        `Discarding queued effect ${nextEffect.name} for light ${lightId} on layer ${layer}: no transitions target it`,
      )
      this.fireForUnscheduled([nextEffect.name])
      return false
    }

    this.layerManager.removeQueuedEffect(layer, lightId)

    // Scoped to the light this entry was queued for, so the other lights' state on this layer is
    // left to their own queue slots.
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
    // Fire the completion callback once no light is running or queued under the name. That covers
    // this light too: an earlier callback in the same pass can have resubmitted the name onto it,
    // and the fresh callback belongs to the fresh effect. A queued run of the same name starts
    // after this call, so it still owes its own waiter a completion.
    if (!this.isEffectScheduledAnywhere(effectState.name)) {
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

  /** Whether an effect of this name is active or queued for any light on any layer. */
  private isEffectScheduledAnywhere(name: string): boolean {
    const holdsName = (layers: Map<number, Map<string, { name: string }>>): boolean =>
      Array.from(layers.values()).some((layerMap) =>
        Array.from(layerMap.values()).some((entry) => entry.name === name),
      )
    return (
      holdsName(this.layerManager.getActiveEffects()) ||
      holdsName(this.layerManager.getEffectQueue())
    )
  }

  /** Tells the waiter of each name no longer running or queued that its run was cancelled. */
  private fireForUnscheduled(names: Iterable<string>): void {
    for (const name of names) {
      if (!this.isEffectScheduledAnywhere(name)) {
        this.deps.fireCompletionCallback(name, true)
      }
    }
  }
}
