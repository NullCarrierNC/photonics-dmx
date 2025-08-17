/**
 * StageKitDirectProcessor - Direct RB3E light data to DMX mapping
 * 
 * This processor listens for 'rb3e:stagekit' events and directly maps
 * RB3E StageKit LED data to DMX lights in real-time, bypassing the cue system.
 */
import { EventEmitter } from 'events';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { StageKitLedMapper } from '../listeners/RB3/StageKitLedMapper';
import { DmxLightDistributor } from './DmxLightDistributor';
import { StageKitConfig, DEFAULT_STAGEKIT_CONFIG } from '../listeners/RB3/StageKitTypes';
import { getColor } from '../helpers/dmxHelpers';
import { getEffectSingleColor } from '../effects';

/**
 * RB3E StageKit event data structure
 */
export interface Rb3eStageKitEvent {
  leftChannel: number;
  rightChannel: number;
  brightness: 'low' | 'medium' | 'high';
  timestamp: number;
}

export class StageKitDirectProcessor extends EventEmitter {
  private stageKitMapper: StageKitLedMapper;
  private dmxDistributor: DmxLightDistributor;
  private config: StageKitConfig;
  private _currentBrightness: 'low' | 'medium' | 'high' = 'medium';
  private _lastLeftChannel: number = 0;
  private _lastRightChannel: number = 0;

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
  //  console.log('StageKitDirectProcessor: Config initialized:', this.config);
    
 //   console.log('StageKitDirectProcessor: Creating StageKitLedMapper...');
    this.stageKitMapper = new StageKitLedMapper();
//    console.log('StageKitDirectProcessor: StageKitLedMapper created successfully');
    
  //  console.log('StageKitDirectProcessor: Creating DmxLightDistributor...');
    this.dmxDistributor = new DmxLightDistributor(this.config.dmxLightCount);
  //  console.log('StageKitDirectProcessor: DmxLightDistributor created successfully');
    
 //   console.log('StageKitDirectProcessor initialized with config:', this.config);
  }

  /**
   * Start listening for RB3E StageKit events
   * @param networkListener The RB3E network listener to listen to
   */
  public startListening(networkListener: EventEmitter): void {
    console.log('StageKitDirectProcessor: startListening called with networkListener:', networkListener.constructor.name);
  //  console.log('StageKitDirectProcessor: Adding listener for rb3e:stagekit event');
    
    networkListener.on('rb3e:stagekit', this.handleStageKitEvent.bind(this));
    
  //  console.log('StageKitDirectProcessor: Event listener added successfully');
  //  console.log('StageKitDirectProcessor started listening for rb3e:stagekit events');
  }

  /**
   * Stop listening for events
   * @param networkListener The RB3E network listener to stop listening to
   */
  public stopListening(networkListener: EventEmitter): void {
    networkListener.off('rb3e:stagekit', this.handleStageKitEvent.bind(this));
    console.log('StageKitDirectProcessor stopped listening for rb3e:stagekit events');
  }

  /**
   * Handle RB3E StageKit events
   */
  private handleStageKitEvent(event: Rb3eStageKitEvent): void {
   // console.log('StageKitDirectProcessor: Received stagekit event:', event);
    
    const { leftChannel, rightChannel, brightness } = event;
    
    // Update brightness based on left channel values
    this.updateBrightness(leftChannel);
    
    // Process the light data directly
    this.applyLightData(leftChannel, rightChannel, this._currentBrightness);
    
    // Store last values
    this._lastLeftChannel = leftChannel;
    this._lastRightChannel = rightChannel;
    
    // Emit processed event for debugging/monitoring
    this.emit('stagekit:processed', {
      leftChannel,
      rightChannel,
      brightness: brightness, //this._currentBrightness,
      timestamp: Date.now()
    });
    
  //  console.log('StageKitDirectProcessor: Processed stagekit event successfully');
  }

  /**
   * Update brightness setting based on left channel values
   * Enhanced mapping based on observed RB3E patterns
   */
  private updateBrightness(leftChannel: number): void {
    // High brightness patterns (typically dramatic effects)
    if (leftChannel === 136 || leftChannel === 128 || leftChannel === 64) {
      this._currentBrightness = 'high';
    }
    // Medium brightness patterns (typical gameplay)
    else if (leftChannel === 68 || leftChannel === 32 || leftChannel === 16 || leftChannel === 8) {
      this._currentBrightness = 'medium';
    }
    // Low brightness patterns (subtle effects)
    else if (leftChannel === 34 || leftChannel === 4 || leftChannel === 2 || leftChannel === 1) {
      this._currentBrightness = 'low';
    }
    // Default to medium for unmapped values
    else {
      this._currentBrightness = 'medium';
    }
  }

  /**
   * Apply light data directly to DMX lights
   */
  private async applyLightData(leftChannel: number, rightChannel: number, brightness: string): Promise<void> {
    // Map RB3E channels to StageKit LED positions
    const ledPositions = this.stageKitMapper.mapLeftChannelToLedPositions(leftChannel);
    const color = this.stageKitMapper.mapRightChannelToColor(rightChannel);
    
    console.log(`DEBUG: applyLightData - leftChannel: ${leftChannel}, rightChannel: ${rightChannel}`);
    console.log(`DEBUG: Mapped to LED positions: [${ledPositions.join(', ')}], color: ${color}`);
    
    // Special handling for "No LEDs" state (leftChannel = 0)
    if (leftChannel === 0) {
      // Turn off all lights when no LEDs are selected
      await this.turnOffAllLights();
      return;
    }
    
    // Map to DMX lights
    const dmxLightIndices = this.dmxDistributor.mapLedPositionsToDmxLights(ledPositions);
    console.log(`DEBUG: Generated DMX light indices: [${dmxLightIndices.join(', ')}]`);
    
    // Apply to DMX lights directly
    await this.applyDmxLightState(dmxLightIndices, color, brightness);
    
    // Log state changes for debugging
    if (this.config.debug) {
      console.log(`StageKit Direct: Left=${leftChannel}, Right=${rightChannel}, Color=${color}, Brightness=${brightness}`);
      console.log(`  LED Positions: [${ledPositions.join(', ')}] -> DMX Lights: [${dmxLightIndices.join(', ')}]`);
      console.log(`  DMX Mapping: ${this.dmxDistributor.getMappingDescription()}`);
      
      // Show detailed mapping for each LED position
      const mappingDetails = this.dmxDistributor.debugMapping(ledPositions);
      mappingDetails.forEach(detail => {
        console.log(`    LED ${detail.ledPos} (${detail.ledName}) -> ${detail.dmxDescription}`);
      });
    }
  }

  /**
   * Apply DMX light state directly via sequencer using effects
   */
  private async applyDmxLightState(dmxLightIndices: number[], color: string, brightness: string): Promise<void> {
    try {
      const lights = this.lightManager.getLights(['front', 'back'], 'all');
      
      if (!lights || lights.length === 0) {
        console.warn('StageKitDirectProcessor: No DMX lights available');
        return;
      }

      console.log(`DEBUG: applyDmxLightState - dmxLightIndices: [${dmxLightIndices.join(', ')}], color: ${color}, brightness: ${brightness}`);
      console.log(`DEBUG: Available lights count: ${lights.length}`);

      // If no specific LEDs selected or color is off, turn off all lights
      if (color === 'off' || dmxLightIndices.length === 0) {
        console.log(`StageKit: All lights turned OFF (black) - color: ${color}, dmxLightIndices: [${dmxLightIndices.join(', ')}]`);
        await this.photonicsSequencer.blackout(0);
        return;
      }

      // Get the target lights for the specified DMX indices
      const targetLights = dmxLightIndices
        .map(index => lights[index])
        .filter(light => light !== undefined);

      if (targetLights.length === 0) {
        console.warn('StageKitDirectProcessor: No valid target lights found for DMX indices');
        return;
      }

      // Create a color effect for the specified lights
      const colorEffect = this.createColorEffect(targetLights, color, brightness);
      
      // Determine the layer based on color (prevents interference between colors)
      const layer = this.getColorLayer(color);
      colorEffect.layer = layer;
      
      // Create a unique effect name for this color and light combination
      const effectName = `stagekit-${color}-${dmxLightIndices.join('-')}`;
      
      console.log(`DEBUG: Creating effect '${effectName}' on layer ${layer} for ${targetLights.length} lights`);
     
      // Set the effect on the appropriate layer
      await this.photonicsSequencer.addEffect(effectName, colorEffect, 0, false);
      
      console.log(`StageKitDirectProcessor: Set effect '${effectName}' on layer ${layer} for ${targetLights.length} lights`);
      
    } catch (error) {
      console.error('StageKitDirectProcessor: Error applying DMX light state:', error);
    }
  }

  /**
   * Turn off all DMX lights
   */
  private async turnOffAllLights(): Promise<void> {
    try {
      console.log('StageKitDirectProcessor: Turning off all DMX lights using sequencer blackout');
      await this.photonicsSequencer.blackout(0);
    } catch (error) {
      console.error('StageKitDirectProcessor: Error turning off all DMX lights:', error);
    }
  }

  /**
   * Create a color effect for the specified lights
   */
  private createColorEffect(lights: any[], color: string, brightness: string): any {
    // Get the RGBIP color value
    const colorValue = getColor(color as any, brightness as any);
    
    // Create a single color effect
    return getEffectSingleColor({
      color: colorValue,
      duration: 0, 
      lights,
      layer: 0, // Layer will be set when applying the effect
      waitFor: 'none',
      forTime: 0,
      waitUntil: 'delay',
      untilTime: 10
    });
  }

  /**
   * Get the appropriate layer for a color to prevent interference
   */
  private getColorLayer(color: string): number {
    switch (color.toLowerCase()) {
      case 'red': return 1;
      case 'yellow': return 2;
      case 'blue': return 3;
      case 'green': return 4;
      case 'purple': return 5;
      case 'orange': return 6;
      case 'white': return 7;
      case 'black': return 8;
      default: return 9; // Fallback layer
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<StageKitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Recreate distributor if light count changed
    if (newConfig.dmxLightCount && newConfig.dmxLightCount !== this.config.dmxLightCount) {
      this.dmxDistributor = new DmxLightDistributor(newConfig.dmxLightCount);
    }
    
    console.log('StageKitDirectProcessor config updated:', this.config);
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
    return this._currentBrightness;
  }

  /**
   * Get last channel values
   */
  public getLastChannelValues(): { leftChannel: number; rightChannel: number } {
    return {
      leftChannel: this._lastLeftChannel,
      rightChannel: this._lastRightChannel
    };
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.removeAllListeners();
    console.log('StageKitDirectProcessor destroyed');
  }
}
