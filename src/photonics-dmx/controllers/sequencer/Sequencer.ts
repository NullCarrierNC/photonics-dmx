import { Effect, RGBIO, TrackedLight } from '../../types';
import { InstrumentNoteType, DrumNoteType } from '../../cues/cueTypes';
import { LightTransitionController } from './LightTransitionController';
import { DebugMonitor } from './DebugMonitor';
import { EffectManager } from './EffectManager';
import { EffectTransformer } from './EffectTransformer';
import { SongEventHandler } from './SongEventHandler';
import { ILightingController, LightEffectState } from './interfaces';
import { LayerManager } from './LayerManager';
import { SystemEffectsController } from './SystemEffectsController';
import { EventScheduler } from './EventScheduler';
import { TransitionEngine } from './TransitionEngine';
import { Clock } from './Clock';

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
  private eventScheduler: EventScheduler;
  private effectManager: EffectManager;
  private eventHandler: SongEventHandler;
  private systemEffectsController: SystemEffectsController;
  private debugMonitor: DebugMonitor;
  private clock: Clock;

  /**
   * @constructor
   * @param lightTransitionController The underlying light transition controller
   * @param clock The shared Clock instance for timing synchronization
   */
  constructor(lightTransitionController: LightTransitionController, clock: Clock) {
    this.clock = clock;
    this.lightTransitionController = lightTransitionController;
    this.effectTransformer = new EffectTransformer();
    this.eventScheduler = new EventScheduler();
    this.layerManager = new LayerManager(this.lightTransitionController);
    this.transitionEngine = new TransitionEngine(
      this.lightTransitionController, 
      this.layerManager
    );
    this.systemEffectsController = new SystemEffectsController(
      this.lightTransitionController,
      this.layerManager,
    );
    this.effectManager = new EffectManager(
      this.layerManager,
      this.transitionEngine,
      this.effectTransformer,
      this.systemEffectsController
    );
    this.eventHandler = new SongEventHandler(this.layerManager, this.transitionEngine);
    this.debugMonitor = new DebugMonitor(this.lightTransitionController, this.layerManager);

    // Register components with the clock
    this.transitionEngine.registerWithClock(this.clock);
    this.lightTransitionController.registerWithClock(this.clock);
    this.eventScheduler.registerWithClock(this.clock);
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
  public addEffect(name: string, effect: Effect,  isPersistent: boolean = false): void {
    this.effectManager.addEffect(name, effect, isPersistent);
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
  public async setEffect(name: string, effect: Effect, isPersistent: boolean = false): Promise<void> {
    await this.effectManager.setEffect(name, effect, isPersistent);
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
  public addEffectUnblockedName(name: string, effect: Effect, isPersistent: boolean = false): boolean {
    return this.effectManager.addEffectUnblockedName(name, effect, isPersistent);
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
  public setEffectUnblockedName(name: string, effect: Effect, isPersistent: boolean = false): boolean {
    return this.effectManager.setEffectUnblockedName(name, effect, isPersistent);
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
   * Removes an effect from a specific layer
   * @param layer The layer from which to remove the effect
   * @param shouldRemoveTransitions Whether to remove transition data as well
   */
  public removeEffectByLayer(layer: number, shouldRemoveTransitions: boolean = false): void {
    this.effectManager.removeEffectByLayer(layer, shouldRemoveTransitions);
  }

  /**
   * Gets all active effects for a specific light across all layers
   * @param lightId The ID of the light
   * @returns A map from layer number to LightEffectState
   */
  public getActiveEffectsForLight(lightId: string): Map<number, LightEffectState> {
    return this.effectManager.getActiveEffectsForLight(lightId);
  }

  /**
   * Checks if a specific layer is free for a specific light
   * @param layer The layer number to check
   * @param lightId The ID of the light
   * @returns True if the layer is free for the light, false otherwise
   */
  public isLayerFreeForLight(layer: number, lightId: string): boolean {
    return this.effectManager.isLayerFreeForLight(layer, lightId);
  }

  /**
   * Sets the state of a group of lights to a specific colour over time.
   * 
   * @param lights Array of lights to update
   * @param color Target colour to transition to
   * @param time Duration of the transition in milliseconds
   */
  public setState(lights: TrackedLight[], color: RGBIO, time: number): void {
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
   * Handle individual drum note events
   */
  public onDrumNote(noteType: DrumNoteType): void {
    this.eventHandler.onDrumNote(noteType);
  }

  /**
   * Handle individual guitar note events
   */
  public onGuitarNote(noteType: InstrumentNoteType): void {
    this.eventHandler.onGuitarNote(noteType);
  }

  /**
   * Handle individual bass note events
   */
  public onBassNote(noteType: InstrumentNoteType): void {
    this.eventHandler.onBassNote(noteType);
  }

  /**
   * Handle individual keys note events
   */
  public onKeysNote(noteType: InstrumentNoteType): void {
    this.eventHandler.onKeysNote(noteType);
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
      // Stop the clock
      this.clock.stop();
      
      // Unregister components from clock
      this.transitionEngine.unregisterFromClock();
      this.lightTransitionController.unregisterFromClock();
      this.eventScheduler.unregisterFromClock();
      
      // Remove all effects
      this.removeAllEffects();
      
      // Clean up other resources
      this.eventScheduler.destroy();
      
      console.log('PhotonicsSequencer shutdown: completed');
    } catch (error) {
      console.error('Error during PhotonicsSequencer shutdown:', error);
    }
  }
}
