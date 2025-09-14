import {
  RGBIO,
  Transition,
} from '../../types';

import {
  getEasingFunction
} from '../../easing';

import { LightStateManager } from './LightStateManager';
import { Clock } from './Clock';

/**
 * Holds data for each layer's transition on a specific light.
 */
type TransitionData = {
  layer: number;
  startState: RGBIO;
  endState: RGBIO;
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
  private _currentLayerStates: Map<string, Map<number, RGBIO>>;

  /**
   * The final merged color per light, after layering. 
   */
  private _finalColors: Map<string, RGBIO>;

  private _transitionLock = false;
  private clock: Clock | null = null;
  private updateCallback: (deltaTime: number) => void;
  private accumulatedTime: number = 0;

  constructor(lightStateManager: LightStateManager) {
    this._lightStateManager = lightStateManager;
    this._transitionsByLight = new Map();
    this._currentLayerStates = new Map();
    this._finalColors = new Map();
    
    // Create the update callback bound to this instance
    this.updateCallback = this.updateTransitions.bind(this);
  }

  /**
   * Register this component with the clock
   * @param clock The clock instance
   */
  public registerWithClock(clock: Clock): void {
    this.clock = clock;
    // Initialize accumulated time with current clock time for consistency
    this.accumulatedTime = clock.getCurrentTimeMs();
    clock.onTick(this.updateCallback);
  }

  /**
   * Unregister from the clock
   */
  public unregisterFromClock(): void {
    if (this.clock) {
      this.clock.offTick(this.updateCallback);
      this.clock = null;
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
    startState: RGBIO | undefined,
    endState: RGBIO,
    duration: number,
    easing: string,
    initialState?: RGBIO
  ): void {
    // Initialize our map for this light if it doesn't exist
    if (!this._transitionsByLight.has(lightId)) {
      this._transitionsByLight.set(lightId, new Map<number, TransitionData>());
    }

    // Get the current light state if startState is undefined
    let effectiveStartState: RGBIO;
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
        // Create a default black RGBIP
        effectiveStartState = {
          red: 0,
          green: 0,
          blue: 0,
          intensity: 0,
          opacity: 0.0,
          blendMode: 'replace'
        };
      }
    }

    // Prepare transition data
    const data: TransitionData = {
      layer,
      startState: effectiveStartState,
      endState: { ...endState },
      startTime: this.clock ? this.clock.getCurrentTimeMs() : this.accumulatedTime,
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
      this._currentLayerStates.set(lightId, new Map<number, RGBIO>());
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
  public getLightState(lightId: string, layer: number): RGBIO {
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
      const blackState: RGBIO = {
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 0.0,
        blendMode: 'replace'
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
   * Update method called by the clock
   * 
   * This method:
   *   1) Processes all active transitions using deltaTime.
   *   2) Interpolates per-layer colours based on elapsed time.
   *   3) Merges layer colours using blend modes.
   *   4) Set final colour in LightStateManager.
   * 
   * @param deltaTime The time elapsed since last update in milliseconds
   */
  private updateTransitions(deltaTime: number): Promise<void> {
    return new Promise((resolve) => {
      if (this._transitionLock) {
        // If already processing transitions, queue this update for the next frame
        resolve();
        return;
      }

      this._transitionLock = true;

      try {
        // Accumulate delta time for smooth transitions
        this.accumulatedTime += deltaTime;
        
        // Track which lights have active transitions and need final color calculations
        const activeTransitionLights = new Set<string>();

        // Process all transitions by light
        this._transitionsByLight.forEach((layerTransitions, lightId) => {
          // Process transitions for this light by layer
          const perLightLayerStates = this._currentLayerStates.has(lightId) 
            ? this._currentLayerStates.get(lightId)!
            : new Map<number, RGBIO>();

          layerTransitions.forEach((transitionData, layer) => {
            const { startState, endState, startTime, transition } = transitionData;
            
            // Use accumulated time from Clock system for consistent timing
            const elapsed = this.accumulatedTime - startTime;
            const duration = transition.transform.duration;
            
            // Calculate progress (0 to 1)
            const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 1;
            
            // Get the easing function
            const easing = transition.transform.easing;
            const easedProgress = this.getEasingValue(progress, easing);

            // Calculate the new state based on interpolation
            const newState: RGBIO = {
              red: this.interpolate(startState.red, endState.red, easedProgress),
              green: this.interpolate(startState.green, endState.green, easedProgress),
              blue: this.interpolate(startState.blue, endState.blue, easedProgress),
              intensity: this.interpolate(startState.intensity, endState.intensity, easedProgress),
              opacity: endState.opacity,
              blendMode: endState.blendMode,
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
   * Blends colors using opacity and blend modes
   */
  private blendWithOpacity(current: RGBIO, newState: RGBIO): RGBIO {
    const opacity = newState.opacity ?? 1.0;
    const blendMode = newState.blendMode ?? 'replace';
    
    const out: RGBIO = {
      red: 0,
      green: 0,
      blue: 0,
      intensity: 0,
      opacity: 1.0, // Final result should always be fully opaque
      blendMode: blendMode,
    };
    
    // Apply blend mode per channel
    switch (blendMode) {
      case 'replace':
        // For replace mode: opacity controls the intensity of the replacement color
        // When opacity = 0.0: layer is transparent, show underlying color
        // When opacity = 1.0: layer completely replaces underlying color at full intensity
        // When opacity = 0.5: layer completely replaces underlying color at 50% intensity
        if (opacity <= 0.0) {
          // Transparent layer - show underlying color
          out.red = current.red;
          out.green = current.green;
          out.blue = current.blue;
          out.intensity = current.intensity;
        } else {
          // Any opacity > 0 means the layer replaces the underlying color
          // The opacity controls the intensity of the replacement
          out.red = Math.round(newState.red * opacity);
          out.green = Math.round(newState.green * opacity);
          out.blue = Math.round(newState.blue * opacity);
          out.intensity = Math.round(newState.intensity * opacity);
        }
        break;
        
      case 'add':
        if (opacity <= 0.0) {
          // Transparent layer - show underlying color
          out.red = current.red;
          out.green = current.green;
          out.blue = current.blue;
          out.intensity = current.intensity;
        } else if (opacity >= 1.0) {
          // Fully opaque - add colors together
          out.red = Math.min(255, current.red + newState.red);
          out.green = Math.min(255, current.green + newState.green);
          out.blue = Math.min(255, current.blue + newState.blue);
          out.intensity = Math.min(255, current.intensity + newState.intensity);
        } else {
          // Partial opacity - add the scaled color to the underlying color
          out.red = Math.min(255, current.red + Math.round(newState.red * opacity));
          out.green = Math.min(255, current.green + Math.round(newState.green * opacity));
          out.blue = Math.min(255, current.blue + Math.round(newState.blue * opacity));
          out.intensity = Math.min(255, current.intensity + Math.round(newState.intensity * opacity));
        }
        break;
        
      case 'multiply':
        out.red = Math.round((current.red * newState.red * opacity) / 255);
        out.green = Math.round((current.green * newState.green * opacity) / 255);
        out.blue = Math.round((current.blue * newState.blue * opacity) / 255);
        out.intensity = Math.round((current.intensity * newState.intensity * opacity) / 255);
        break;
        
      case 'overlay':
        out.red = this.blendOverlay(current.red, newState.red, opacity);
        out.green = this.blendOverlay(current.green, newState.green, opacity);
        out.blue = this.blendOverlay(current.blue, newState.blue, opacity);
        out.intensity = this.blendOverlay(current.intensity, newState.intensity, opacity);
        break;
    }
    
    // Handle optional properties
    if (newState.pan !== undefined) out.pan = newState.pan;
    if (newState.tilt !== undefined) out.tilt = newState.tilt;
    
    return out;
  }
  



  /**
   * Overlay blend mode - combines multiply and screen blending
   */
  private blendOverlay(base: number, blend: number, opacity: number): number {
    const normalizedBlend = blend / 255;
    const normalizedBase = base / 255;
    
    let result: number;
    if (normalizedBase < 0.5) {
      // Multiply blend for dark areas
      result = 2 * normalizedBase * normalizedBlend;
    } else {
      // Screen blend for light areas
      result = 1 - 2 * (1 - normalizedBase) * (1 - normalizedBlend);
    }
    
    // Apply opacity and convert back to 0-255 range
    return Math.round(result * 255 * opacity);
  }

  /**
   * Returns a "transparent" color with all channels = 0.
   */
  private transparentColor(): RGBIO {
    return {
      red: 0,
      green: 0,
      blue: 0,
      intensity: 0,
      opacity: 0.0,
      blendMode: 'replace'
    };
  }

  /**
   * Clears all transitions, final colors, etc.
   */
  public resetLightStates(): void {
    // Force all lights to black state first
    const allLightIds = this._lightStateManager.getTrackedLightIds();
    const blackState: RGBIO = {
        red: 0,
        green: 0,
        blue: 0,
        intensity: 0,
        opacity: 1.0,
        blendMode: 'replace'
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
    this.unregisterFromClock();
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
  public getFinalLightState(lightId: string): RGBIO | null {
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
    let finalColor: RGBIO = this.transparentColor();
    
    // Convert Map to array, sort by layer number, then process
    const sortedLayers = Array.from(layerStates.entries())
      .sort(([layerA], [layerB]) => layerA - layerB);
      
    for (const [_, layerColor] of sortedLayers) {
      finalColor = this.blendWithOpacity(finalColor, layerColor);
    }
    
    // Store the final color
    this._finalColors.set(lightId, finalColor);
    
    // Update the light state manager
    this._lightStateManager.setLightState(lightId, finalColor);
  }

  /**
   * Get the current accumulated time from the Clock system
   * Useful for debugging timing issues
   */
  public getAccumulatedTime(): number {
    return this.accumulatedTime;
  }

  /**
   * Reset the accumulated time counter
   * Useful when you want to reset timing state or force immediate processing
   */
  public resetAccumulatedTime(): void {
    this.accumulatedTime = 0;
  }

  /**
   * Get the current time from the Clock system
   * Falls back to accumulated time if clock is not available
   */
  public getCurrentTime(): number {
    return this.clock ? this.clock.getCurrentTimeMs() : this.accumulatedTime;
  }
}