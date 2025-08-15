/**
 * StageKitDirectCueHandler - Direct RB3E light data to DMX mapping
 * 
 * This handler bypasses the normal cue system entirely and directly maps
 * RB3E StageKit LED data to DMX lights in real-time. It implements a
 * simple interface that can be swapped with the existing Rb3CueHandler.
 */
import { DmxLightManager } from '../controllers/DmxLightManager';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { StageKitLedMapper } from '../listeners/RB3/StageKitLedMapper';
import { DmxLightDistributor } from '../listeners/RB3/DmxLightDistributor';
import { StageKitConfig, DEFAULT_STAGEKIT_CONFIG } from '../listeners/RB3/StageKitTypes';

/**
 * Interface for StageKit direct mode handlers
 */
export interface IStageKitHandler {
  /** Process RB3E light data directly to DMX */
  processLightData(leftChannel: number, rightChannel: number): void;
  
  /** Update configuration */
  updateConfig(config: Partial<StageKitConfig>): void;
  
  /** Get current configuration */
  getConfig(): StageKitConfig;
  
  /** Clean up resources */
  destroy(): void;
}

export class StageKitDirectCueHandler implements IStageKitHandler {
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
    this.config = { ...DEFAULT_STAGEKIT_CONFIG, ...stageKitConfig };
    this.stageKitMapper = new StageKitLedMapper();
    this.dmxDistributor = new DmxLightDistributor(this.config.dmxLightCount);
    
    console.log('StageKitDirectCueHandler initialized with config:', this.config);
  }

  /**
   * Process RB3E light data directly to DMX - main entry point
   */
  public processLightData(leftChannel: number, rightChannel: number): void {
    // Update brightness based on left channel values
    this.updateBrightness(leftChannel);
    
    // Process the light data directly
    this.applyLightData(leftChannel, rightChannel, this._currentBrightness);
    
    // Store last values
    this._lastLeftChannel = leftChannel;
    this._lastRightChannel = rightChannel;
  }

  /**
   * Update brightness setting based on left channel values
   */
  private updateBrightness(leftChannel: number): void {
    if (leftChannel === 34) {
      this._currentBrightness = 'low';
    } else if (leftChannel === 68 || leftChannel === 128) {
      this._currentBrightness = 'medium';
    } else if (leftChannel === 136) {
      this._currentBrightness = 'high';
    }
  }

  /**
   * Apply light data directly to DMX lights
   */
  private applyLightData(leftChannel: number, rightChannel: number, brightness: string): void {
    // Map RB3E channels to StageKit LED positions
    const ledPositions = this.stageKitMapper.mapLeftChannelToLedPositions(leftChannel);
    const color = this.stageKitMapper.mapRightChannelToColor(rightChannel);
    
    // Map to DMX lights
    const dmxLightIndices = this.dmxDistributor.mapLedPositionsToDmxLights(ledPositions);
    
    // Apply to DMX lights directly
    this.applyDmxLightState(dmxLightIndices, color, brightness);
    
    // Log state changes for debugging
    if (this.config.debug) {
      console.log(`StageKit Direct: Left=${leftChannel}, Right=${rightChannel}, Color=${color}, Brightness=${brightness}`);
      console.log(`  LED Positions: [${ledPositions.join(', ')}] -> DMX Lights: [${dmxLightIndices.join(', ')}]`);
    }
  }

  /**
   * Apply light state directly to DMX lights
   */
  private async applyDmxLightState(dmxLightIndices: number[], color: string, brightness: string): Promise<void> {
    try {
      // Get all available lights from DmxLightManager
      const allLights = this.lightManager.getLights(['front', 'back'], 'all');
      const lights = this.lightManager.getLightsByTarget(allLights, 'all');
      
      if (!lights || lights.length === 0) {
        console.warn('No DMX lights available from DmxLightManager');
        return;
      }

      // Apply color and brightness to specific lights
      dmxLightIndices.forEach(index => {
        if (index >= 0 && index < lights.length && lights[index]) {
          const light = lights[index];
          
          try {
            // Use the sequencer to set the light state directly
            // This bypasses the cue system but uses the existing DMX infrastructure
            const rgbColor = color !== 'off' ? this.mapColorToRgb(color) : { r: 0, g: 0, b: 0 };
            const brightnessValue = this.mapBrightnessToValue(brightness);
            
            // Convert to RGBIP format and set the light state through the sequencer
            const colorValue = {
              red: rgbColor.r,
              rp: 0,
              green: rgbColor.g,
              gp: 0,
              blue: rgbColor.b,
              bp: 0,
              intensity: Math.round(brightnessValue * 255),
              ip: 0
            };
            
            this.photonicsSequencer.setState([light], colorValue, 0);
            
            console.log(`StageKit: Light ${index} (position ${light.position}) - Color: ${color}, Brightness: ${brightness}`);
            
          } catch (error) {
            console.error(`Error updating light at index ${index}:`, error);
          }
        }
      });
      
    } catch (error) {
      console.error('Error applying DMX light state:', error);
    }
  }

  /**
   * Update the configuration
   */
  public updateConfig(newConfig: Partial<StageKitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.dmxDistributor = new DmxLightDistributor(this.config.dmxLightCount);
    console.log('StageKitDirectCueHandler config updated:', this.config);
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
   * Get last processed channel values
   */
  public getLastChannelValues(): { leftChannel: number; rightChannel: number } {
    return {
      leftChannel: this._lastLeftChannel,
      rightChannel: this._lastRightChannel
    };
  }

  /**
   * Map color string to RGB values
   */
  private mapColorToRgb(color: string): { r: number; g: number; b: number } {
    switch (color) {
      case 'red': return { r: 255, g: 0, b: 0 };
      case 'green': return { r: 0, g: 255, b: 0 };
      case 'blue': return { r: 0, g: 0, b: 255 };
      case 'yellow': return { r: 255, g: 255, b: 0 };
      case 'white': return { r: 255, g: 255, b: 255 };
      case 'purple': return { r: 255, g: 0, b: 255 };
      case 'teal': return { r: 0, g: 255, b: 255 };
      case 'orange': return { r: 255, g: 165, b: 0 };
      default: return { r: 0, g: 0, b: 0 };
    }
  }

  /**
   * Map brightness string to numeric value
   */
  private mapBrightnessToValue(brightness: string): number {
    switch (brightness) {
      case 'low': return 0.3;
      case 'medium': return 0.6;
      case 'high': return 1.0;
      default: return 0.6;
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    console.log('StageKitDirectCueHandler destroyed');
  }
}
