import { EventEmitter } from 'events'
import { RGBIO } from '../../types'

/**
 * Listener for published light states. The map and its values are read-only by contract: they are
 * the manager's live state shared by reference each frame, so the type stops a consumer from
 * mutating the map (a .set/.delete would corrupt the next frame) at compile time.
 */
export type LightStatesListener = (states: ReadonlyMap<string, Readonly<RGBIO>>) => void

/** Freeze the per-frame published state under test so a listener that mutates it fails loudly. */
const FREEZE_PUBLISHED_STATES = process.env.NODE_ENV === 'test'

/**
 * The LightStateManager stores the current state of each light.
 * State is published for handling by external listeners.
 */
class LightStateManager extends EventEmitter {
  private _finalStates: Map<string, RGBIO>

  constructor() {
    super()
    this._finalStates = new Map()
  }

  /**
   * Sets the light state immediately.
   * @param lightId
   * @param finalColor
   */
  public setLightState(lightId: string, finalColor: RGBIO): void {
    this._finalStates.set(lightId, finalColor)
  }

  /**
   * Gets the lights state
   * @param lightId
   * @returns
   */
  public getLightState(lightId: string): RGBIO | null {
    return this._finalStates.get(lightId) || null
  }

  /**
   * You can get all tracked light IDs so LTC can do a blackout
   * or check which lights exist, etc.
   */
  public getTrackedLightIds(): string[] {
    return Array.from(this._finalStates.keys())
  }

  /**
   * Publishes the final states via an event.
   *
   * Contract: listeners MUST treat the emitted map and its RGBIO values as READ-ONLY. It is the
   * manager's live state, shared by reference each frame for performance — mutating it corrupts the
   * next frame. Under test the published values are frozen so an offending listener throws.
   */
  public publishLightStates(): void {
    if (FREEZE_PUBLISHED_STATES) {
      const frozen = new Map<string, RGBIO>()
      for (const [id, state] of this._finalStates) {
        frozen.set(id, Object.freeze({ ...state }))
      }
      this.emit('LightStatesUpdated', frozen)
      return
    }
    this.emit('LightStatesUpdated', this._finalStates)
  }

  /** Register a listener for published light states. Typed read-only (see {@link LightStatesListener}). */
  public onLightStatesUpdated(listener: LightStatesListener): void {
    this.on('LightStatesUpdated', listener)
  }

  /** Remove a previously registered light-states listener. */
  public offLightStatesUpdated(listener: LightStatesListener): void {
    this.off('LightStatesUpdated', listener)
  }

  /**
   * Clears all internal data.
   */
  public shutdown(): void {
    this.removeAllListeners()
    this._finalStates.clear()
  }
}

export { LightStateManager }
