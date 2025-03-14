import { ActiveEffect, ILayerManager, QueuedEffect } from './interfaces';
import { LightTransitionController } from './LightTransitionController';
import { RGBIP, TrackedLight } from '../../types';

/**
 * @class LayerManager
 * @description 
 * Manages the layer hierarchy and state for applied effects.
 * 
 * Primary responsibilities:
 * - Manages active effects across different layers
 * - Maintains queued effects waiting to be activated
 * - Tracks layer usage with timestamps for cleanup operations
 * - Prevents "stuck" lights by cleaning up unused layers after grace periods
 * - Provides blackout threshold control for layer-specific operations
 * - Manages light state persistence between effects
 * 
 * Layer conventions:
 * - Layer 0: Base layer (preserved by design)
 * - Layers 1-99: Standard effect layers
 * - Layers 100+: High priority "flash" layers
 * - Layers 200: Blackout layers
 * - Layers 201-254: Reserved for future use
 * - Layer 255: Strobe effects
 * 
 */
export class LayerManager implements ILayerManager {
  private _activeEffects: Map<number, ActiveEffect> = new Map();
  private _effectQueue: Map<number, QueuedEffect> = new Map();
  private _layerLastUsed: Map<number, number> = new Map();
  private _blackoutLayersUnder: number = 200;
  private _lightTransitionController: LightTransitionController;
  
  // New property for storing layer states
  private _layerStates: Map<number, Map<string, RGBIP>> = new Map();

  /**
   * Creates a new LayerManager instance
   * @param lightTransitionController The light transition controller
   */
  constructor(lightTransitionController: LightTransitionController) {
    this._lightTransitionController = lightTransitionController;
  }

  /**
   * Records when a layer was last used
   * @param layer The layer number
   * @param time The timestamp when the layer was used
   */
  public setLayerLastUsed(layer: number, time: number): void {
    this._layerLastUsed.set(layer, time);
  }

  /**
   * Gets the map of active effects
   * @returns Map of layer numbers to active effects
   */
  public getActiveEffects(): Map<number, ActiveEffect> {
    return this._activeEffects;
  }

  /**
   * Gets the map of queued effects
   * @returns Map of layer numbers to queued effects
   */
  public getEffectQueue(): Map<number, QueuedEffect> {
    return this._effectQueue;
  }

  /**
   * Adds an active effect to a layer and automatically manages its state
   * Populates the effect's lastEndStates with appropriate state information
   * 
   * @param layer The layer number
   * @param effect The active effect to add
   */
  public addActiveEffect(layer: number, effect: ActiveEffect): void {
    // Initialize lastEndStates if it doesn't exist
    if (!effect.lastEndStates) {
      effect.lastEndStates = new Map<string, RGBIP>();
    }
    
    // Populate lastEndStates if it's empty
    if (effect.lastEndStates.size === 0) {
      // Capture states for all tracked lights
      const capturedStates = this.captureInitialStates(layer, effect.trackedLights);
      
      // Apply the captured states to the effect
      capturedStates.forEach((state, lightId) => {
        effect.lastEndStates!.set(lightId, state);
      });
    }
    
    // Now store the effect
    this._activeEffects.set(layer, effect);
  }

  /**
   * Removes an active effect from a layer
   * @param layer The layer number to remove the effect from
   */
  public removeActiveEffect(layer: number): void {
    this._activeEffects.delete(layer);
  }

  /**
   * Gets an active effect for a layer if it exists
   * @param layer The layer number to look up
   * @returns The active effect on that layer, or undefined if none exists
   */
  public getActiveEffect(layer: number): ActiveEffect | undefined {
    return this._activeEffects.get(layer);
  }

  /**
   * Adds a queued effect for a layer
   * @param layer The layer number
   * @param effect The queued effect to add
   */
  public addQueuedEffect(layer: number, effect: QueuedEffect): void {
    this._effectQueue.set(layer, effect);
  }

  /**
   * Removes a queued effect from a layer
   * @param layer The layer number to remove the queued effect from
   */
  public removeQueuedEffect(layer: number): void {
    this._effectQueue.delete(layer);
  }

  /**
   * Gets a queued effect for a layer if it exists
   * @param layer The layer number to look up
   * @returns The queued effect on that layer, or undefined if none exists
   */
  public getQueuedEffect(layer: number): QueuedEffect | undefined {
    return this._effectQueue.get(layer);
  }

  /**
   * Gets all layer numbers currently in use
   * @returns Array of layer numbers
   */
  public getAllLayers(): number[] {
    return Array.from(new Set([
      ...this._activeEffects.keys(), 
      ...this._layerLastUsed.keys()
    ]));
  }

  /**
   * Gets the blackout layer threshold
   * @returns The layer number threshold for blackout
   */
  public getBlackoutLayersUnder(): number {
    return this._blackoutLayersUnder;
  }

  /**
   * Effects on layers may not automatically clean themselves up to 
   * allow for a transitionary period with a new effect. 
   * This checks for any layers with state that hasn't been touched in
   * more than N ms and isn't part of a running effect or queued effects. If found,
   * they'll be cleared to stop "stuck" lights.
   * 
   * @param now The current timestamp
   */
  public cleanupUnusedLayers(now: number): void {
    const GRACE_PERIOD_NORMAL = 2000; 
    const GRACE_PERIOD_FLASH = 2000;

    const usedLayers = new Set<number>(this._activeEffects.keys());
    const queuedLayers = new Set<number>(this._effectQueue.keys());

    for (const [layer, lastUsedTime] of this._layerLastUsed.entries()) {
      if (layer === 0) continue; // keep layer 0 by design
      if (!usedLayers.has(layer) && !queuedLayers.has(layer)) {
        const elapsed = now - lastUsedTime;
        if (layer > 100 && elapsed > GRACE_PERIOD_FLASH) {
          // cleanup flash layers (higher priority)
   //       console.log(`Cleaning up GRACE_PERIOD_FLASH layer ${layer} after ${elapsed}ms idle`);
          this._lightTransitionController.removeTransitionsByLayer(layer);
          this._layerLastUsed.delete(layer);
        } else if (layer > 0 && elapsed > GRACE_PERIOD_NORMAL) {
          // cleanup all other non-zero layers
     //     console.log(`Cleaning up GRACE_PERIOD_NORMAL layer ${layer} after ${elapsed}ms idle`);
          this._lightTransitionController.removeTransitionsByLayer(layer);
          this._layerLastUsed.delete(layer);
        }
      }
    }
  }

  /**
   * Gets the light transition controller
   * @returns The light transition controller
   */
  public getLightTransitionController(): LightTransitionController {
    return this._lightTransitionController;
  }

  /**
   * Captures the initial states for lights on a layer when a new effect is starting.
   * This ensures smooth transitions from current state to new effect state.
   * 
   * @param layer The layer to capture states for
   * @param lights The lights to capture state for
   * @returns A map of light IDs to their current states
   */
  public captureInitialStates(layer: number, lights: TrackedLight[]): Map<string, RGBIP> {
    const stateMap = new Map<string, RGBIP>();
    
    lights.forEach(light => {
      // First check if we have a stored state for this light/layer
      const storedState = this.getLightState(layer, light.id);
      if (storedState) {
        // Use stored state if available
        stateMap.set(light.id, storedState);
      } else {
        // Otherwise get current state from LightTransitionController
        const currentState = this._lightTransitionController.getLightState(light.id, layer);
        if (currentState) {
          stateMap.set(light.id, { ...currentState });
        } else {
          // Default black state if no current state exists
          stateMap.set(light.id, {
            red: 0, rp: 0,
            green: 0, gp: 0,
            blue: 0, bp: 0,
            intensity: 0, ip: 0
          });
        }
      }
    });
    
    return stateMap;
  }

  /**
   * Captures the final states for an active effect's lights before the effect is removed.
   * This ensures subsequent effects can transition smoothly from these final states.
   * 
   * @param layer The layer to capture states for
   * @param lights The lights to capture final states for
   */
  public captureFinalStates(layer: number, lights: TrackedLight[]): void {
    if (!this._layerStates.has(layer)) {
      this._layerStates.set(layer, new Map<string, RGBIP>());
    }
    
    const layerStates = this._layerStates.get(layer)!;
    
    // Get active effect if it exists to check for end states
    const activeEffect = this.getActiveEffect(layer);
    
    lights.forEach(light => {
      // First try to get current state from LightTransitionController
      const currentState = this._lightTransitionController.getLightState(light.id, layer);
      if (currentState) {
        // Store deep copy of state
        layerStates.set(light.id, { ...currentState });
      } 
      // If no current state but active effect has last end states, use those
      else if (activeEffect && activeEffect.lastEndStates && activeEffect.lastEndStates.has(light.id)) {
        const lastEndState = activeEffect.lastEndStates.get(light.id);
        if (lastEndState) {
          layerStates.set(light.id, { ...lastEndState });
        }
      }
    });
  }

  /**
   * Gets the stored state for a light on a layer
   * 
   * @param layer The layer to get state from
   * @param lightId The light ID to get state for
   * @returns The state if found, undefined otherwise
   */
  public getLightState(layer: number, lightId: string): RGBIP | undefined {
    const layerStates = this._layerStates.get(layer);
    if (layerStates) {
      return layerStates.get(lightId);
    }
    return undefined;
  }

  /**
   * Clears stored states for a layer
   * 
   * @param layer The layer to clear states for
   */
  public clearLayerStates(layer: number): void {
    this._layerStates.delete(layer);
  }

  /**
   * Removes the layer from tracking when a layer is explicitly cleared.
   * @param layer The layer to reset tracking for
   */
  public resetLayerTracking(layer: number): void {
    // Don't track layer 0 as it's special
    if (layer === 0) return;
    
    // Remove the layer from tracking
    if (this._layerLastUsed.has(layer)) {
      this._layerLastUsed.delete(layer);
    }
  }
}
