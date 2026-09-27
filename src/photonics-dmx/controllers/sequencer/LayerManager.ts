import { ILayerManager, QueuedEffect, LightEffectState } from './interfaces'
import { LightTransitionController } from './LightTransitionController'
import { RGBIO, TrackedLight } from '../../types'
import { BLACKOUT_LAYER } from '../../constants/nodeConstants'

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
 *
 * Layer conventions:
 * - Layer 0: Base layer (preserved by design)
 * - Layers 1-99: Standard effect layers
 * - Layers 100+: High priority "flash" layers
 * - Layer 200: Strobe effects
 * - Layer 254: the top layer a cue draws on, where the bundled strobe cues flash
 * - Layer 255: Blackout layer, which the sequencer refuses any submission on
 *
 */
export class LayerManager implements ILayerManager {
  // Per-light effect tracking: Map<layer, Map<lightId, LightEffectState>>
  private _activeEffects: Map<number, Map<string, LightEffectState>> = new Map()
  // Per-light queue tracking: Map<layer, Map<lightId, QueuedEffect>>
  private _effectQueue: Map<number, Map<string, QueuedEffect>> = new Map()
  private _layerLastUsed: Map<number, number> = new Map()
  private _blackoutLayersUnder: number = BLACKOUT_LAYER
  private _lightTransitionController: LightTransitionController

  /**
   * Creates a new LayerManager instance
   * @param lightTransitionController The light transition controller
   */
  constructor(lightTransitionController: LightTransitionController) {
    this._lightTransitionController = lightTransitionController
  }

  /**
   * Records when a layer was last used
   * @param layer The layer number
   * @param time The timestamp when the layer was used
   */
  public setLayerLastUsed(layer: number, time: number): void {
    this._layerLastUsed.set(layer, time)
  }

  /**
   * Gets the map of active effects per light per layer
   * @returns Map of layer numbers to maps of lightId to active effects
   */
  public getActiveEffects(): Map<number, Map<string, LightEffectState>> {
    return this._activeEffects
  }

  /**
   * Gets the map of queued effects per light per layer
   * @returns Map of layer numbers to maps of lightId to queued effects
   */
  public getEffectQueue(): Map<number, Map<string, QueuedEffect>> {
    return this._effectQueue
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
      this._activeEffects.set(layer, new Map<string, LightEffectState>())
    }

    const layerMap = this._activeEffects.get(layer)!

    // Initialize lastEndState if it doesn't exist
    if (!effect.lastEndState) {
      // Capture state for this specific light
      const capturedState = this.captureInitialStates(layer, [effect.transitions[0].lights[0]])
      effect.lastEndState = capturedState.get(lightId)
    }

    // Store the effect for this light on this layer
    layerMap.set(lightId, effect)

    // Update layer last used timestamp
    this.setLayerLastUsed(layer, performance.now())
  }

  /**
   * Removes an active effect for a specific light from a layer
   * @param layer The layer number
   * @param lightId The light ID
   */
  public removeActiveEffect(layer: number, lightId: string): void {
    const layerMap = this._activeEffects.get(layer)
    if (layerMap) {
      if (lightId === 'all') {
        // Remove all effects on this layer
        this._activeEffects.delete(layer)
      } else {
        layerMap.delete(lightId)

        // If no more effects on this layer, remove the layer entry
        if (layerMap.size === 0) {
          this._activeEffects.delete(layer)
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
    const layerMap = this._activeEffects.get(layer)
    return layerMap?.get(lightId)
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
      this._effectQueue.set(layer, new Map<string, QueuedEffect>())
    }

    const layerMap = this._effectQueue.get(layer)!
    layerMap.set(lightId, effect)
  }

  /**
   * Removes a queued effect for a specific light from a layer
   * @param layer The layer number
   * @param lightId The light ID
   */
  public removeQueuedEffect(layer: number, lightId: string): void {
    const layerMap = this._effectQueue.get(layer)
    if (layerMap) {
      if (lightId === 'all') {
        // Remove all queued effects on this layer
        this._effectQueue.delete(layer)
      } else {
        layerMap.delete(lightId)

        // If no more queued effects on this layer, remove the layer entry
        if (layerMap.size === 0) {
          this._effectQueue.delete(layer)
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
    const layerMap = this._effectQueue.get(layer)
    return layerMap?.get(lightId)
  }

  /**
   * Gets all layers that have active effects
   * @returns Array of layer numbers
   */
  public getAllLayers(): number[] {
    return Array.from(this._activeEffects.keys())
  }

  /**
   * Gets the blackout threshold layer number
   * @returns The layer number below which blackout affects
   */
  public getBlackoutLayersUnder(): number {
    return this._blackoutLayersUnder
  }

  /**
   * Cleans up unused layers after a grace period
   * @param now The current timestamp
   */
  public cleanupUnusedLayers(now: number): void {
    const gracePeriod = 5000 // 5 seconds

    this._layerLastUsed.forEach((lastUsed, layer) => {
      if (now - lastUsed > gracePeriod) {
        // Check if there are any active effects on this layer
        const layerMap = this._activeEffects.get(layer)
        const hasActiveEffects = layerMap && layerMap.size > 0

        // Check if there are any queued effects on this layer
        const queueMap = this._effectQueue.get(layer)
        const hasQueuedEffects = queueMap && queueMap.size > 0

        if (!hasActiveEffects && !hasQueuedEffects) {
          // Remove the layer from tracking
          this._activeEffects.delete(layer)
          this._effectQueue.delete(layer)
          this._layerLastUsed.delete(layer)
        }
      }
    })
  }

  /**
   * Gets the light transition controller
   * @returns The light transition controller instance
   */
  public getLightTransitionController(): LightTransitionController {
    return this._lightTransitionController
  }

  /**
   * Gets all active effects for a specific light across all layers
   * @param lightId The light ID
   * @returns Map of layer numbers to light effect states
   */
  public getActiveEffectsForLight(lightId: string): Map<number, LightEffectState> {
    const lightEffects = new Map<number, LightEffectState>()

    this._activeEffects.forEach((layerMap, layer) => {
      const effect = layerMap.get(lightId)
      if (effect) {
        lightEffects.set(layer, effect)
      }
    })

    return lightEffects
  }

  /**
   * Checks if a layer is free for a specific light (no active or queued effects)
   * @param layer The layer number
   * @param lightId The light ID
   * @returns True if the layer is free for the light
   */
  public isLayerFreeForLight(layer: number, lightId: string): boolean {
    const hasActiveEffect = this._activeEffects.get(layer)?.has(lightId) || false
    const hasQueuedEffect = this._effectQueue.get(layer)?.has(lightId) || false
    return !hasActiveEffect && !hasQueuedEffect
  }

  /**
   * Checks if a layer is completely free (no active or queued effects for any light)
   * @param layer The layer number
   * @returns True if the layer is completely free
   */
  public isLayerFree(layer: number): boolean {
    const activeEffects = this._activeEffects.get(layer)
    const queuedEffects = this._effectQueue.get(layer)

    const hasActiveEffects = activeEffects && activeEffects.size > 0
    const hasQueuedEffects = queuedEffects && queuedEffects.size > 0

    return !hasActiveEffects && !hasQueuedEffects
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
    const stateMap = new Map<string, RGBIO>()

    lights.forEach((light) => {
      const currentState = this._lightTransitionController.getLightState(light.id, layer)
      if (currentState) {
        stateMap.set(light.id, { ...currentState })
      } else {
        // Default to transparent if no current state exists
        stateMap.set(light.id, this.transparentState())
      }
    })

    return stateMap
  }

  private transparentState(): RGBIO {
    return {
      red: 0,
      green: 0,
      blue: 0,
      intensity: 0,
      opacity: 0,
      blendMode: 'replace',
    }
  }

  /**
   * Removes the layer from tracking when a layer is explicitly cleared.
   * @param layer The layer to reset tracking for
   */
  public resetLayerTracking(layer: number): void {
    // Don't track layer 0 as it's special
    if (layer === 0) return

    // Remove the layer from tracking
    if (this._layerLastUsed.has(layer)) {
      this._layerLastUsed.delete(layer)
    }
  }

  /**
   * Clears all active effects across all layers
   */
  public clearAllActiveEffects(): void {
    this._activeEffects.clear()
  }

  /**
   * Clears all queued effects across all layers
   */
  public clearAllQueuedEffects(): void {
    this._effectQueue.clear()
  }

  /**
   * Clears all layer tracking timestamps
   */
  public clearAllLayerTracking(): void {
    this._layerLastUsed.clear()
  }
}
