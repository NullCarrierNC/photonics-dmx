import { Effect, RGBIP, TrackedLight } from '../../types';
import { LightTransitionController } from './LightTransitionController';
import { DebugMonitor } from './DebugMonitor';
import { EffectManager } from './EffectManager';
import { EffectTransformer } from './EffectTransformer';
import { SongEventHandler } from './SongEventHandler';
import { ILightingController } from './interfaces';
import { LayerManager } from './LayerManager';
import { SystemEffectsController } from './SystemEffectsController';
import { TimeoutManager } from './TimeoutManager';
import { TransitionEngine } from './TransitionEngine';

/**
 * @class Sequencer
 * @description The main controller for the lighting system.   
 * 
 * This class delegates to other controllers for domain specific tasks.
 * 
 * @implements ILightingController
 */
export class Sequencer implements ILightingController {
  private lightTransitionController: LightTransitionController;
  private layerManager: LayerManager;
  private transitionEngine: TransitionEngine;
  private effectTransformer: EffectTransformer;
  private timeoutManager: TimeoutManager;
  private effectManager: EffectManager;
  private eventHandler: SongEventHandler;
  private systemEffectsController: SystemEffectsController;
  private debugMonitor: DebugMonitor;

  /**
   * @constructor
   * @param lightTransitionController The underlying light transition controller
   */
  constructor(lightTransitionController: LightTransitionController) {
    this.lightTransitionController = lightTransitionController;
    this.effectTransformer = new EffectTransformer();
    this.timeoutManager = new TimeoutManager();
    this.layerManager = new LayerManager(this.lightTransitionController);
    this.transitionEngine = new TransitionEngine(
      this.lightTransitionController, 
      this.layerManager
    );
    this.systemEffectsController = new SystemEffectsController(
      this.lightTransitionController,
      this.layerManager,
      this.timeoutManager
    );
    this.effectManager = new EffectManager(
      this.layerManager,
      this.transitionEngine,
      this.effectTransformer,
      this.timeoutManager,
      this.systemEffectsController
    );
    this.eventHandler = new SongEventHandler(this.layerManager, this.transitionEngine);
    this.debugMonitor = new DebugMonitor(this.lightTransitionController, this.layerManager);

    // Start the animation loop
    this.transitionEngine.startAnimationLoop();
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
  public addEffect(name: string, effect: Effect, offset: number = 0, isPersistent: boolean = false): void {
    this.effectManager.addEffect(name, effect, offset, isPersistent);
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
  public async setEffect(name: string, effect: Effect, offset: number = 0, isPersistent: boolean = false): Promise<void> {
    await this.effectManager.setEffect(name, effect, offset, isPersistent);
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
  public addEffectUnblockedName(name: string, effect: Effect, offset: number = 0, isPersistent: boolean = false): boolean {
    return this.effectManager.addEffectUnblockedName(name, effect, offset, isPersistent);
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
  public setEffectUnblockedName(name: string, effect: Effect, offset: number = 0, isPersistent: boolean = false): boolean {
    return this.effectManager.setEffectUnblockedName(name, effect, offset, isPersistent);
  }

  /**
   * Removes a specific effect
   * @param name The name of the effect to remove
   * @param layer The layer the effect is on
   */
  public removeEffect(name: string, layer: number): void {
    this.effectManager.removeEffect(name, layer);
  }

  /**
   * Removes all active effects
   */
  public removeAllEffects(): void {
    this.effectManager.removeAllEffects();
  }

  /**
   * Sets the state of a group of lights to a specific colour over time.
   * 
   * @param lights Array of lights to update
   * @param color Target colour to transition to
   * @param time Duration of the transition in milliseconds
   */
  public setState(lights: TrackedLight[], color: RGBIP, time: number): void {
    this.effectManager.setState(lights, color, time);
  }

  /**
   * Trigger the beat event.
   */
  public onBeat(): void {
    this.eventHandler.onBeat();
  }

  /**
   * Trigger the measure event.
   */
  public onMeasure(): void {
    this.eventHandler.onMeasure();
  }

  /**
   * Trigger a keyframe event.
   */
  public onKeyframe(): void {
    this.eventHandler.onKeyframe();
  }

  /**
   * Initiates a blackout effect that fades out all lights. 
   * 
   * @param duration The duration of the blackout fade in milliseconds.
   * @returns A promise that resolves when the blackout is complete.
   */
  public async blackout(duration: number): Promise<void> {
    await this.systemEffectsController.blackout(duration);
  }

  /**
   * Cancels a blackout mid-fade.
   */
  public cancelBlackout(): void {
    this.systemEffectsController.cancelBlackout();
  }


  /**
   * Enables or disables the real-time debug table
   * @param enable Whether to enable the debug table
   * @param refreshRateMs Optional refresh rate in milliseconds
   */
  public enableDebug(enable: boolean, refreshRateMs?: number): void {
    this.debugMonitor.enableDebug(enable, refreshRateMs);
  }

  /**
   * Prints detailed debug information about light layers
   */
  public debugLightLayers(): void {
    this.debugMonitor.debugLightLayers();
  }

  /**
   * Shuts down the lighting coordinator and all its components
   */
  public shutdown(): void {
    console.log('PhotonicsSequencer shutdown: starting');
    
    try {
      // Stop the animation loop
      this.transitionEngine.stopAnimationLoop();
      
      // Clear all timeouts
      this.timeoutManager.clearAllTimeouts();
      
      // Remove all effects
      this.removeAllEffects();
      
      console.log('PhotonicsSequencer shutdown: completed');
    } catch (error) {
      console.error('Error during PhotonicsSequencer shutdown:', error);
    }
  }
}
