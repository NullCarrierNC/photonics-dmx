import { Effect, EffectTransition, RGBIO, TrackedLight } from '../../types'
import {
  IEffectManager,
  IEffectTransformer,
  ILayerManager,
  ISystemEffectsController,
  ITransitionEngine,
  LightEffectState,
} from './interfaces'
import { LightTransitionController } from './LightTransitionController'
import { EffectCallbackRegistry } from './EffectCallbackRegistry'
import {
  ADD_EFFECT,
  ADD_EFFECT_UNBLOCKED_NAME,
  REPLACE_EFFECT,
  SET_EFFECT,
  SET_EFFECT_UNBLOCKED_NAME,
  UPDATE_EFFECT,
  UPDATE_EFFECT_WAITING,
  type SubmissionOutcome,
  type SubmissionPolicy,
} from './effectSubmission'
import { PersistentRunRegistry } from './PersistentRunRegistry'
import { EffectScheduler } from './EffectScheduler'
import { carryOverRunning } from './effectCarryOver'
import { createLogger } from '../../../shared/logger'
const log = createLogger('EffectManager')

/**
 * @class EffectManager
 * @description
 * Coordinates the addition, removal, and updating of effects.
 *
 * Responsibilities:
 * - Coordinates the addition, removal, and updating of effects
 * - Routes effects to appropriate layers
 * - Manages effect transitions, queuing, and lifecycle
 * - Coordinates with SystemEffects for blackout handling
 * - Tracks layer-specific effect history
 *
 * Provides six key methods for effects:
 * - addEffect: Adds an effect, replacing existing ones (if on same layer) or queueing
 * - setEffect: Like addEffect but clears all effects on all layers first
 * - replaceEffect: Per-(layer, light) replace; cancels active/queued for the same
 *   targets and starts the new transitions immediately, easing from current state.
 *   Use for state-target effects like non-blocking set-position where the latest
 *   submission must win. replaceEffectWithCallback is the variant for a caller
 *   that parks on completion.
 * - updateEffect: Carries a running effect of the same name over to the new submission where
 *   it can, and replaces it elsewhere, for a caller resubmitting the same effect every frame
 * - addEffectUnblockedName: Discards if effect with same name exists anywhere
 * - setEffectUnblockedName: Like addEffectUnblockedName but cancels existing effects
 */
export class EffectManager implements IEffectManager {
  private layerManager: ILayerManager
  private transitionEngine: ITransitionEngine
  private effectTransformer: IEffectTransformer
  private systemEffects: ISystemEffectsController

  // Cached reference to avoid repeated method calls
  private lightTransitionController: LightTransitionController
  private _lastCalled0LayerEffect: string = '' // Tracks the last effect name that targeted layer 0
  private readonly persistentRuns = new PersistentRunRegistry()
  private readonly effectCallbacks = new EffectCallbackRegistry()
  /** Runs and retires accepted effects across lights, layers and persistent runs. */
  private readonly scheduler: EffectScheduler
  /** Name of the rig this manager drives, appended to the duplicate-name warning. */
  private readonly rigLabel: string

  /**
   * @constructor
   * @param layerManager The layer manager
   * @param transitionEngine The transition engine
   * @param effectTransformer The effect transformer
   * @param systemEffects The system effects controller
   * @param rigLabel Rig name appended to warnings; empty when there is no rig to name
   */
  constructor(
    layerManager: ILayerManager,
    transitionEngine: ITransitionEngine,
    effectTransformer: IEffectTransformer,
    systemEffects: ISystemEffectsController,
    rigLabel = '',
  ) {
    this.rigLabel = rigLabel
    this.layerManager = layerManager
    this.transitionEngine = transitionEngine
    this.effectTransformer = effectTransformer
    this.systemEffects = systemEffects

    // Cache the light transition controller for performance
    this.lightTransitionController = transitionEngine.getLightTransitionController()

    this.scheduler = new EffectScheduler({
      layerManager,
      effectTransformer,
      lightTransitionController: this.lightTransitionController,
      persistentRuns: this.persistentRuns,
      fireCompletionCallback: (name, cancelled) => this.effectCallbacks.fire(name, cancelled),
    })

    // Set this instance on the transition engine to allow it to start queued effects
    this.transitionEngine.setEffectManager(this)

    // Register a callback to reset our state when a blackout completes
    this.systemEffects.setOnBlackoutCompleteCallback(() => {
      // Reset layer 0 effect tracking when a blackout completes
      this._lastCalled0LayerEffect = ''
      // The wipe bypassed the scheduler, so the waiters and runs it left behind are released here.
      // A run counts lights the wipe has taken, so it goes with them.
      this.persistentRuns.clear()
      this.effectCallbacks.cancelAll()
    })
  }

  /**
   * Remove a completion callback for an effect.
   *
   * @param name The name of the effect
   */
  public removeEffectCallback(name: string): void {
    this.effectCallbacks.remove(name)
  }

  /**
   * Warns and reports true when an effect carries nothing to run, so callers can bail out.
   */
  private hasNoTransitions(name: string, effect: Effect): boolean {
    if (effect.transitions.length === 0) {
      log.warn(`Effect "${name}" has no transitions. Ignoring.`)
      return true
    }
    return false
  }

  /** Whether an effect of this name is active on any layer, for any light. */
  private isEffectRunning(name: string): boolean {
    return Array.from(this.layerManager.getActiveEffects().values()).some((layerMap) =>
      Array.from(layerMap.values()).some((activeEffect) => activeEffect.name === name),
    )
  }

  /**
   * Groups an effect's transitions by layer and light, records the name as owning layer 0 when it
   * targets that layer, retires the name's earlier persistent runs, and opens a persistence run
   * when the effect is persistent. Returns what the apply step needs.
   */
  private prepareSubmission(
    name: string,
    effect: Effect,
    isPersistent: boolean,
  ): {
    transitionsByLayerAndLight: Map<number, Map<string, EffectTransition[]>>
    persistentRunId?: string
  } {
    const transitionsByLayerAndLight = this.effectTransformer.groupTransitionsByLayerAndLight(
      effect.transitions,
    )

    if (transitionsByLayerAndLight.has(0)) {
      this._lastCalled0LayerEffect = name
    }

    // The latest accepted submission of a name owns the loop, whether or not it is itself
    // persistent. Only accepted submissions reach here, and a callback raised by the 'set' clearing
    // step runs before this line, so this submission supersedes any the callback made. An effect
    // targeting no lights registers no run and retires none.
    const targetsAnyLight = [...transitionsByLayerAndLight.values()].some(
      (layerMap) => layerMap.size > 0,
    )
    if (targetsAnyLight) {
      this.persistentRuns.cancelByName(name)
      // Entries still queued under the runs just cancelled go with them, including on slots this
      // submission does not cover. Sweeping before the apply leaves the entries this submission is
      // about to queue alone.
      this.scheduler.dropQueuedByName(name)
    }

    const persistentRunId = isPersistent
      ? this.persistentRuns.register(name, effect, transitionsByLayerAndLight)
      : undefined

    return { transitionsByLayerAndLight, persistentRunId }
  }

  /**
   * Adds a new effect without impacting other effects running on different layers.
   * Will replace any effect running on the passed transition(s) layer(s) if a different
   * effect was running. If the same effect is passed again, it will be queued, and an earlier
   * persistent run of that name stops looping once its current pass ends.
   *
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param isPersistent If true, the effect re-queues itself after completing, until a later
   *   submission of the same name is accepted
   */
  public addEffect(name: string, effect: Effect, isPersistent: boolean = false): void {
    this.submitEffect(name, effect, isPersistent, ADD_EFFECT)
  }

  /**
   * Per-(layer, light) replace. For each light targeted by the new effect on each
   * layer it touches, cancels any active and queued effect on that slot (regardless
   * of whether the active name matches) and starts the new transitions immediately.
   *
   * Mid-transition takeover is graceful: `startEffect` seeds each new transition
   * from the light's current state, so the easing continues smoothly from wherever
   * the light is now.
   *
   * Effects on other layers and on lights NOT targeted by the new effect are
   * untouched.
   *
   * Intended for state-target effects (e.g. non-blocking `set-position`) whose
   * resolved configuration changes every trigger and where queueing the new
   * transition behind a stale in-flight one would cause desynchronised motion.
   */
  public replaceEffect(name: string, effect: Effect, isPersistent: boolean = false): void {
    this.submitEffect(name, effect, isPersistent, REPLACE_EFFECT)
  }

  /**
   * {@link replaceEffect} for a caller that parks on a completion callback. Replaced slots are
   * cancelled without firing their callbacks, so the callback held for `name` is fired here with
   * `cancelled = true` before the new one is registered, releasing the displaced waiter once.
   *
   * The displaced waiter hears once the replacement holds its slots, so an effect it submits from
   * inside that call is the latest submission of the name and supersedes the replacement: the
   * replacement plays one pass and the waiter's submission is what loops.
   *
   * @returns True when the effect was applied. A refusal leaves the running effect and its
   * callback untouched and registers nothing.
   */
  public replaceEffectWithCallback(
    name: string,
    effect: Effect,
    onComplete: (cancelled: boolean) => void,
    isPersistent: boolean = false,
  ): boolean {
    const applied = this.submitEffect(name, effect, isPersistent, REPLACE_EFFECT) === 'applied'
    if (applied) {
      this.effectCallbacks.fire(name, true)
      this.effectCallbacks.add(name, onComplete)
    }
    return applied
  }

  /**
   * Resubmits an effect that may still be running. A light running this name carries on where it
   * can: with unchanged steps it runs on as it is, and partway through a first fade of the same
   * length and easing it heads for the new colour on its own clock. Every other light is replaced
   * as {@link replaceEffect} does, easing from its current state.
   */
  public updateEffect(name: string, effect: Effect): void {
    this.submitEffect(name, effect, false, UPDATE_EFFECT)
  }

  /**
   * {@link updateEffect} for a caller that parks on completion, refused while a blackout runs. The
   * waiter held for `name` hears `cancelled = true` before `onComplete` takes its place.
   * @returns True when the effect was applied
   */
  public updateEffectWithCallback(
    name: string,
    effect: Effect,
    onComplete: (cancelled: boolean) => void,
  ): boolean {
    const applied = this.submitEffect(name, effect, false, UPDATE_EFFECT_WAITING) === 'applied'
    if (applied) {
      this.effectCallbacks.fire(name, true)
      this.effectCallbacks.add(name, onComplete)
    }
    return applied
  }

  /**
   * Adds a new effect and clears all other effects that were running.
   * Used for significant changes in scenes. E.g., from Menu to in-game.
   *
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param isPersistent If true, the effect re-queues itself after completing, until a later
   *   submission of the same name is accepted
   */
  public setEffect(name: string, effect: Effect, isPersistent: boolean = false): void {
    this.submitEffect(name, effect, isPersistent, SET_EFFECT)
  }

  /**
   * The single submission pipeline behind every public add/set/replace variant: blackout gate and
   * transition validation in the policy's order, the duplicate-name gate, the 'set' clearing step,
   * then grouping and the policy's apply path.
   */
  private submitEffect(
    name: string,
    effect: Effect,
    isPersistent: boolean,
    policy: SubmissionPolicy,
  ): SubmissionOutcome {
    if (policy.blackoutFirst && !this.passBlackoutGate(name, effect, policy)) {
      return 'refused'
    }
    if (this.hasNoTransitions(name, effect)) {
      return 'refused'
    }
    if (!policy.blackoutFirst && !this.passBlackoutGate(name, effect, policy)) {
      return 'refused'
    }

    if (policy.blockDuplicateName && this.isEffectRunning(name)) {
      // Ordinary flow control rather than a fault. A held cue is called on every forwarded frame,
      // so a chain that outlives one frame is refused around thirty times a second while it runs.
      const rigSuffix = this.rigLabel ? ` [rig: ${this.rigLabel}]` : ''
      log.debug(
        `Not ${policy.verb.progressive} effect "${name}" because an effect with the same name is already running. Preventing timing issues.${rigSuffix}`,
      )
      return 'duplicate-name'
    }

    if (policy.mode === 'set') {
      const grouped = this.effectTransformer.groupTransitionsByLayerAndLight(effect.transitions)
      if (policy.layer0RepeatQueues && grouped.has(0) && this._lastCalled0LayerEffect === name) {
        // A repeated layer-0 set of the same effect retires its previous run and queues the new
        // one, so the scene is not cleared on every re-trigger.
        this.removeEffect(name, 0)
      } else {
        this.removeAllEffects(true)
      }
    }

    const { transitionsByLayerAndLight, persistentRunId } = this.prepareSubmission(
      name,
      effect,
      isPersistent,
    )

    if (policy.mode === 'update') {
      carryOverRunning(name, effect, transitionsByLayerAndLight, {
        layerManager: this.layerManager,
        effectTransformer: this.effectTransformer,
        lightTransitionController: this.lightTransitionController,
      })
    }

    if (policy.mode === 'replace' || policy.mode === 'update') {
      this.scheduler.replaceEffectTransitions(
        name,
        effect,
        transitionsByLayerAndLight,
        isPersistent,
        persistentRunId,
      )
    } else {
      this.scheduler.applyEffectTransitions(
        name,
        effect,
        transitionsByLayerAndLight,
        isPersistent,
        persistentRunId,
      )
    }
    return 'applied'
  }

  /**
   * The blackout gate: with no blackout active the submission passes, otherwise the policy either
   * cancels the blackout and proceeds or refuses the submission.
   * @returns True when the submission may proceed
   */
  private passBlackoutGate(name: string, effect: Effect, policy: SubmissionPolicy): boolean {
    if (!this.systemEffects.isBlackoutActive()) {
      return true
    }
    if (policy.blackoutBaseLayerOnly && !(effect.transitions[0].layer < 255)) {
      return true
    }
    if (policy.blackout === 'refuse') {
      log.warn(
        `Cannot ${policy.verb.imperative} effect "${name}" because a blackout is in progress.`,
      )
      return false
    }
    log.warn(policy.blackoutCancelLog)
    this.systemEffects.cancelBlackout()
    return true
  }

  /**
   * Adds an effect without applying it if an effect with the same name is already running.
   * Behaves like addEffect, except that if an effect of the same name is running, it discards
   * this new instance instead of queuing it. This prevents queue breaking timing issues.
   *
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param isPersistent If true, the effect re-queues itself after completing, until a later
   *   submission of the same name is accepted
   * @returns True if the effect was added, false otherwise
   */
  public addEffectUnblockedName(
    name: string,
    effect: Effect,
    isPersistent: boolean = false,
  ): boolean {
    return this.submitEffect(name, effect, isPersistent, ADD_EFFECT_UNBLOCKED_NAME) === 'applied'
  }

  /** addEffectUnblockedName with a completion callback, as {@link submitWithWaiter} describes. */
  public addEffectUnblockedNameWithCallback(
    name: string,
    effect: Effect,
    onComplete: (cancelled: boolean) => void,
    isPersistent: boolean = false,
  ): boolean {
    return this.submitWithWaiter(name, effect, onComplete, isPersistent, ADD_EFFECT_UNBLOCKED_NAME)
  }

  /** setEffectUnblockedName with a completion callback, as {@link submitWithWaiter} describes. */
  public setEffectUnblockedNameWithCallback(
    name: string,
    effect: Effect,
    onComplete: (cancelled: boolean) => void,
    isPersistent: boolean = false,
  ): boolean {
    return this.submitWithWaiter(name, effect, onComplete, isPersistent, SET_EFFECT_UNBLOCKED_NAME)
  }

  /**
   * Submits and registers `onComplete` for when the name finishes. A submission refused because the
   * name is already running parks the callback on that run. Any other refusal registers nothing.
   * @returns True when `onComplete` will be called later, false when the submission was refused
   */
  private submitWithWaiter(
    name: string,
    effect: Effect,
    onComplete: (cancelled: boolean) => void,
    isPersistent: boolean,
    policy: SubmissionPolicy,
  ): boolean {
    if (this.submitEffect(name, effect, isPersistent, policy) === 'refused') return false
    this.effectCallbacks.add(name, onComplete)
    return true
  }

  /**
   * Sets an effect without applying it if an effect with the same name is already running.
   * Behaves like setEffect, except that if an effect of the same name is running, it discards
   * this new instance instead of replacing it. This prevents queue breaking timing issues.
   *
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param isPersistent If true, the effect re-queues itself after completing, until a later
   *   submission of the same name is accepted
   * @returns True if the effect was set, false otherwise
   */
  public setEffectUnblockedName(
    name: string,
    effect: Effect,
    isPersistent: boolean = false,
  ): boolean {
    return this.submitEffect(name, effect, isPersistent, SET_EFFECT_UNBLOCKED_NAME) === 'applied'
  }

  /**
   * Starts an effect's transitions for the given lights on a layer, seeding each light from its
   * current state.
   * @param effectRunId Run this start belongs to, required for a persistent effect to loop
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
    this.scheduler.startEffect(name, effect, lights, layer, transitions, isPersistent, effectRunId)
  }

  /**
   * Removes an effect from a specific layer, advancing that layer's queue for each light.
   * @param shouldRemoveTransitions Whether to remove transition (colour) data too
   */
  public removeEffectByLayer(layer: number, shouldRemoveTransitions: boolean): void {
    this.scheduler.removeEffectByLayer(layer, shouldRemoveTransitions)
  }

  /** Starts the next queued effect for a layer and light, if one is waiting. */
  public startNextEffectInQueue(layer: number, lightId: string): boolean {
    return this.scheduler.startNextEffectInQueue(layer, lightId)
  }

  /**
   * Called when a light finishes its active effect, so the completion callback fires once the last
   * light is done and a persistent run restarts once every light has reported.
   */
  public onLightEffectComplete(effectState: LightEffectState): void {
    this.scheduler.onLightEffectComplete(effectState)
  }

  /**
   * Removes a named effect from a layer, on every light it runs on. Other effects on the layer keep
   * running, and queued entries under the name are dropped so none starts in the freed slot.
   * @param name The name of the effect to remove
   * @param layer The layer on which the effect is running
   */
  public removeEffect(name: string, layer: number): void {
    this.scheduler.removeEffectByName(name, layer, true)
  }

  /**
   * Removes every effect and clears the queues, as though the sequencer had just started. With
   * `holdLook` the lights keep the previous look until the next frame, for a set that replaces it.
   */
  public removeAllEffects(holdLook = false): void {
    // Cancel any active blackouts first
    if (this.systemEffects.isBlackoutActive()) {
      log.warn('Cancelling blackout for removeAllEffects')
      this.systemEffects.cancelBlackout()
    }

    // Begin the clearing sequence - this sets a lock to prevent race conditions
    // where TransitionEngine might try to re-add effects while we're clearing
    this.lightTransitionController.beginClearingSequence()

    try {
      // 1. Clear all active effects and queues (stops new effects from starting)
      this.layerManager.clearAllActiveEffects()
      this.layerManager.clearAllQueuedEffects()

      // 2. Clear layer tracking (prevents stale state)
      this.layerManager.clearAllLayerTracking()

      // 3. Clear the transitions, publishing black unless the look is held for its replacement
      this.lightTransitionController.clearAllTransitions(holdLook)

      // 4. Reset effect tracking state; cancel (not just drop) pending callbacks so blocking graph
      //    nodes waiting on these effects are told their action ended instead of stranding.
      this._lastCalled0LayerEffect = ''
      this.persistentRuns.clear()
      this.effectCallbacks.cancelAll()
    } finally {
      // Always release the clearing lock, even if an error occurs
      this.lightTransitionController.endClearingSequence()
    }
  }

  /**
   * Sets the state of a group of lights to a specific colour over time.
   * Each light will have its state interpolated from the current state to the passed color value.
   * State tracking happens on layer 0.
   *
   * @param lights Array of lights to update
   * @param color Target colour to transition to
   * @param time Duration of the transition in milliseconds
   */
  public setState(lights: TrackedLight[], color: RGBIO, time: number): void {
    if (lights.length === 0) {
      log.warn('No lights provided to setState')
      return
    }

    if (this.systemEffects.isBlackoutActive()) {
      log.warn('Cancelling blackout to set light states')
      this.systemEffects.cancelBlackout()
    }

    // Create transitions for each light
    const transitions: EffectTransition[] = [
      {
        lights: lights,
        layer: 0,
        waitForCondition: 'none',
        waitForTime: 0,
        transform: {
          color: color,
          easing: 'linear',
          duration: time,
        },
        waitUntilCondition: 'none',
        waitUntilTime: 0,
      },
    ]

    // Create an effect
    const effect: Effect = {
      id: `setState`,
      description: 'Set light state directly',
      transitions: transitions,
    }

    // Named by its lights, so one light's update never drops another light's queued update
    this.addEffect(`setState:${lights.map((light) => light.id).join(',')}`, effect)
  }

  /**
   * Gets all active effects for a specific light across all layers
   * @param lightId The ID of the light
   * @returns A map from layer number to LightEffectState
   */
  public getActiveEffectsForLight(lightId: string): Map<number, LightEffectState> {
    return this.layerManager.getActiveEffectsForLight(lightId)
  }

  /**
   * Checks if a specific layer is free for a specific light
   * @param layer The layer number to check
   * @param lightId The ID of the light
   * @returns True if the layer is free for the light, false otherwise
   */
  public isLayerFreeForLight(layer: number, lightId: string): boolean {
    return this.layerManager.isLayerFreeForLight(layer, lightId)
  }
}
