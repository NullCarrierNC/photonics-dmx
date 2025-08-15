import { IDebugMonitor, ILayerManager } from './interfaces';
import { LightTransitionController } from './LightTransitionController';

/**
 * @class DebugMonitor
 * @description Console logs a table of the active light states and effects
 */
export class DebugMonitor implements IDebugMonitor {
  private lightTransitionController: LightTransitionController;
  private layerManager: ILayerManager;
  private _debugInterval: NodeJS.Timeout | null = null;
  private _debugEnabled: boolean = false;
  private _lastDebugRefresh: number = 0;
  private _debugRefreshRate: number = 2000; // Time in ms

  /**
   * @constructor
   * @param lightTransitionController The underlying transition controller
   * @param layerManager The layer manager instance
   */
  constructor(
    lightTransitionController: LightTransitionController,
    layerManager: ILayerManager
  ) {
    this.lightTransitionController = lightTransitionController;
    this.layerManager = layerManager;
  }

  /**
   * Enables or disables the real-time debug table
   * @param enable Whether to enable the debug table
   * @param refreshRateMs Optional refresh rate in milliseconds (default: 1000ms)
   */
  public enableDebug(enable: boolean, refreshRateMs?: number): void {
    this._debugEnabled = enable;
    
    // Clear any existing debug interval
    if (this._debugInterval) {
      clearInterval(this._debugInterval);
      this._debugInterval = null;
    }

    if (refreshRateMs !== undefined) {
      this._debugRefreshRate = refreshRateMs;
    } else if (enable) {
      this._debugRefreshRate = 1000;
    }
    
    // Start new debug interval if enabled
    if (this._debugEnabled) {
      console.log(`\n=== Real-time light layer debug ENABLED (refresh: ${this._debugRefreshRate}ms) ===\n`);
      
      // Force immediate debug output and reset timing
      this._lastDebugRefresh = 0;
      
      // Start the debug refresh interval
      this._debugInterval = setInterval(() => {
        this.refreshDebugTable();
      }, this._debugRefreshRate);
    } else {
      console.log('\n=== Light layer debug DISABLED ===\n');
    }
  }
  
  /**
   * Refreshes the debug table if enough time has passed since last refresh.
   */
  public refreshDebugTable(): void {
    const now = Date.now();
    // Ensure we don't refresh too frequently
    if (now - this._lastDebugRefresh > this._debugRefreshRate) {
      try {
        const timeString = new Date().toLocaleTimeString();
        console.log(`\n=== LIGHT LAYERS TABLE (${timeString}) ===`);
        
        // Get counts of active effects/transitions for monitoring
        const effectCount = this.layerManager.getActiveEffects().size;
        const lightIds = this.lightTransitionController.getAllLightIds().length;
        console.log(`Active effects: ${effectCount}, Light IDs: ${lightIds}`);
        
        // Check if any effects or lights are active
        if (effectCount === 0 && lightIds === 0) {
          console.log('WARNING: No effects or lights are active - debug table may be empty');
          
          // Check if LightStateManager has any lights when LTC doesn't
          const lsmLightIds = this.lightTransitionController.getLightStateManagerTrackedLights();
          if (lsmLightIds.length > 0) {
            console.log(`NOTICE: LightStateManager has ${lsmLightIds.length} tracked lights but none in LTC`);
            // Limit the output to avoid overwhelming logs
            if (lsmLightIds.length <= 10) {
              console.log(`Light IDs: ${lsmLightIds.join(', ')}`);
            } else {
              console.log(`Light IDs (first 10 of ${lsmLightIds.length}): ${lsmLightIds.slice(0, 10).join(', ')}...`);
            }
          }
        }
        
        // Print the actual table
        this.printLightLayerTable();
        this._lastDebugRefresh = now;
      } catch (error) {
        // Catch to avoid crashing the app if there's an error in debug logging
        console.error('Error in debug output:', error);
        this._lastDebugRefresh = now; // Still update to avoid rapid retries
      }
    }
  }

  /**
   * Prints a formatted table of the current light layer states.
   * Displays for each layer which lights are active and their RGBIP values.
   */
  public printLightLayerTable(): void {
    const lightIds = this.lightTransitionController.getAllLightIds();
    if (lightIds.length === 0) {
      console.log('No lights are currently active.');
      return;
    }

    // Get all layers from active effects
    const activeLayers = new Set<number>();
    this.layerManager.getActiveEffects().forEach((_, layer) => {
      activeLayers.add(layer);
    });

    // Create a sorted array of layer numbers
    const sortedLayers = Array.from(activeLayers).sort((a, b) => a - b);

    // Create a map to store light positions by ID
    const lightPositions = new Map<string, number>();
    
    this.layerManager.getActiveEffects().forEach((layerMap, layer) => {
      layerMap.forEach((effect, lightId) => {
        const light = effect.transitions[0].lights.find(l => l.id === lightId);
        if (light) {
          lightPositions.set(light.id, light.position);
        }
      });
    });

    // Sort the lights by position
    const sortedLights = [...lightIds].sort((a, b) => {
      const posA = lightPositions.get(a) || 999; 
      const posB = lightPositions.get(b) || 999;
      return posA - posB;
    });

    // Get transition and effect info
    const layerInfo = new Map<number, string[]>();
    this.layerManager.getActiveEffects().forEach((layerMap, layer) => {
      // For now, just get the first effect on this layer for display purposes
      const firstEffect = Array.from(layerMap.values())[0];
      if (firstEffect) {
        const transitionIndex = firstEffect.currentTransitionIndex;
        const totalTransitions = firstEffect.transitions.length;
        const state = firstEffect.state;
        const waitFor = transitionIndex < totalTransitions
          ? firstEffect.transitions[transitionIndex].waitFor
          : 'none';
        const waitUntil = transitionIndex < totalTransitions
          ? firstEffect.transitions[transitionIndex].waitUntil
          : 'none';
        
        layerInfo.set(layer, [
          firstEffect.name,
          `${transitionIndex + 1}/${totalTransitions}`,
          state,
          waitFor,
          waitUntil
        ]);
      }
    });

    // Define fixed width for table columns for formatting
    const layerWidth = 5;
    const effectNameWidth = 20;
    const progressWidth = 8;
    const stateWidth = 12;
    const waitForWidth = 10;
    const waitUntilWidth = 10;
    let lightColWidth = 24; // Width for RGBIP value display
    
    // Check all RGBIP strings to ensure lightColWidth is sufficient
    // This prevents negative values in String.repeat() calls
    this.layerManager.getActiveEffects().forEach((lightMap, _layer) => {
      lightMap.forEach((_, lightId) => {
        for (const layerNum of sortedLayers) {
          const state = this.lightTransitionController.getLightState(lightId, layerNum);
          if (state) {
            const rgbip = `R:${state.red.toString().padStart(3)},G:${state.green.toString().padStart(3)},B:${state.blue.toString().padStart(3)},I:${state.intensity.toString().padStart(3)}`;
            // Add 4 for padding (2 on each side) + 2 for safety
            lightColWidth = Math.max(lightColWidth, rgbip.length + 6);
          }
        }
        
        // Also check final state
        const finalState = this.lightTransitionController.getFinalLightState(lightId);
        if (finalState) {
          const rgbip = `R:${finalState.red.toString().padStart(3)},G:${finalState.green.toString().padStart(3)},B:${finalState.blue.toString().padStart(3)},I:${finalState.intensity.toString().padStart(3)}`;
          // Add 4 for padding (2 on each side) + 2 for safety
          lightColWidth = Math.max(lightColWidth, rgbip.length + 6);
        }
      });
    });
    
    // Calculate total width including separators
    const effectInfoWidth = layerWidth + 3 + effectNameWidth + 3 + progressWidth + 3 + stateWidth + 3 + waitForWidth + 3 + waitUntilWidth + 3; // Width of info columns with separators
    const tableWidth = effectInfoWidth + (sortedLights.length * (lightColWidth + 3)); // +3 for each " | "
    
    // Create and print formatted table with restructured layout
    console.log('\nLight Layer States:');
    console.log('-'.repeat(tableWidth));
    
    // Print header row with light positions and effect info columns
    let header = `Layer | Effect Name${' '.repeat(Math.max(0, effectNameWidth - 11))} | Progress | State${' '.repeat(Math.max(0, stateWidth - 5))} | Wait For${' '.repeat(Math.max(0, waitForWidth - 8))} | Wait Until${' '.repeat(Math.max(0, waitUntilWidth - 10))} | `;
    sortedLights.forEach(lightId => {
      const position = lightPositions.get(lightId) || '?';
      header += `Light ${position.toString().padStart(2)}${' '.repeat(Math.max(0, lightColWidth - 8))} | `;
    });
    console.log(header);
    console.log('-'.repeat(tableWidth));

    // For each layer, print the effect info and RGBIP values for each light
    for (const layer of sortedLayers) {
      const info = layerInfo.get(layer) || ['unknown', '?/?', 'unknown', 'unknown', 'unknown'];
      let row = `${layer.toString().padStart(layerWidth)} | `;
      
      // Add effect information with consistent width
      row += `${info[0].padEnd(effectNameWidth)} | `;
      row += `${info[1].padEnd(progressWidth)} | `;
      row += `${info[2].padEnd(stateWidth)} | `;
      row += `${info[3].padEnd(waitForWidth)} | `;
      row += `${info[4].padEnd(waitUntilWidth)} | `;
      
      // Add light state information
      for (const lightId of sortedLights) {
        const state = this.lightTransitionController.getLightState(lightId, layer);
        if (state) {
          const rgbip = `R:${state.red.toString().padStart(3)},G:${state.green.toString().padStart(3)},B:${state.blue.toString().padStart(3)},I:${state.intensity.toString().padStart(3)}`;
          row += `  ${rgbip}${' '.repeat(Math.max(0, lightColWidth - rgbip.length - 2))}| `;
        } else {
          row += `${' '.repeat(lightColWidth)}| `;
        }
      }
      
      console.log(row);
    }
    
    // Add a separator before the final row
    console.log('-'.repeat(tableWidth));
    
    // Add a final row showing the calculated final state for each light
    let finalRow = `${'-'.repeat(layerWidth)} | `;
    finalRow += `${'FINAL COLOUR'.padEnd(effectNameWidth)} | `;
    finalRow += `${'-'.repeat(progressWidth)} | `;
    finalRow += `${'-'.repeat(stateWidth)} | `;
    finalRow += `${'-'.repeat(waitForWidth)} | `;
    finalRow += `${'-'.repeat(waitUntilWidth)} | `;
    
    for (const lightId of sortedLights) {
      const finalState = this.lightTransitionController.getFinalLightState(lightId);
      if (finalState) {
        const rgbip = `R:${finalState.red.toString().padStart(3)},G:${finalState.green.toString().padStart(3)},B:${finalState.blue.toString().padStart(3)},I:${finalState.intensity.toString().padStart(3)}`;
        finalRow += `  ${rgbip}${' '.repeat(Math.max(0, lightColWidth - rgbip.length - 2))}| `;
      } else {
        finalRow += `${' '.repeat(lightColWidth)}| `;
      }
    }
    
    console.log(finalRow);
    console.log('-'.repeat(tableWidth));
  }

  /**
   * Prints detailed debug information about light layers
   */
  public debugLightLayers(): void {
    console.log('\n=== LIGHT LAYERS DEBUG ===');
    
    // Get all light IDs
    const lightIds = this.lightTransitionController.getAllLightIds();
    console.log(`Found ${lightIds.length} lights`);
    
    for (const lightId of lightIds) {
      console.log(`\nLight: ${lightId}`);
      
      // Get all layers for this light by checking each layer
      const layers: number[] = [];
      this.layerManager.getActiveEffects().forEach((_, layer) => {
        const state = this.lightTransitionController.getLightState(lightId, layer);
        if (state) {
          layers.push(layer);
        }
      });
      
      console.log(`  Active Layers: ${layers.join(', ')}`);
      
      // Get the final computed state
      const finalState = this.lightTransitionController.getFinalLightState(lightId);
      if (finalState) {
        console.log(`  Final State: R:${finalState.red}, G:${finalState.green}, B:${finalState.blue}, I:${finalState.intensity}`);
        if (finalState.pan !== undefined) {
          console.log(`  Pan/Tilt: ${finalState.pan}/${finalState.tilt}`);
        }
      } else {
        console.log('  No final state available');
      }
      
      // Print per-layer information
      console.log('  Layer States:');
      for (const layer of layers) {
        const layerState = this.lightTransitionController.getLightState(lightId, layer);
        if (layerState) {
          console.log(`    Layer ${layer}: R:${layerState.red}, G:${layerState.green}, B:${layerState.blue}, I:${layerState.intensity}`);
        }
      }
    }
    
    // Print active effects information
    console.log('\nActive Effects:');
    this.layerManager.getActiveEffects().forEach((lightMap, layer) => {
      lightMap.forEach((effect, lightId) => {
        console.log(`  Layer ${layer}, Light ${lightId}: ${effect.name} (${effect.currentTransitionIndex + 1}/${effect.transitions.length})`);
        console.log(`    State: ${effect.state}`);
        console.log(`    Light: ${lightId}`);
      });
    });
    
    // Print queued effects
    console.log('\nQueued Effects:');
    this.layerManager.getEffectQueue().forEach((lightMap, layer) => {
      lightMap.forEach((effect, lightId) => {
        console.log(`  Layer ${layer}, Light ${lightId}: ${effect.name} (Persistent: ${effect.isPersistent})`);
      });
    });
  }
}
