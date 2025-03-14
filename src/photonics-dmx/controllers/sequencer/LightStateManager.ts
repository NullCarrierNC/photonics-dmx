import { EventEmitter } from 'events';
import { LightState, RGBIP } from '../../types';

/**
 * The LightStateManager stores the current state of each light.
 * State is published for handling by external listeners. 
 */
class LightStateManager extends EventEmitter {
  private _finalStates: Map<string, RGBIP>;
  private _publishInterval: NodeJS.Timeout | null;

  constructor() {
    super();
    this._finalStates = new Map();
    this._publishInterval = null;
  }


  /**
   * Sets the lights state
   * @param lightId 
   * @param finalColor 
   */
  public setLightState(lightId: string, finalColor: RGBIP): void {
    this._finalStates.set(lightId, finalColor);
  }


  /**
   * Gets the lights state
   * @param lightId 
   * @returns 
   */
  public getLightState(lightId: string): RGBIP | null {
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
    const states: LightState[] = [];
    this._finalStates.forEach((color, lightId) => {
      states.push({ id: lightId, value: color });
    });
    this.emit('LightStatesUpdated', states);
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
  }
}

export { LightStateManager };