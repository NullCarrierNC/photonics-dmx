import { ILayerManager, QueuedEffect, LightEffectState } from './interfaces';
import { LightTransitionController } from './LightTransitionController';
import { RGBIO, TrackedLight } from '../../types';

/**
 * @class LayerManager
 * @description 
 * Manages the layer hierarchy and state for applied effects.
 * 
 * Primary responsibilities:
 * - Manages active effects across different layers and lights
 * - Maintains queued effects waiting to be activated per light
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
  // Per-light effect tracking: Map<layer, Map<lightId, LightEffectState>>
  private _activeEffects: Map<number, Map<string, LightEffectState>> = new Map();
  // Per-light queue tracking: Map<layer, Map<lightId, QueuedEffect>>
  private _effectQueue: Map<number, Map<string, QueuedEffect>> = new Map();
  private _layerLastUsed: Map<number, number> = new Map();
  private _blackoutLayersUnder: number = 200;
  private _lightTransitionController: LightTransitionController;
  
  // New property for storing layer states
  private _layerStates: Map<number, Map<string, RGBIO>> = new Map();

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
   * Gets the map of active effects per light per layer
   * @returns Map of layer numbers to maps of lightId to active effects
   */
  public getActiveEffects(): Map<number, Map<string, LightEffectState>> {
    return this._activeEffects;
  }

  /**
   * Gets the map of queued effects per light per layer
   * @returns Map of layer numbers to maps of lightId to queued effects
   */
  public getEffectQueue(): Map<number, Map<string, QueuedEffect>> {
    return this._effectQueue;
  }

  /**
   * Adds an active effect for a specific light on a layer
   * Populates the effect's lastEndState with appropriate state information
   * 
   * @param layer The layer number
   * @param lightId The light ID
   * @param effect The light effect state to add
   */
  public addActiveEffect(layer: number, lightId: string, effect: LightEffectState): void {
    // Initialize the layer map if it doesn't exist
    if (!this._activeEffects.has(layer)) {
      this._activeEffects.set(layer, new Map<string, LightEffectState>());
    }
    
    const layerMap = this._activeEffects.get(layer)!;
    
    // Initialize lastEndState if it doesn't exist
    if (!effect.lastEndState) {
      // Capture state for this specific light
      const capturedState = this.captureInitialStates(layer, [effect.transitions[0].lights[0]]);
      effect.lastEndState = capturedState.get(lightId);
    }
    
    // Store the effect for this light on this layer
    layerMap.set(lightId, effect);
    
    // Update layer last used timestamp
    this.setLayerLastUsed(layer, Date.now());
  }

  /**
   * Removes an active effect for a specific light from a layer
   * @param layer The layer number
   * @param lightId The light ID
   */
  public removeActiveEffect(layer: number, lightId: string): void {
    const layerMap = this._activeEffects.get(layer);
    if (layerMap) {
      if (lightId === 'all') {
        // Remove all effects on this layer
        this._activeEffects.delete(layer);
      } else {
        layerMap.delete(lightId);
        
        // If no more effects on this layer, remove the layer entry
        if (layerMap.size === 0) {
          this._activeEffects.delete(layer);
        }
      }
    }
  }

  /**
   * Gets an active effect for a specific light on a layer
   * @param layer The layer number
   * @param lightId The light ID
   * @returns The active effect for the light on the layer, or undefined
   */
  public getActiveEffect(layer: number, lightId: string): LightEffectState | undefined {
    const layerMap = this._activeEffects.get(layer);
    return layerMap?.get(lightId);
  }

  /**
   * Adds a queued effect for a specific light on a layer
   * @param layer The layer number
   * @param lightId The light ID
   * @param effect The queued effect to add
   */
  public addQueuedEffect(layer: number, lightId: string, effect: QueuedEffect): void {
    // Initialize the layer map if it doesn't exist
    if (!this._effectQueue.has(layer)) {
      this._effectQueue.set(layer, new Map<string, QueuedEffect>());
    }
    
    const layerMap = this._effectQueue.get(layer)!;
    layerMap.set(lightId, effect);
  }

  /**
   * Removes a queued effect for a specific light from a layer
   * @param layer The layer number
   * @param lightId The light ID
   */
  public removeQueuedEffect(layer: number, lightId: string): void {
    const layerMap = this._effectQueue.get(layer);
    if (layerMap) {
      if (lightId === 'all') {
        // Remove all queued effects on this layer
        this._effectQueue.delete(layer);
      } else {
        layerMap.delete(lightId);
        
        // If no more queued effects on this layer, remove the layer entry
        if (layerMap.size === 0) {
          this._effectQueue.delete(layer);
        }
      }
    }
  }

  /**
   * Gets a queued effect for a specific light on a layer
   * @param layer The layer number
   * @param lightId The light ID
   * @returns The queued effect for the light on the layer, or undefined
   */
  public getQueuedEffect(layer: number, lightId: string): QueuedEffect | undefined {
    const layerMap = this._effectQueue.get(layer);
    return layerMap?.get(lightId);
  }

  /**
   * Gets all layers that have active effects
   * @returns Array of layer numbers
   */
  public getAllLayers(): number[] {
    return Array.from(this._activeEffects.keys());
  }

  /**
   * Gets the blackout threshold layer number
   * @returns The layer number below which blackout affects
   */
  public getBlackoutLayersUnder(): number {
    return this._blackoutLayersUnder;
  }

  /**
   * Cleans up unused layers after a grace period
   * @param now The current timestamp
   */
  public cleanupUnusedLayers(now: number): void {
    const gracePeriod = 5000; // 5 seconds
    
    this._layerLastUsed.forEach((lastUsed, layer) => {
      if (now - lastUsed > gracePeriod) {
        // Check if there are any active effects on this layer
        const layerMap = this._activeEffects.get(layer);
        const hasActiveEffects = layerMap && layerMap.size > 0;
        
        // Check if there are any queued effects on this layer
        const queueMap = this._effectQueue.get(layer);
        const hasQueuedEffects = queueMap && queueMap.size > 0;
        
        if (!hasActiveEffects && !hasQueuedEffects) {
          // Remove the layer from tracking
          this._activeEffects.delete(layer);
          this._effectQueue.delete(layer);
          this._layerLastUsed.delete(layer);
          this._layerStates.delete(layer);
        }
      }
    });
  }

  /**
   * Gets the light transition controller
   * @returns The light transition controller instance
   */
  public getLightTransitionController(): LightTransitionController {
    return this._lightTransitionController;
  }

  /**
   * Gets all active effects for a specific light across all layers
   * @param lightId The light ID
   * @returns Map of layer numbers to light effect states
   */
  public getActiveEffectsForLight(lightId: string): Map<number, LightEffectState> {
    const lightEffects = new Map<number, LightEffectState>();
    
    this._activeEffects.forEach((layerMap, layer) => {
      const effect = layerMap.get(lightId);
      if (effect) {
        lightEffects.set(layer, effect);
      }
    });
    
    return lightEffects;
  }

  /**
   * Checks if a layer is free for a specific light (no active or queued effects)
   * @param layer The layer number
   * @param lightId The light ID
   * @returns True if the layer is free for the light
   */
  public isLayerFreeForLight(layer: number, lightId: string): boolean {
    const hasActiveEffect = this._activeEffects.get(layer)?.has(lightId) || false;
    const hasQueuedEffect = this._effectQueue.get(layer)?.has(lightId) || false;
    return !hasActiveEffect && !hasQueuedEffect;
  }

  /**
   * Checks if a layer is completely free (no active or queued effects for any light)
   * @param layer The layer number
   * @returns True if the layer is completely free
   */
  public isLayerFree(layer: number): boolean {
    const activeEffects = this._activeEffects.get(layer);
    const queuedEffects = this._effectQueue.get(layer);
    
    const hasActiveEffects = activeEffects && activeEffects.size > 0;
    const hasQueuedEffects = queuedEffects && queuedEffects.size > 0;
    
    return !hasActiveEffects && !hasQueuedEffects;
  }

  /**
   * Captures the initial states for lights on a layer when a new effect is starting.
   * This ensures smooth transitions from current state to new effect state.
   * 
   * @param layer The layer to capture states for
   * @param lights The lights to capture state for
   * @returns A map of light IDs to their current states
   */
  public captureInitialStates(layer: number, lights: TrackedLight[]): Map<string, RGBIO> {
    const stateMap = new Map<string, RGBIO>();
    
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
            red: 0,
            green: 0,
            blue: 0,
            intensity: 0,
            opacity: 1.0,
            blendMode: 'replace'
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
      this._layerStates.set(layer, new Map<string, RGBIO>());
    }

    const layerStates = this._layerStates.get(layer)!;

    lights.forEach(light => {
      // First try to get the target state from the active effect (what it was trying to achieve)
      const activeEffect = this.getActiveEffect(layer, light.id);
      if (activeEffect && activeEffect.lastEndState) {
        // Use the effect's target state, not the current interpolated state
        layerStates.set(light.id, { ...activeEffect.lastEndState });
      }
      // Fallback to current state if no target state available
      else {
        const currentState = this._lightTransitionController.getLightState(light.id, layer);
        if (currentState) {
          // Store deep copy of state
          layerStates.set(light.id, { ...currentState });
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
  public getLightState(layer: number, lightId: string): RGBIO | undefined {
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

  /**
   * Clears all active effects across all layers
   */
  public clearAllActiveEffects(): void {
    this._activeEffects.clear();
  }

  /**
   * Clears all queued effects across all layers
   */
  public clearAllQueuedEffects(): void {
    this._effectQueue.clear();
  }

  /**
   * Clears all layer states across all layers
   */
  public clearAllLayerStates(): void {
    this._layerStates.clear();
  }

  /**
   * Clears all layer tracking timestamps
   */
  public clearAllLayerTracking(): void {
    this._layerLastUsed.clear();
  }
}
