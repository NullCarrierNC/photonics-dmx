import { Effect, EffectTransition, RGBIO, TrackedLight } from '../../types';
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
  lastEndState?: RGBIO;
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
  captureInitialStates(layer: number, lights: TrackedLight[]): Map<string, RGBIO>;
  captureFinalStates(layer: number, lights: TrackedLight[]): void;
  getLightState(layer: number, lightId: string): RGBIO | undefined;
  clearLayerStates(layer: number): void;
  getLightTransitionController(): LightTransitionController;
  
  // Per-light effect management
  getActiveEffectsForLight(lightId: string): Map<number, LightEffectState>;
  isLayerFreeForLight(layer: number, lightId: string): boolean;
  isLayerFree(layer: number): boolean;
}

/**
 * @interface IEventScheduler
 * @description Centralized tracking of scheduled events
 */
export interface IEventScheduler {
  setTimeout(callback: () => void, delay: number): string;
  clearAllTimeouts(): void;
  removeTimeout(timeoutId: string): void;
  
  // Clock integration
  registerWithClock(clock: any): void;
  unregisterFromClock(): void;
  
  // Additional scheduling methods
  scheduleEventAt(targetTime: number, callback: () => void): string;
  scheduleRepeatingEvent(callback: () => void, interval: number, initialDelay?: number): string;
  removeEvent(eventId: string): void;
  destroy(): void;
}

/**
 * @interface ITransitionEngine
 * @description Handles moving effect transitions through their states
 */
export interface ITransitionEngine {
  setEffectManager(effectManager: IEffectManager): void;
  updateTransitions(deltaTime?: number): void;
  prepareTransition(activeEffect: LightEffectState, transition: EffectTransition, currentTime: number): void;
  handleWaitingFor(activeEffect: LightEffectState, transition: EffectTransition, currentTime: number): void;
  startTransition(activeEffect: LightEffectState, transition: EffectTransition, currentTime: number): void;
  handleTransitioning(activeEffect: LightEffectState, transition: EffectTransition, currentTime: number): void;
  handleWaitingUntil(activeEffect: LightEffectState, transition: EffectTransition, currentTime: number): void;
  getFinalState(lightId: string, layer: number): RGBIO | undefined;
  clearFinalStates(layer: number): void;
  getLightTransitionController(): LightTransitionController;
  
  // Clock integration
  registerWithClock(clock: any): void;
  unregisterFromClock(): void;
}

/**
 * @interface IEffectManager
 * @description Coordinates the addition, removal, and updating of effects
 */
export interface IEffectManager {
  addEffect(name: string, effect: Effect, offset?: number, isPersistent?: boolean): void;
  setEffect(name: string, effect: Effect, offset?: number, isPersistent?: boolean): Promise<void>;
  addEffectUnblockedName(name: string, effect: Effect, offset?: number, isPersistent?: boolean): boolean;
  setEffectUnblockedName(name: string, effect: Effect, offset?: number, isPersistent?: boolean): boolean;
  removeEffectByLayer(layer: number, shouldRemoveTransitions?: boolean): void;
  startNextEffectInQueue(layer: number, lightId: string): boolean;
  getActiveEffectsForLight(lightId: string): Map<number, LightEffectState>;
  isLayerFreeForLight(layer: number, lightId: string): boolean;
  setState(lights: TrackedLight[], color: RGBIO, time: number): void;
}

/**
 * @interface IEffectTransformer
 * @description Transforms effects into transitions grouped by layer and light
 */
export interface IEffectTransformer {
  groupTransitionsByLayerAndLight(transitions: EffectTransition[]): Map<number, Map<string, EffectTransition[]>>;
  expandTransitionsByLight(transitions: EffectTransition[]): EffectTransition[];
}

/**
 * @interface ISongEventHandler
 * @description Processes beat/measure/keyframe events
 */
export interface ISongEventHandler {
  onBeat(): void;
  onMeasure(): void;
  onKeyframe(): void;
  handleEvent(eventType: 'beat' | 'measure' | 'keyframe'): void;
}

/**
 * @interface ISystemEffectsController
 * @description Controls system-wide effects like blackouts
 */
export interface ISystemEffectsController {
  isBlackoutActive(): boolean;
  cancelBlackout(): void;
  setOnBlackoutCompleteCallback(callback: () => void): void;
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
 * @interface ILightingController
 * @description Main interface for the lighting system
 */
export interface ILightingController {
  addEffect(name: string, effect: Effect, offset?: number, isPersistent?: boolean): void;
  setEffect(name: string, effect: Effect, offset?: number, isPersistent?: boolean): Promise<void>;
  addEffectUnblockedName(name: string, effect: Effect, offset?: number, isPersistent?: boolean): boolean;
  setEffectUnblockedName(name: string, effect: Effect, offset?: number, isPersistent?: boolean): boolean;
  removeEffectByLayer(layer: number, shouldRemoveTransitions?: boolean): void;
  removeEffect(name: string, layer: number): void;
  removeAllEffects(): void;
  getActiveEffectsForLight(lightId: string): Map<number, LightEffectState>;
  isLayerFreeForLight(layer: number, lightId: string): boolean;
  setState(lights: TrackedLight[], color: RGBIO, time: number): void;
  
  // Song event handling methods
  onBeat(): void;
  onMeasure(): void;
  onKeyframe(): void;
  
  // System effects methods
  blackout(duration: number): Promise<void>;
  cancelBlackout(): void;
  
  // Debug methods
  enableDebug(enable: boolean, refreshRateMs?: number): void;
  debugLightLayers(): void;
  
  // Lifecycle methods
  shutdown(): void;
}
