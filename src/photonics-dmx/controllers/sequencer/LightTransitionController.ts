import { performance } from 'perf_hooks';
import {
  RGBIP,
  Transition,
} from '../../types';

import {
  getEasingFunction
} from '../../easing';

import { LightStateManager } from './LightStateManager';

/**
 * Holds data for each layer's transition on a specific light.
 */
type TransitionData = {
  layer: number;
  startState: RGBIP;
  endState: RGBIP;
  startTime: number;
  transition: Transition;  // transform info, etc.
};

/**
 * The LightTransitionController handles the effect layering and 
 * transitions. Each animation cycle it interpolates
 * per-layer colours, merges them, and sets the compiled colour state 
 * in the Light State Manager.
 */
export class LightTransitionController {
  private _lightStateManager: LightStateManager;

  /**
   * Stores ongoing transitions for each (lightId, layer).
   */
  private _transitionsByLight: Map<string, Map<number, TransitionData>>;

  /**
   * Tracks the per-layer interpolated colour for each light. 
   */
  private _currentLayerStates: Map<string, Map<number, RGBIP>>;

  /**
   * The final merged color per light, after layering. 
   */
  private _finalColors: Map<string, RGBIP>;

  /**
   * An interval for the main animation loop, ~60fps.
   */
  private _animationIntervalId: NodeJS.Timeout | null = null;

  private _transitionLock = false;

  constructor(lightStateManager: LightStateManager) {
    this._lightStateManager = lightStateManager;
    this._transitionsByLight = new Map();
    this._currentLayerStates = new Map();
    this._finalColors = new Map();

    this.startAnimationLoop();
  }

  /**
   * Starts the update loop for transitions and layer merges.
   */
  private startAnimationLoop(): void {
    if (!this._animationIntervalId) {
      this._animationIntervalId = setInterval(() => {
        this.updateTransitions();
      }, 1000 / 60);
    }
  }

  /**
   * Stops the animation loop.
   */
  private stopAnimationLoop(): void {
    if (this._animationIntervalId) {
      clearInterval(this._animationIntervalId);
      this._animationIntervalId = null;
    }
  }

  /**
   * Sets a transition for a specific light and layer
   * @param lightId The ID of the light
   * @param layer The layer number
   * @param startState The start state of the transition (or undefined to use current state)
   * @param endState The end state of the transition
   * @param duration The duration of the transition in milliseconds
   * @param easing The easing function to use
   * @param initialState Optional override for the start state (useful for continuing from last state)
   */
  public setTransition(
    lightId: string,
    layer: number,
    startState: RGBIP | undefined,
    endState: RGBIP,
    duration: number,
    easing: string,
    initialState?: RGBIP
  ): void {
    // Initialize our map for this light if it doesn't exist
    if (!this._transitionsByLight.has(lightId)) {
      this._transitionsByLight.set(lightId, new Map<number, TransitionData>());
    }

    // Get the current light state if startState is undefined
    let effectiveStartState: RGBIP;
    if (initialState) {
      // If we have an initial state override, use that
      effectiveStartState = { ...initialState };
    } else if (startState) {
      // If we have a specified start state, use that
      effectiveStartState = { ...startState };
    } else {
      // Otherwise use current state if available, or default to black
      const currentState = this._currentLayerStates.get(lightId)?.get(layer);
      if (currentState) {
        effectiveStartState = { ...currentState };
      } else {
        // Create a default black RGBIP with all required properties
        effectiveStartState = {
          red: 0, rp: 0,
          green: 0, gp: 0,
          blue: 0, bp: 0,
          intensity: 0, ip: 0
        };
      }
    }

    // Prepare transition data
    const data: TransitionData = {
      layer,
      startState: effectiveStartState,
      endState: { ...endState },
      startTime: performance.now(),
      transition: {
        transform: {
          color: endState,
          duration,
          easing: easing
        },
        layer: layer
      }
    };

    // Set the transition, overwriting any existing one for this light and layer
    this._transitionsByLight.get(lightId)!.set(layer, data);
    
    // Update current layer state immediately to the start state
    if (!this._currentLayerStates.has(lightId)) {
      this._currentLayerStates.set(lightId, new Map<number, RGBIP>());
    }
    this._currentLayerStates.get(lightId)!.set(layer, { ...effectiveStartState });
  }

  /**
   * Removes all transitions for the specified layer from all lights.
   * This stops any animations on that layer.
   */
  public removeTransitionsByLayer(layer: number): void {
    this._transitionsByLight.forEach((layerMap) => {
      layerMap.delete(layer);
    });
    // Also remove from _currentLayerStates so getLightState
    // won't return stale data
    this._currentLayerStates.forEach((layerMap) => {
      layerMap.delete(layer);
    });
  }

  /**
   * Removes a specific layer from the given light.
   */
  public removeLightLayer(lightId: string, layer: number): void {
    const layerMap = this._transitionsByLight.get(lightId);
    if (layerMap) {
      layerMap.delete(layer);
    }
    const currentLayerMap = this._currentLayerStates.get(lightId);
    if (currentLayerMap) {
      currentLayerMap.delete(layer);
    }
  }

  /**
   * Removes all transitions for the given lights entirely.
   */
  public removeLights(lightIds: string[]): void {
    lightIds.forEach((id) => {
      this._transitionsByLight.delete(id);
      this._currentLayerStates.delete(id);
      this._finalColors.delete(id);
    });
  }

  /**
   * Returns the last interpolated color for the specified (light, layer).
   * If not found, returns a transparent (all 0) color instead of null.
   */
  public getLightState(lightId: string, layer: number): RGBIP {
    const layerMap = this._currentLayerStates.get(lightId);
    if (!layerMap) {
      return this.transparentColor();
    }
    const c = layerMap.get(layer);
    if (!c) {
      return this.transparentColor();
    }
    return c;
  }

  /**
   * Retrieves all unique light IDs that have transitions.
   */
  public getAllLightIds(): string[] {
    return Array.from(this._transitionsByLight.keys());
  }

  /**
   * Clears all transitions and merges, immediately forcing black states.
   */
  public immediateBlackout(): void {
    this._transitionsByLight.clear();
    this._currentLayerStates.clear();
    this._finalColors.clear();

    // Immediately push black to all known lights
    const allLightIds = this._lightStateManager.getTrackedLightIds();
    allLightIds.forEach(lightId => {
      // Get the current state to check if it has pan/tilt values
      const currentState = this._lightStateManager.getLightState(lightId);
      
      // Create a black state, only including pan/tilt if fixture uses them
      const blackState: RGBIP = {
        red: 0, rp: 0, 
        green: 0, gp: 0, 
        blue: 0, bp: 0, 
        intensity: 0, ip: 0
      };
      
      // Check if this fixture has pan/tilt
      if (currentState && (currentState.pan !== undefined || currentState.tilt !== undefined)) {
        // This fixture uses pan/tilt channels - preserve current values
        if (currentState.pan !== undefined) {
          blackState.pan = currentState.pan;
        }
        
        if (currentState.tilt !== undefined) {
          blackState.tilt = currentState.tilt;
        }
      }
      
      this._finalColors.set(lightId, blackState);
    });
    this.setFinalColors();
  }

  /**
   * Updates all active transitions.
   * This is called from the animation loop.
   * 
   * Process:
   *   1) Lock to prevent concurrent updates.
   *   2) Calculate new state for each transition.
   *   3) Mark completed transitions.
   *   4) Set final colour in LightStateManager.
   */
  private updateTransitions(): Promise<void> {
    return new Promise((resolve) => {
      if (this._transitionLock) {
        // If already processing transitions, queue this update for the next frame
        resolve();
        return;
      }

      this._transitionLock = true;

      try {
        const now = performance.now();

        // Track which lights have active transitions and need final color calculations
        const activeTransitionLights = new Set<string>();

        // Process all transitions by light
        this._transitionsByLight.forEach((layerTransitions, lightId) => {
          // Process transitions for this light by layer
          const perLightLayerStates = this._currentLayerStates.has(lightId) 
            ? this._currentLayerStates.get(lightId)!
            : new Map<number, RGBIP>();

          layerTransitions.forEach((transitionData, layer) => {
            const { startState, endState, startTime, transition } = transitionData;
            const elapsed = now - startTime;
            const duration = transition.transform.duration;
            
            // Calculate progress (0 to 1)
            const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 1;
            
            // Get the easing function
            const easing = transition.transform.easing;
            const easedProgress = this.getEasingValue(progress, easing);

            // Calculate the new state based on interpolation
            const newState: RGBIP = {
              red: this.interpolate(startState.red, endState.red, easedProgress),
              green: this.interpolate(startState.green, endState.green, easedProgress),
              blue: this.interpolate(startState.blue, endState.blue, easedProgress),
              intensity: this.interpolate(startState.intensity, endState.intensity, easedProgress),
              rp: this.interpolate(startState.rp, endState.rp, easedProgress),
              gp: this.interpolate(startState.gp, endState.gp, easedProgress),
              bp: this.interpolate(startState.bp, endState.bp, easedProgress),
              ip: this.interpolate(startState.ip, endState.ip, easedProgress),
            };

            // Handle optional properties
            if (startState.pan !== undefined || endState.pan !== undefined) {
              const startPan = startState.pan ?? endState.pan ?? 0;
              const endPan = endState.pan ?? startState.pan ?? 0;
              newState.pan = this.interpolate(startPan, endPan, easedProgress);
            }

            if (startState.tilt !== undefined || endState.tilt !== undefined) {
              const startTilt = startState.tilt ?? endState.tilt ?? 0;
              const endTilt = endState.tilt ?? startState.tilt ?? 0;
              newState.tilt = this.interpolate(startTilt, endTilt, easedProgress);
            }

            // Update the current state for this layer
            perLightLayerStates.set(layer, newState);
            
            // Mark this light as having an active transition
            activeTransitionLights.add(lightId);

            // If transition is complete, store its final state so future transitions start from it
            if (progress >= 1) {
              // Important: Set the startState to the final state for future transitions
              transitionData.startState = { ...endState };
            }
          });

          // Update the layer states with the new values
          this._currentLayerStates.set(lightId, perLightLayerStates);
        });

        // Calculate the final colors for all active lights
        activeTransitionLights.forEach(lightId => {
          this.calculateFinalColorForLight(lightId);
        });

        this._lightStateManager.publishLightStates();
      } finally {
        this._transitionLock = false;
        resolve();
      }
    });
  }

  /**
   * Helper method to get the easing function value
   */
  private getEasingValue(progress: number, easingName: string): number {
    // Use the centralized getEasingFunction helper
    const easingFn = getEasingFunction(easingName);
    return easingFn(progress);
  }

  /**
   * Publishes _finalColors to LightStateManager.
   */
  private setFinalColors(): void {
    this._finalColors.forEach((color, lightId) => {
      this._lightStateManager.setLightState(lightId, color);
    });
    this._lightStateManager.publishLightStates();
  }

  /**
   * Interpolate between start and end values based on progress
   */
  private interpolate(start: number, end: number, t: number): number {
    // Using Math.max to ensure the result is never negative
    return Math.max(0, Math.round(start + (end - start) * t));
  }

  /**
   * Priority acts like a layer transparency. 255 means the higher 
   * layer is used 100% and the lower layer(s) ignored.
   * A priority of less than 255 means the higher layer is 
   * blended on top of the layers below. 
   * Each channel has its own priority, including intensity which 
   * applies to the master dimmer.
   */
  private blendPriority(current: RGBIP, newState: RGBIP): RGBIP {
    // Special case for full ip priority
    if (newState.ip === 255 && newState.rp === 255 && newState.gp === 255 && newState.bp === 255) {
      return newState;
    }
    
    // Calculate alpha values for each channel based on its own priority
    const alphaRed = newState.rp / 255;
    const alphaGreen = newState.gp / 255;
    const alphaBlue = newState.bp / 255;
    const masterDimmerIntensity = newState.ip / 255;
    
    const out: RGBIP = {
      red: this.blendChannel(current.red, newState.red, alphaRed),
      rp: newState.rp,
      green: this.blendChannel(current.green, newState.green, alphaGreen),
      gp: newState.gp,
      blue: this.blendChannel(current.blue, newState.blue, alphaBlue),
      bp: newState.bp,
      intensity: this.blendChannel(current.intensity, newState.intensity, masterDimmerIntensity),
      ip: newState.ip,
    };
    
    if (newState.pan !== undefined) out.pan = newState.pan;
    if (newState.tilt !== undefined) out.tilt = newState.tilt;
    return out;
  }

  /**
   * Weighted channel blend
   */
  private blendChannel(oldVal: number, newVal: number, alpha: number): number {
    return Math.round(oldVal * (1 - alpha) + newVal * alpha);
  }

  /**
   * Returns a "transparent" color with all channels = 0.
   */
  private transparentColor(): RGBIP {
    return {
      red: 0, rp: 0,
      green: 0, gp: 0,
      blue: 0, bp: 0,
      intensity: 0, ip: 0
    };
  }

  /**
   * Clears all transitions, final colors, etc.
   */
  public resetLightStates(): void {
    // Force all lights to black state first
    const allLightIds = this._lightStateManager.getTrackedLightIds();
    const blackState: RGBIP = {
        red: 0, rp: 255,
        green: 0, gp: 255,
        blue: 0, bp: 255,
        intensity: 0, ip: 255
    };

    allLightIds.forEach(lightId => {
        this._lightStateManager.setLightState(lightId, blackState);
    });

    // Then clear all internal state
    this._transitionsByLight.clear();
    this._currentLayerStates.clear();
    this._finalColors.clear();
    
    // Ensure the black state is published
    this._lightStateManager.publishLightStates();
  }

  /**
   * Shuts down the LTC, stopping intervals and clearing data.
   */
  public shutdown(): void {
    this.stopAnimationLoop();
    this._transitionsByLight.clear();
    this._currentLayerStates.clear();
    this._finalColors.clear();
    console.log('LightTransitionController has been shut down.');
  }

  /**
   * Gets the final light state from the LightStateManager
   * This is the fully merged/flattened state of all layers
   * 
   * @param lightId The ID of the light to get the state for
   * @returns The final light state or null if not found
   */
  public getFinalLightState(lightId: string): RGBIP | null {
    return this._lightStateManager.getLightState(lightId);
  }

  /**
   * Gets all tracked light IDs directly from the LightStateManager
   * Helpful for debugging when no lights appear in the table
   * 
   * @returns Array of light IDs tracked by the LightStateManager
   */
  public getLightStateManagerTrackedLights(): string[] {
    return this._lightStateManager.getTrackedLightIds();
  }

  /**
   * Calculates the final color for a light by blending all active layers
   * @param lightId The ID of the light to calculate for
   */
  private calculateFinalColorForLight(lightId: string): void {
    if (!this._currentLayerStates.has(lightId)) {
      return;
    }

    const layerStates = this._currentLayerStates.get(lightId)!;
    let finalColor: RGBIP = this.transparentColor();
    
    // Convert Map to array, sort by layer number, then process
    const sortedLayers = Array.from(layerStates.entries())
      .sort(([layerA], [layerB]) => layerA - layerB);
      
    for (const [_, layerColor] of sortedLayers) {
      finalColor = this.blendPriority(finalColor, layerColor);
    }
    
    // Store the final color
    this._finalColors.set(lightId, finalColor);
    
    // Update the light state manager
    this._lightStateManager.setLightState(lightId, finalColor);
  }
}