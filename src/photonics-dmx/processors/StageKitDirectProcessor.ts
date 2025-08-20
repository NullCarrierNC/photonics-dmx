/**
 * StageKitDirectProcessor - Direct StageKit light data to DMX mapping
 * 
 * This processor receives StageKit data and maps it directly to DMX lights
 * using setState for direct control.
 * 
 * StageKit has 4 color banks (Blue, Green, Yellow, Red) with 8 positions each.
 * The processor receives already-parsed position arrays and color strings.
 */
import { EventEmitter } from 'events';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { StageKitLightMapper } from './StageKitLightMapper';
import { StageKitConfig, DEFAULT_STAGEKIT_CONFIG } from '../listeners/RB3/StageKitTypes';
import { getColor } from '../helpers/dmxHelpers';

/**
 * StageKit data structure
 */
export interface StageKitData {
  positions: number[];        // LED positions [0,1,2,3,4,5,6,7]
  color: string;             // Color: 'red', 'green', 'blue', 'yellow', 'off'
  brightness: 'low' | 'medium' | 'high';
  timestamp: number;
}

export class StageKitDirectProcessor extends EventEmitter {
  private lightMapper: StageKitLightMapper;
  private config: StageKitConfig;
  
  // Per-light color state tracking for dynamic blending
  private lightColorState: Map<number, Set<string>> = new Map(); // DMX light index -> Set of persistent colors
  private currentPassColors: Map<number, Set<string>> = new Map(); // DMX light index -> Set of colors active in current pass
  private colorToLights: Map<string, Set<number>> = new Map(); // Color -> Set of DMX light indices
  private pendingUpdates: Map<number, { colors: Set<string>; timeout: NodeJS.Timeout }> = new Map(); // DMX light index -> pending update
  private readonly ACCUMULATION_DELAY_MS = 5; // 10ms accumulation delay
  
  // Track the last animation sequence to detect when to clear current pass colors
  private lastAnimationSequence: { positions: number[]; colors: Set<string> } | null = null;

  constructor(
    private lightManager: DmxLightManager,
    private photonicsSequencer: ILightingController,
    stageKitConfig: Partial<StageKitConfig> = {}
  ) {
    super();
    console.log('StageKitDirectProcessor: Constructor called with dependencies:', {
      lightManagerType: lightManager.constructor.name,
      photonicsSequencerType: photonicsSequencer.constructor.name,
      stageKitConfig
    }); 
    
    this.config = { ...DEFAULT_STAGEKIT_CONFIG, ...stageKitConfig };
    this.lightMapper = new StageKitLightMapper(this.config.dmxLightCount);
    
    // Initialize color tracking maps
    this.colorToLights.set('red', new Set());
    this.colorToLights.set('green', new Set());
    this.colorToLights.set('blue', new Set());
    this.colorToLights.set('yellow', new Set());
    
   // //console.log('StageKitDirectProcessor initialized with config:', this.config);
  }

  /**
   * Start listening for StageKit events
   * @param networkListener The network listener to listen to
   */
  public startListening(networkListener: EventEmitter): void {
 //   //console.log('StageKitDirectProcessor: startListening called with networkListener:', networkListener.constructor.name);
    
    networkListener.on('stagekit:data', this.handleStageKitEvent.bind(this));
    
  }

  /**
   * Stop listening for events
   * @param networkListener The network listener to stop listening to
   */
  public stopListening(networkListener: EventEmitter): void {
    networkListener.off('stagekit:data', this.handleStageKitEvent.bind(this));
//    //console.log('StageKitDirectProcessor stopped listening for stagekit:data events');
  }

  /**
   * Handle StageKit events
   */
  private handleStageKitEvent(event: StageKitData): void {
    const { positions, color } = event;
    
    // Log the StageKit data for debugging
 //   //console.log(`StageKit: Received positions: [${positions.join(', ')}], color: ${color}`);
    
    // Process the light data directly
    this.applyLightData(positions, color);
    
    // Emit processed event for debugging/monitoring
    this.emit('stagekit:processed', {
      positions,
      color,
      timestamp: Date.now()
    });

  }

  /**
   * Apply light data directly to DMX lights using setState
   * Each color bank operates independently - only affects its own lights
   * Colors are blended in real-time based on what's currently active on each light
   */
  private async applyLightData(positions: number[], color: string): Promise<void> {
    // Special handling for "No LEDs" state (positions is empty)
    if (positions.length === 0) {
      // positions=[] means "no LEDs lit for this color bank" - clear this color from all lights
      if (color !== 'off') {
   //     //console.log(`DEBUG: Clearing color ${color} from all lights`);
        await this.clearColorFromAllLights(color);
      }
      return;
    }
    
    // Map to DMX lights
    const dmxLightIndices = this.lightMapper.mapLedPositionsToDmxLights(positions);
   // console.log(`DEBUG: Position mapping - received positions: [${positions.join(', ')}] -> generated DMX indices: [${dmxLightIndices.join(', ')}]`);
    
    // Update the color state for this color bank
    await this.updateColorBank(color, dmxLightIndices);
  }
  
  /**
   * Update a specific color bank - clear old positions and set new ones
   */
  private async updateColorBank(color: string, newLightIndices: number[]): Promise<void> {
    //console.log(`DEBUG: Updating color bank ${color} to lights [${newLightIndices.join(', ')}]`);
    
    // Get the lights that currently have this color
    const currentLights = this.colorToLights.get(color) || new Set();
    
    // Clear this color from all lights that currently have it
    for (const lightIndex of currentLights) {
      await this.removeColorFromLight(lightIndex, color);
    }
    
    // Clear the color tracking
    this.colorToLights.set(color, new Set());
    
    // Check if this is a new animation sequence
    // If positions or colors changed significantly, clear current pass colors to start fresh
    const currentSequence = { positions: newLightIndices, colors: new Set([color]) };
    const isNewSequence = this.isNewAnimationSequence(currentSequence);
    
  //  console.log(`DEBUG: Sequence check - current: ${JSON.stringify(currentSequence)}, last: ${JSON.stringify(this.lastAnimationSequence)}, isNew: ${isNewSequence}`);
  //  console.log(`DEBUG: Color bank update - color: ${color}, target lights: [${newLightIndices.join(', ')}]`);
    
    if (isNewSequence) {
      // Clear current pass colors for the lights being updated to start fresh
      for (const lightIndex of newLightIndices) {
        if (this.currentPassColors.has(lightIndex)) {
          const beforeClear = Array.from(this.currentPassColors.get(lightIndex)!);
          this.currentPassColors.get(lightIndex)!.clear();
        //  console.log(`DEBUG: Light ${lightIndex} - cleared current pass (new animation sequence): [${beforeClear.join(', ')}] -> []`);
        }
      }
      this.lastAnimationSequence = currentSequence;
    }
    
    // Let colors accumulate naturally in current pass colors for proper blending
    for (const lightIndex of newLightIndices) {
      if (!this.currentPassColors.has(lightIndex)) {
        this.currentPassColors.set(lightIndex, new Set());
      }
      
      const currentColors = this.currentPassColors.get(lightIndex)!;
   //   console.log(`DEBUG: Light ${lightIndex} - current pass colors before adding ${color}: [${Array.from(currentColors).join(', ')}]`);
    }
    
    // Apply this color to the new light positions
    for (const lightIndex of newLightIndices) {
      await this.addColorToLight(lightIndex, color);
      this.colorToLights.get(color)!.add(lightIndex);
    }
  }
  
  /**
   * Add a color to a specific light and re-blend
   */
  private async addColorToLight(lightIndex: number, color: string): Promise<void> {
    // Initialize light color state if needed
    if (!this.lightColorState.has(lightIndex)) {
      this.lightColorState.set(lightIndex, new Set());
    }
    if (!this.currentPassColors.has(lightIndex)) {
      this.currentPassColors.set(lightIndex, new Set());
    }
    
    // Add the color to this light's persistent state
    this.lightColorState.get(lightIndex)!.add(color);
    // Add the color to this light's current pass state (accumulate, don't replace)
    this.currentPassColors.get(lightIndex)!.add(color);
    
    //console.log(`DEBUG: Light ${lightIndex} current pass colors after adding ${color}: [${Array.from(this.currentPassColors.get(lightIndex)!).join(', ')}]`);
    
    // Check if there's already a pending update for this light
    const existingPending = this.pendingUpdates.get(lightIndex);
    if (existingPending) {
      // Clear existing timeout
      clearTimeout(existingPending.timeout);
      // Add new color to pending set
      existingPending.colors.add(color);
    } else {
      // Create new pending update
      const pendingColors = new Set([color]);
      this.pendingUpdates.set(lightIndex, { colors: pendingColors, timeout: null as any });
    }
    
    // Set timeout to apply accumulated colors after delay
    const timeout = setTimeout(async () => {
      await this.applyAccumulatedColors(lightIndex);
      this.pendingUpdates.delete(lightIndex);
    }, this.ACCUMULATION_DELAY_MS);
    
    // Update the timeout reference
    this.pendingUpdates.get(lightIndex)!.timeout = timeout;
  }
  
  /**
   * Remove a color from a specific light and re-blend
   * This is only called when explicitly clearing a color (e.g., leftChannel=0)
   */
  private async removeColorFromLight(lightIndex: number, color: string): Promise<void> {
    if (!this.lightColorState.has(lightIndex)) {
      return; // Light doesn't exist
    }
    
    // Remove the color from this light's persistent state
    this.lightColorState.get(lightIndex)!.delete(color);
    // Remove the color from this light's current pass state
    if (this.currentPassColors.has(lightIndex)) {
      this.currentPassColors.get(lightIndex)!.delete(color);
    }
    
    // Check if there's already a pending update for this light
    const existingPending = this.pendingUpdates.get(lightIndex);
    if (existingPending) {
      // Clear existing timeout
      clearTimeout(existingPending.timeout);
      // Remove color from pending set
      existingPending.colors.delete(color);
    } else {
      // Create new pending update with remaining colors
      const remainingColors = new Set(Array.from(this.lightColorState.get(lightIndex)!));
      this.pendingUpdates.set(lightIndex, { colors: remainingColors, timeout: null as any });
    }
    
    // Set timeout to apply accumulated colors after delay
    const timeout = setTimeout(async () => {
      await this.applyAccumulatedColors(lightIndex);
      this.pendingUpdates.delete(lightIndex);
    }, this.ACCUMULATION_DELAY_MS);
    
    // Update the timeout reference
    this.pendingUpdates.get(lightIndex)!.timeout = timeout;
  }
  
  /**
   * Clear a specific color from all lights
   */
  private async clearColorFromAllLights(color: string): Promise<void> {
    const lightsWithColor = this.colorToLights.get(color) || new Set();
    
    for (const lightIndex of lightsWithColor) {
      // Remove from both persistent and current pass states
      if (this.lightColorState.has(lightIndex)) {
        this.lightColorState.get(lightIndex)!.delete(color);
      }
      if (this.currentPassColors.has(lightIndex)) {
        this.currentPassColors.get(lightIndex)!.delete(color);
      }
      
      // Trigger a re-blend to update the light
      await this.triggerReblend(lightIndex);
    }
    
    // Clear the color tracking
    this.colorToLights.set(color, new Set());
  }
  
  /**
   * Apply a blended color to a specific light
   */
  private async applyColorToLight(lightIndex: number, color: any): Promise<void> {
    const lights = this.lightManager.getLights(['front', 'back'], 'all');
    if (lights && lights[lightIndex]) {
  //    //console.log(`DEBUG: Applying color ${JSON.stringify(color)} to light ${lightIndex}`);
      await this.photonicsSequencer.setState([lights[lightIndex]], color, 1);
    }
  }
  
  /**
   * Turn off a specific light
   */
  private async turnOffLight(lightIndex: number): Promise<void> {
    const lights = this.lightManager.getLights(['front', 'back'], 'all');
    if (lights && lights[lightIndex]) {
  //    //console.log(`DEBUG: Turning off light ${lightIndex}`);
      const blackColor = getColor('black', 'medium');
      await this.photonicsSequencer.setState([lights[lightIndex]], blackColor, 1);
    }
  }

  /**
   * Turn off all DMX lights (for cleanup and reset)
   */
  private async turnOffAllLights(): Promise<void> {
    try {
  //    //console.log('StageKitDirectProcessor: Turning off all DMX lights using setState black');
      
      const lights = this.lightManager.getLights(['front', 'back'], 'all');
      if (lights) {
        const blackColor = getColor('black', 'medium');
        for (const light of lights) {
          await this.photonicsSequencer.setState([light], blackColor, 1);
        }
      }
      
      // Clear all color state
      this.lightColorState.clear();
      this.currentPassColors.clear();
      for (const colorSet of this.colorToLights.values()) {
        colorSet.clear();
      }
      
      // Clear all pending updates
      for (const pendingUpdate of this.pendingUpdates.values()) {
        clearTimeout(pendingUpdate.timeout);
      }
      this.pendingUpdates.clear();
      
    } catch (error) {
      console.error('StageKitDirectProcessor: Error turning off all DMX lights:', error);
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<StageKitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Recreate distributor if light count changed
    if (newConfig.dmxLightCount && newConfig.dmxLightCount !== this.config.dmxLightCount) {
      this.lightMapper = new StageKitLightMapper(newConfig.dmxLightCount);
    }
    
//    //console.log('StageKitDirectProcessor config updated:', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): StageKitConfig {
    return { ...this.config };
  }

  /**
   * Get current brightness setting
   */
  public getCurrentBrightness(): 'low' | 'medium' | 'high' {
    return 'medium'; 
  }


  /**
   * Blend multiple colors into a single color value
   * This handles cases where multiple StageKit color banks are active simultaneously
   */
  private blendColors(colors: string[]): any {
    if (colors.length === 0 || colors.includes('off')) {
      return getColor('black', 'medium');
    }
    
    if (colors.length === 1) {
      // Single color - no blending needed
      return getColor(colors[0] as any, 'medium');
    }
    
    // Multiple colors - blend them together
 //   //console.log(`StageKit: Blending colors: ${colors.join(' + ')}`);
    
    // Get individual color values and log them
    const colorValues = colors.map(color => {
      const colorValue = getColor(color as any, 'medium');
//      //console.log(`StageKit: Color ${color} = ${JSON.stringify(colorValue)}`);
      return colorValue;
    });
    
    // Simple additive blending (can be enhanced with more sophisticated algorithms)
    const blendedColor = this.addColors(colorValues);
    
 //   //console.log(`StageKit: Blended result: ${JSON.stringify(blendedColor)}`);
    return blendedColor;
  }

  /**
   * Add multiple RGBIP colors together
   * This is an averaged blending approach
   */
  private addColors(colors: any[]): any {
    if (colors.length === 0) {
      return getColor('black', 'medium');
    }
    
    if (colors.length === 1) {
      return colors[0];
    }
    
    // Start with the first color
    let result = { ...colors[0] };
    
    // Add subsequent colors
    for (let i = 1; i < colors.length; i++) {
      const color = colors[i];
      
      // Add RGB values (clamp to maximum values)
      if (result.red !== undefined && color.red !== undefined) {
        result.red = Math.min(255, result.red + color.red);
      }
      if (result.green !== undefined && color.green !== undefined) {
        result.green = Math.min(255, result.green + color.green);
      }
      if (result.blue !== undefined && color.blue !== undefined) {
        result.blue = Math.min(255, result.blue + color.blue);
      }
      
      // Handle other color properties if they exist
      if (result.intensity !== undefined && color.intensity !== undefined) {
        result.intensity = Math.min(255, result.intensity + color.intensity);
      }
      
      // For blended colors, use lower priority values to allow for better mixing
      // This prevents one color from completely dominating the others
      result.rp = Math.min(result.rp || 255, color.rp || 255);
      result.gp = Math.min(result.gp || 255, color.gp || 255);
      result.bp = Math.min(result.bp || 255, color.bp || 255);
      result.ip = Math.min(result.ip || 255, color.ip || 255);
    }
    /*
    // Apply averaged blending by dividing by the number of colors
    if (colors.length > 1) {
      if (result.red !== undefined) {
        result.red = Math.round(result.red / colors.length);
      }
      if (result.green !== undefined) {
        result.green = Math.round(result.green / colors.length);
      }
      if (result.blue !== undefined) {
        result.blue = Math.round(result.blue / colors.length);
      }
      if (result.intensity !== undefined) {
        result.intensity = Math.round(result.intensity / colors.length);
      }
    }
    */
    return result;
  }

  /**
   * Apply accumulated colors for a specific light
   */
  private async applyAccumulatedColors(lightIndex: number): Promise<void> {
    const pendingUpdate = this.pendingUpdates.get(lightIndex);
    if (!pendingUpdate) return;
    
    // Get both persistent and current pass colors for this light
    const persistentColors = this.lightColorState.get(lightIndex) || new Set();
    const currentPassColors = this.currentPassColors.get(lightIndex) || new Set();
    
  //  console.log(`DEBUG: Light ${lightIndex} - persistent: [${Array.from(persistentColors).join(', ')}], current pass: [${Array.from(currentPassColors).join(', ')}]`);
    
    if (currentPassColors.size > 0) {
      // Current pass colors take precedence - use ONLY these for blending
      const colorsToBlend = Array.from(currentPassColors);
   //   console.log(`DEBUG: Light ${lightIndex} using current pass colors: [${colorsToBlend.join(', ')}]`);
      const blendedColor = this.blendColors(colorsToBlend);
  //    console.log(`DEBUG: Light ${lightIndex} blended result: ${JSON.stringify(blendedColor)}`);
      await this.applyColorToLight(lightIndex, blendedColor);
    } else if (persistentColors.size > 0) {
      // No current pass colors - fall back to persistent colors
      const colorsToBlend = Array.from(persistentColors);
 //     console.log(`DEBUG: Light ${lightIndex} restoring persistent colors: [${colorsToBlend.join(', ')}]`);
      const blendedColor = this.blendColors(colorsToBlend);
 //     console.log(`DEBUG: Light ${lightIndex} blended result: ${JSON.stringify(blendedColor)}`);
      await this.applyColorToLight(lightIndex, blendedColor);
    } else {
      // No colors left - turn off the light
 //     console.log(`DEBUG: Light ${lightIndex} - no colors left, turning off`);
      await this.turnOffLight(lightIndex);
      this.lightColorState.delete(lightIndex);
      this.currentPassColors.delete(lightIndex);
    }
  }

  /**
   * Trigger a re-blend for a specific light to apply its current state.
   * This is useful when colors are added or removed directly.
   */
  private async triggerReblend(lightIndex: number): Promise<void> {
    // Clear any pending updates for this light
    const existingPending = this.pendingUpdates.get(lightIndex);
    if (existingPending) {
      clearTimeout(existingPending.timeout);
      this.pendingUpdates.delete(lightIndex);
    }

    // Apply the current state of persistent and current pass colors
    const persistentColors = this.lightColorState.get(lightIndex) || new Set();
    const currentPassColors = this.currentPassColors.get(lightIndex) || new Set();

    const colorsToBlend = Array.from(persistentColors).concat(Array.from(currentPassColors));
    //console.log(`DEBUG: Light ${lightIndex} triggering re-blend with colors: [${colorsToBlend.join(', ')}]`);
    const blendedColor = this.blendColors(colorsToBlend);
    await this.applyColorToLight(lightIndex, blendedColor);
  }


  /**
   * Get comprehensive processor status
   */
  public getStatus(): {
    currentActiveLights: string[];
    hasActiveLights: boolean;
    activeLightCount: number;
  } {
    const activeLights: string[] = [];
    for (const [lightIndex, colors] of this.lightColorState.entries()) {
      if (colors.size > 0) {
        activeLights.push(`Light ${lightIndex}: [${Array.from(colors).join(', ')}]`);
      }
    }
    
    return {
      currentActiveLights: activeLights,
      hasActiveLights: activeLights.length > 0,
      activeLightCount: activeLights.length
    };
  }

  /**
   * Get color blending information for a specific color
   */
  public getColorBlendingInfo(color: string): {
    color: string;
    blendedColor: any;
    description: string;
  } {
    const activeColors = [color];
    const blendedColor = this.blendColors(activeColors);
    
    let description = '';
    if (color === 'off') {
      description = 'No colors active';
    } else {
      description = `Single color: ${color}`;
    }
    
    return {
      color,
      blendedColor,
      description
    };
  }

  /**
   * Public method to manually clear all lights (for testing and debugging)
   */
  public async clearAllLightsManually(): Promise<void> {
    await this.turnOffAllLights();
  }


  /**
   * Clean up resources
   */
  public destroy(): void {
    // Clear any active lights before destroying
    this.turnOffAllLights().catch(error => {
      console.error('StageKitDirectProcessor: Error clearing lights during destroy:', error);
    });
    
    this.removeAllListeners();
    //console.log('StageKitDirectProcessor destroyed');
  }

  /**
   * Check if the current sequence represents a new animation sequence
   * This helps determine when to clear current pass colors
   */
  private isNewAnimationSequence(currentSequence: { positions: number[]; colors: Set<string> }): boolean {
    if (!this.lastAnimationSequence) {
      return true; // First sequence
    }
    
    // Check if positions changed significantly
    const lastPositions = this.lastAnimationSequence.positions;
    const currentPositions = currentSequence.positions;
    
    // For chasing patterns, we expect positions to change gradually
    // Only clear if we get a completely different pattern (e.g., different number of lights)
    if (lastPositions.length !== currentPositions.length) {
      // Different number of lights - likely a new animation
      return true;
    }
    
    // If we have the same number of lights, check if they're completely different
    // For chasing patterns, we expect some overlap or adjacent positions
    let hasOverlap = false;
    for (const pos of currentPositions) {
      if (lastPositions.includes(pos)) {
        hasOverlap = true;
        break;
      }
    }
    
    // If no overlap at all, it might be a new animation
    if (!hasOverlap && lastPositions.length > 0) {
      return true;
    }
    
    // Check if colors are significantly different
    const lastColors = this.lastAnimationSequence.colors;
    const currentColors = currentSequence.colors;
    
    // If we're adding a completely new color that wasn't in the last sequence, 
    // and it's not a complementary color (like red/yellow), it might be a new sequence
    for (const color of currentColors) {
      if (!lastColors.has(color)) {
        // This is a new color - check if it's part of the same animation
        // For now, assume it's the same animation if positions have some overlap
        // This allows red/yellow chasing patterns to work
        return false;
      }
    }
    
    // Same positions and similar colors - likely the same animation sequence
    return false;
  }
}
