import { EventEmitter } from 'events';
import { RGBIO } from '../../types';

/**
 * The LightStateManager stores the current state of each light.
 * State is published for handling by external listeners. 
 */
class LightStateManager extends EventEmitter {
  private _finalStates: Map<string, RGBIO>;

  constructor() {
    super();
    this._finalStates = new Map();
  }


  /**
   * Sets the light state immediately.
   * @param lightId 
   * @param finalColor 
   */
  public setLightState(lightId: string, finalColor: RGBIO): void {
    this._finalStates.set(lightId, finalColor);
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
   * Clears all internal data. 
   */
  public shutdown(): void {
    this.removeAllListeners();
    this._finalStates.clear();
  }
}

export { LightStateManager };