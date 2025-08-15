import { Effect, EffectTransition, RGBIP, TrackedLight } from '../../types';
import { LightTransitionController } from './LightTransitionController';

/**
 * @interface LightEffectState
 * @description Holds the state for a single light's effect on a specific layer
 */
export interface LightEffectState {
  name: string;
  effect: Effect;
  transitions: EffectTransition[];
  lightId: string;
  layer: number;
  currentTransitionIndex: number;
  state: 'idle' | 'waitingFor' | 'transitioning' | 'waitingUntil';
  transitionStartTime: number;
  waitEndTime: number;
  lastEndState?: RGBIP;
  isPersistent?: boolean;
}

/**
 * @interface ActiveEffect
 * @description Holds the transitions for a single layer, now tracking per-light states
 * @deprecated Use LightEffectState for per-light tracking instead
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
 * @description Represents an effect waiting to be activated for a specific light
 */
export interface QueuedEffect {
  name: string;
  effect: Effect;
  lightId: string;
  isPersistent: boolean;
}

/**
 * @interface ILayerManager
 * @description Manages the layer hierarchy and state
 */
export interface ILayerManager {
  setLayerLastUsed(layer: number, time: number): void;
  getActiveEffects(): Map<number, Map<string, LightEffectState>>;
  getEffectQueue(): Map<number, Map<string, QueuedEffect>>;
  
  /**
   * Adds an active effect for a specific light on a layer
   * Populates the effect's lastEndState with appropriate state information
   * 
   * @param layer The layer number
   * @param lightId The light ID
   * @param effect The light effect state to add
   */
  addActiveEffect(layer: number, lightId: string, effect: LightEffectState): void;
  
  removeActiveEffect(layer: number, lightId: string): void;
  getActiveEffect(layer: number, lightId: string): LightEffectState | undefined;
  addQueuedEffect(layer: number, lightId: string, effect: QueuedEffect): void;
  removeQueuedEffect(layer: number, lightId: string): void;
  getQueuedEffect(layer: number, lightId: string): QueuedEffect | undefined;
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
  
  // Per-light effect management
  getActiveEffectsForLight(lightId: string): Map<number, LightEffectState>;
  isLayerFreeForLight(layer: number, lightId: string): boolean;
  isLayerFree(layer: number): boolean;
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
  prepareTransition(lightEffect: LightEffectState, transition: EffectTransition, currentTime: number): void;
  handleWaitingFor(lightEffect: LightEffectState, transition: EffectTransition, currentTime: number): void;
  startTransition(lightEffect: LightEffectState, transition: EffectTransition, currentTime: number): void;
  handleTransitioning(lightEffect: LightEffectState, transition: EffectTransition, currentTime: number): void;
  handleWaitingUntil(lightEffect: LightEffectState, transition: EffectTransition, currentTime: number): void;
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
  startNextEffectInQueue(layer: number, lightId: string): boolean;
  setState(lights: TrackedLight[], color: RGBIP, time: number): void;
  
  // Per-light effect management
  getActiveEffectsForLight(lightId: string): Map<number, LightEffectState>;
  isLayerFreeForLight(layer: number, lightId: string): boolean;
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
  expandTransitionsByLight(transitions: EffectTransition[]): EffectTransition[];
  groupTransitionsByLayerAndLight(transitions: EffectTransition[]): Map<number, Map<string, EffectTransition[]>>;
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
