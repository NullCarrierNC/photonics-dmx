import { Effect, EffectTransition, RGBIP, TrackedLight } from '../../types';
import { LightTransitionController } from './LightTransitionController';

/**
 * @interface ActiveEffect
 * @description Holds only the transitions for a single layer.
 */
export interface ActiveEffect {
  name: string;
  effect: Effect;
  transitions: EffectTransition[];
  trackedLights: TrackedLight[];
  layer: number;
  currentTransitionIndex: number;
  state: 'idle' | 'waitingFor' | 'transitioning' | 'waitingUntil';
  transitionStartTime: number;
  waitEndTime: number;
  lastEndStates?: Map<string, RGBIP>;
  isPersistent?: boolean;
}

/**
 * @interface QueuedEffect
 * @description Represents an effect waiting to be activated
 */
export interface QueuedEffect {
  name: string;
  effect: Effect;
  isPersistent: boolean;
}

/**
 * @interface ILayerManager
 * @description Manages the layer hierarchy and state
 */
export interface ILayerManager {
  setLayerLastUsed(layer: number, time: number): void;
  getActiveEffects(): Map<number, ActiveEffect>;
  getEffectQueue(): Map<number, QueuedEffect>;
  
  /**
   * Adds an active effect to a layer and automatically manages its state
   * Populates the effect's lastEndStates with appropriate state information
   * 
   * @param layer The layer number
   * @param effect The active effect to add
   */
  addActiveEffect(layer: number, effect: ActiveEffect): void;
  
  removeActiveEffect(layer: number): void;
  getActiveEffect(layer: number): ActiveEffect | undefined;
  addQueuedEffect(layer: number, effect: QueuedEffect): void;
  removeQueuedEffect(layer: number): void;
  getQueuedEffect(layer: number): QueuedEffect | undefined;
  cleanupUnusedLayers(now: number): void;
  getAllLayers(): number[];
  
  /**
   * Removes the layer from tracking when a layer is explicitly cleared. 
   * 
   * @param layer The layer to reset tracking for
   */
  resetLayerTracking(layer: number): void;
  
  // State management methods
  captureInitialStates(layer: number, lights: TrackedLight[]): Map<string, RGBIP>;
  captureFinalStates(layer: number, lights: TrackedLight[]): void;
  getLightState(layer: number, lightId: string): RGBIP | undefined;
  clearLayerStates(layer: number): void;
  getLightTransitionController(): LightTransitionController;
}

/**
 * @interface ITimeoutManager
 * @description Manages scheduled operations and timeouts
 */
export interface ITimeoutManager {
  /** Sets a timeout and tracks it */
  setTimeout(callback: () => void, delay: number): NodeJS.Timeout;
  
  /** Clears all tracked timeouts */
  clearAllTimeouts(): void;
  
  /** Removes a specific timeout from tracking */
  removeTimeout(timeoutId: NodeJS.Timeout): void;
  

}

/**
 * @interface ITransitionEngine
 * @description Handles the animation loop and transition states
 */
export interface ITransitionEngine {
  startAnimationLoop(): void;
  stopAnimationLoop(): void;
  updateTransitions(): void;
  prepareTransition(activeEffect: ActiveEffect, transition: EffectTransition, currentTime: number): void;
  handleWaitingFor(activeEffect: ActiveEffect, transition: EffectTransition, currentTime: number): void;
  startTransition(activeEffect: ActiveEffect, transition: EffectTransition, currentTime: number): void;
  handleTransitioning(activeEffect: ActiveEffect, transition: EffectTransition, currentTime: number): void;
  handleWaitingUntil(activeEffect: ActiveEffect, transition: EffectTransition, currentTime: number): void;
  getLightTransitionController(): LightTransitionController;
  setEffectManager(effectManager: IEffectManager): void;
}

/**
 * @interface IEventHandler
 * @description Processes beat/measure/keyframe events
 */
export interface ISongEventHandler {
  onBeat(): void;
  onMeasure(): void;
  onKeyframe(): void;
  handleEvent(eventType: 'beat' | 'measure' | 'keyframe'): void;
}

/**
 * @interface IEffectManager
 * @description Manages the lifecycle of effects
 */
export interface IEffectManager {
  addEffect(name: string, effect: Effect, offset?: number, isPersistent?: boolean): void;
  setEffect(name: string, effect: Effect, offset?: number, isPersistent?: boolean): Promise<void>;
  addEffectUnblockedName(name: string, effect: Effect, offset?: number, isPersistent?: boolean): boolean;
  setEffectUnblockedName(name: string, effect: Effect, offset?: number, isPersistent?: boolean): boolean;
  removeEffect(name: string, layer: number): void;
  removeAllEffects(): void;
  startEffect(name: string, effect: Effect, trackedLights: TrackedLight[], layer: number, transitions: EffectTransition[], isPersistent?: boolean): void;
  removeEffectByLayer(layer: number, shouldRemoveTransitions: boolean): void;
  startNextEffectInQueue(layer: number): boolean;
  setState(lights: TrackedLight[], color: RGBIP, time: number): void;
}

/**
 * @interface ISystemEffectsController
 * @description Handles special lighting effects
 */
export interface ISystemEffectsController {
  blackout(duration: number): Promise<void>;
  cancelBlackout(): void;
  isBlackoutActive(): boolean;
  getBlackoutLayersUnder(): number;
}

/**
 * @interface IDebugMonitor
 * @description Debug and monitoring functionality
 */
export interface IDebugMonitor {
  enableDebug(enable: boolean, refreshRateMs?: number): void;
  refreshDebugTable(): void;
  printLightLayerTable(): void;
  debugLightLayers(): void;
}

/**
 * @interface IEffectTransformer
 * @description Transforms effect definitions into transitions
 */
export interface IEffectTransformer {
  groupTransitionsByLayer(transitions: EffectTransition[]): Map<number, EffectTransition[]>;
}

/**
 * @interface ILightingController
 * @description Defines the public API for lighting effects controllers
 *  
 * This is the primary interface that external components such as CueHandlers
 * should use to interact with the lighting system. It serves as a façade for the 
 * underlying EffectManager and other components.
 */
export interface ILightingController {
  addEffect(name: string, effect: Effect, offset?: number, isPersistent?: boolean): void;
  setEffect(name: string, effect: Effect, offset?: number, isPersistent?: boolean): Promise<void>;
  addEffectUnblockedName(name: string, effect: Effect, offset?: number, isPersistent?: boolean): boolean;
  setEffectUnblockedName(name: string, effect: Effect, offset?: number, isPersistent?: boolean): boolean;
  removeEffect(name: string, layer: number): void;
  removeAllEffects(): void;
  setState(lights: TrackedLight[], color: RGBIP, time: number): void;
  onBeat(): void;
  onMeasure(): void;
  onKeyframe(): void;
  blackout(duration: number): Promise<void>;
  cancelBlackout(): void;
  enableDebug(enable: boolean, refreshRateMs?: number): void;
  debugLightLayers(): void;
  shutdown(): void;
}
