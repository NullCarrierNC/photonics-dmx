import { EventEmitter } from 'events';
import { RGBIO } from '../../types';
import { Clock } from './Clock';

/**
 * The LightStateManager stores the current state of each light.
 * State is published for handling by external listeners. 
 */
class LightStateManager extends EventEmitter {
  private _finalStates: Map<string, RGBIO>;
  private _publishInterval: NodeJS.Timeout | null;
  private _frameBuffer: Map<string, RGBIO>;
  private _clock: Clock | null = null;

  constructor(clock?: Clock) {
    super();
    this._finalStates = new Map();
    this._publishInterval = null;
    this._frameBuffer = new Map();
    this._clock = clock || null;
    
    // Register for frame synchronization if clock is provided
    if (this._clock) {
      this._clock.onTick(() => this.syncFrame());
    }
  }


  /**
   * Sets the lights state, batches updates for frame synchronization
   * @param lightId 
   * @param finalColor 
   */
  public setLightState(lightId: string, finalColor: RGBIO): void {
    // Store in frame buffer for synchronized updates
    this._frameBuffer.set(lightId, finalColor);
  }


  /**
   * Gets the lights state
   * @param lightId 
   * @returns 
   */
  public getLightState(lightId: string): RGBIO | null {
    return this._finalStates.get(lightId) || null;
  }

  /**
   * You can get all tracked light IDs so LTC can do a blackout
   * or check which lights exist, etc.
   */
  public getTrackedLightIds(): string[] {
    return Array.from(this._finalStates.keys());
  }

  /**
   * Publishes the final states via an event. 
   */
  public publishLightStates(): void {
    this.emit('LightStatesUpdated', this._finalStates);
  }

  /**
   * Synchronizes all pending frame updates atomically
   */
  public syncFrame(): void {
    if (this._frameBuffer.size === 0) return;
    
    // Apply all pending updates atomically
    this._frameBuffer.forEach((color, lightId) => {
      this._finalStates.set(lightId, color);
    });
    
    // Clear frame buffer
    this._frameBuffer.clear();
    
    // Publish all synchronized states
    this.publishLightStates();
  }

  /**
   * Clears all internal data. 
   */
  public shutdown(): void {
    this.removeAllListeners();
    if (this._publishInterval) {
      clearInterval(this._publishInterval);
      this._publishInterval = null;
    }
    this._finalStates.clear();
    this._frameBuffer.clear();
  }
}

export { LightStateManager };