import type { ResolvedMotionPatternSetting } from '../../cues/node/compiler/ActionEffectFactory'
import { Effect, RGBIO, TrackedLight } from '../../types'
import { InstrumentNoteType, DrumNoteType } from '../../cues/types/cueTypes'
import { LightTransitionController } from './LightTransitionController'
import { DebugMonitor } from './DebugMonitor'
import { EffectManager } from './EffectManager'
import { EffectTransformer } from './EffectTransformer'
import { SongEventHandler } from './SongEventHandler'
import {
  ActiveMotionPattern,
  FrameContext,
  ILightingController,
  LightEffectState,
} from './interfaces'
import { LayerManager } from './LayerManager'
import { SystemEffectsController } from './SystemEffectsController'
import { EventScheduler } from './EventScheduler'
import { TransitionEngine } from './TransitionEngine'
import { MotionPatternEngine } from './MotionPatternEngine'
import { Clock } from './Clock'
import { performance } from 'perf_hooks'
import { createLogger } from '../../../shared/logger'
const log = createLogger('Sequencer')

/**
 * @class Sequencer
 * @description The main controller for the lighting system.
 *
 * This class delegates to other controllers for domain specific tasks.
 *
 * @implements ILightingController
 */
export class Sequencer implements ILightingController {
  private lightTransitionController: LightTransitionController
  private layerManager: LayerManager
  private transitionEngine: TransitionEngine
  private effectTransformer: EffectTransformer
  private eventScheduler: EventScheduler
  private effectManager: EffectManager
  private eventHandler: SongEventHandler
  private systemEffectsController: SystemEffectsController
  private debugMonitor: DebugMonitor
  private motionPatternEngine: MotionPatternEngine
  private clock: Clock
  private frameIndex: number = 0
  private readonly handleClockTick: (deltaTime: number) => void

  /**
   * @constructor
   * @param lightTransitionController The underlying light transition controller
   * @param clock The shared Clock instance for timing synchronization
   */
  constructor(lightTransitionController: LightTransitionController, clock: Clock) {
    this.clock = clock
    this.lightTransitionController = lightTransitionController
    this.effectTransformer = new EffectTransformer()
    this.eventScheduler = new EventScheduler()
    this.layerManager = new LayerManager(this.lightTransitionController)
    this.transitionEngine = new TransitionEngine(this.lightTransitionController, this.layerManager)
    this.systemEffectsController = new SystemEffectsController(
      this.lightTransitionController,
      this.layerManager,
    )
    this.effectManager = new EffectManager(
      this.layerManager,
      this.transitionEngine,
      this.effectTransformer,
      this.systemEffectsController,
    )
    this.eventHandler = new SongEventHandler(this.layerManager, this.transitionEngine)
    this.debugMonitor = new DebugMonitor(this.lightTransitionController, this.layerManager)
    this.motionPatternEngine = new MotionPatternEngine(this.lightTransitionController)

    // Bind frame processing to the shared clock
    this.handleClockTick = (deltaTime: number) => {
      const frameContext: FrameContext = {
        frameStartTime: performance.now(),
        deltaTime,
        frameIndex: this.frameIndex++,
      }
      this.transitionEngine.advanceFrame(frameContext)
      this.motionPatternEngine.advanceFrame(frameContext)
      this.lightTransitionController.advanceFrame(frameContext)
    }

    this.clock.onTick(this.handleClockTick)
    this.eventScheduler.registerWithClock(this.clock)
  }

  /**
   * Adds a new effect without affecting effects on other layers.
   * If an effect with the same name is already running, it will be queued.
   * Otherwise, it will replace any effect running on the passed transition(s) layer(s).
   *
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param offset How long to wait before applying this effect (in ms)
   * @param isPersistent If true, the effect re-queues itself after completing
   */
  public addEffect(name: string, effect: Effect, isPersistent: boolean = false): void {
    this.effectManager.addEffect(name, effect, isPersistent)
  }

  /**
   * Per-(layer, light) replace. Cancels any active or queued effect on each
   * targeted slot and starts the new transitions immediately, easing from each
   * light's current state. Use for state-target effects like non-blocking
   * `set-position` where the latest submission must take effect now and queueing
   * the new transition behind a stale in-flight one would desynchronise motion.
   *
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param isPersistent If true, the effect re-queues itself after completing
   */
  public replaceEffect(name: string, effect: Effect, isPersistent: boolean = false): void {
    this.effectManager.replaceEffect(name, effect, isPersistent)
  }

  /**
   * Adds a new effect with a completion callback.
   * The callback will be fired when all lights in the effect complete their transitions.
   *
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param onComplete Callback to fire when effect completes
   * @param isPersistent If true, the effect re-queues itself after completing
   */
  public addEffectWithCallback(
    name: string,
    effect: Effect,
    onComplete: () => void,
    isPersistent: boolean = false,
  ): void {
    this.effectManager.addEffectWithCallback(name, effect, onComplete, isPersistent)
  }

  public setEffectWithCallback(
    name: string,
    effect: Effect,
    onComplete: () => void,
    isPersistent: boolean = false,
  ): void {
    this.effectManager.setEffectWithCallback(name, effect, onComplete, isPersistent)
  }

  /**
   * Remove a completion callback for an effect.
   *
   * @param name The name of the effect
   */
  public removeEffectCallback(name: string): void {
    this.effectManager.removeEffectCallback(name)
  }

  /**
   * Clears all running effects and starts a new effect.
   * If an effect with the same name is already running, it will be queued.
   *
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param offset How long to wait before applying this effect (in ms)
   * @param isPersistent If true, the effect re-queues itself after completing
   */
  public async setEffect(
    name: string,
    effect: Effect,
    isPersistent: boolean = false,
  ): Promise<void> {
    this.effectManager.setEffect(name, effect, isPersistent)
  }

  /**
   * Adds and effect only if it is not already running.
   * Otherwise it will be discarded.
   *
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param offset How long to wait before applying this effect (in ms)
   * @param isPersistent If true, the effect re-queues itself after completing
   * @returns True if the effect was added, false otherwise
   */
  public addEffectUnblockedName(
    name: string,
    effect: Effect,
    isPersistent: boolean = false,
  ): boolean {
    return this.effectManager.addEffectUnblockedName(name, effect, isPersistent)
  }

  /**
   * Sets an effect only if it is not already running.
   * Otherwise it will be discarded.
   *
   * @param name The name of the effect
   * @param effect The effect configuration
   * @param offset How long to wait before applying this effect (in ms)
   * @param isPersistent If true, the effect re-queues itself after completing
   * @returns True if the effect was set, false otherwise
   */
  public setEffectUnblockedName(
    name: string,
    effect: Effect,
    isPersistent: boolean = false,
  ): boolean {
    return this.effectManager.setEffectUnblockedName(name, effect, isPersistent)
  }

  /**
   * Add an effect only if not already running, with completion callback.
   * If discarded, callback is fired immediately.
   */
  public addEffectUnblockedNameWithCallback(
    name: string,
    effect: Effect,
    onComplete: () => void,
    isPersistent: boolean = false,
  ): void {
    this.effectManager.addEffectUnblockedNameWithCallback(name, effect, onComplete, isPersistent)
  }

  /**
   * Set an effect only if not already running, with completion callback.
   * If discarded, callback is fired immediately.
   */
  public setEffectUnblockedNameWithCallback(
    name: string,
    effect: Effect,
    onComplete: () => void,
    isPersistent: boolean = false,
  ): void {
    this.effectManager.setEffectUnblockedNameWithCallback(name, effect, onComplete, isPersistent)
  }

  /**
   * Removes a specific effect
   * @param name The name of the effect to remove
   * @param layer The layer the effect is on
   */
  public removeEffect(name: string, layer: number): void {
    this.effectManager.removeEffect(name, layer)
  }

  /**
   * Removes all active effects
   */
  public removeAllEffects(): void {
    this.motionPatternEngine.removeAllPatterns()
    this.effectManager.removeAllEffects()
  }

  public addMotionPattern(
    name: string,
    config: ResolvedMotionPatternSetting,
    lights: TrackedLight[],
    layer: number,
    rampUpDurationMs: number,
  ): void {
    if (this.motionPatternEngine.hasPattern(name)) {
      this.motionPatternEngine.removePattern(name)
    }
    this.motionPatternEngine.addPattern({
      name,
      config,
      lights,
      layer,
      startTime: performance.now(),
      rampUpDurationMs,
    })
  }

  public removeMotionPattern(name: string): void {
    this.motionPatternEngine.removePattern(name)
  }

  public getMotionPattern(name: string): ActiveMotionPattern | undefined {
    return this.motionPatternEngine.getPattern(name)
  }

  public updateMotionPatternConfig(name: string, config: ResolvedMotionPatternSetting): void {
    this.motionPatternEngine.updatePatternConfig(name, config)
  }

  /**
   * Removes an effect from a specific layer
   * @param layer The layer from which to remove the effect
   * @param shouldRemoveTransitions Whether to remove transition data as well
   */
  public removeEffectByLayer(layer: number, shouldRemoveTransitions: boolean = false): void {
    this.effectManager.removeEffectByLayer(layer, shouldRemoveTransitions)
  }

  /**
   * Gets all active effects for a specific light across all layers
   * @param lightId The ID of the light
   * @returns A map from layer number to LightEffectState
   */
  public getActiveEffectsForLight(lightId: string): Map<number, LightEffectState> {
    return this.effectManager.getActiveEffectsForLight(lightId)
  }

  /**
   * Checks if a specific layer is free for a specific light
   * @param layer The layer number to check
   * @param lightId The ID of the light
   * @returns True if the layer is free for the light, false otherwise
   */
  public isLayerFreeForLight(layer: number, lightId: string): boolean {
    return this.effectManager.isLayerFreeForLight(layer, lightId)
  }

  /**
   * Sets the state of a group of lights to a specific colour over time.
   *
   * @param lights Array of lights to update
   * @param color Target colour to transition to
   * @param time Duration of the transition in milliseconds
   */
  public setState(lights: TrackedLight[], color: RGBIO, time: number): void {
    this.effectManager.setState(lights, color, time)
  }

  public schedulePanTiltClear(): void {
    this.transitionEngine.schedulePanTiltClear()
  }

  public cancelPanTiltClear(): void {
    this.transitionEngine.cancelPanTiltClear()
  }

  /**
   * Trigger the beat event.
   */
  public onBeat(): void {
    this.eventHandler.onBeat()
  }

  /**
   * Trigger the measure event.
   */
  public onMeasure(): void {
    this.eventHandler.onMeasure()
  }

  /**
   * Trigger a keyframe event.
   */
  public onKeyframe(): void {
    this.eventHandler.onKeyframe()
  }

  /**
   * Trigger a keyframe-first event.
   */
  public onKeyframeFirst(): void {
    this.eventHandler.onKeyframeFirst()
  }

  /**
   * Trigger a keyframe-next event.
   */
  public onKeyframeNext(): void {
    this.eventHandler.onKeyframeNext()
  }

  /**
   * Trigger a keyframe-previous event.
   */
  public onKeyframePrevious(): void {
    this.eventHandler.onKeyframePrevious()
  }

  /**
   * Handle individual drum note events
   */
  public onDrumNote(noteType: DrumNoteType): void {
    this.eventHandler.onDrumNote(noteType)
  }

  /**
   * Handle individual guitar note events
   */
  public onGuitarNote(noteType: InstrumentNoteType): void {
    this.eventHandler.onGuitarNote(noteType)
  }

  /**
   * Handle individual bass note events
   */
  public onBassNote(noteType: InstrumentNoteType): void {
    this.eventHandler.onBassNote(noteType)
  }

  /**
   * Handle individual keys note events
   */
  public onKeysNote(noteType: InstrumentNoteType): void {
    this.eventHandler.onKeysNote(noteType)
  }

  /**
   * Initiates a blackout effect that fades out all lights.
   *
   * @param duration The duration of the blackout fade in milliseconds.
   * @returns A promise that resolves when the blackout is complete.
   */
  public async blackout(duration: number): Promise<void> {
    await this.systemEffectsController.blackout(duration)
  }

  /**
   * Cancels a blackout mid-fade.
   */
  public cancelBlackout(): void {
    this.systemEffectsController.cancelBlackout()
  }

  /**
   * Enables or disables the real-time debug table
   * @param enable Whether to enable the debug table
   * @param refreshRateMs Optional refresh rate in milliseconds
   */
  public enableDebug(enable: boolean, refreshRateMs?: number): void {
    this.debugMonitor.enableDebug(enable, refreshRateMs)
  }

  /**
   * Prints detailed debug information about light layers
   */
  public debugLightLayers(): void {
    this.debugMonitor.debugLightLayers()
  }

  /**
   * Tears down this sequencer's own resources: its tick callback on the shared `Clock`, its
   * scheduled events, and every currently-active effect. The `Clock` itself is **not** stopped
   * — it's owned externally (so it can be shared across multiple sequencers running in
   * parallel) and its lifecycle is the owner's responsibility.
   */
  public shutdown(): void {
    log.info('PhotonicsSequencer shutdown: starting')

    try {
      // Unregister from the shared clock without stopping it; other sequencers may still be
      // ticking against the same Clock.
      this.clock.offTick(this.handleClockTick)
      this.eventScheduler.unregisterFromClock()

      this.removeAllEffects()
      this.eventScheduler.destroy()

      log.info('PhotonicsSequencer shutdown: completed')
    } catch (error) {
      log.error('Error during PhotonicsSequencer shutdown:', error)
    }
  }
}
