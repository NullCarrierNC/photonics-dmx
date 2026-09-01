/** Bounds for the master dimmer, expressed as a percent of full output. */
export const MASTER_DIMMER_MIN_PERCENT = 0
export const MASTER_DIMMER_MAX_PERCENT = 100
export const DEFAULT_MASTER_DIMMER_PERCENT = 100

/** Wire shape for reading the current controls back into the UI. */
export interface MasterOutputSnapshot {
  dimmerPercent: number
  blackout: boolean
  strobeOutputEnabled: boolean
}

/**
 * The global output controls: master dimmer, blackout latch, and the strobe output gate.
 * {@link DmxPublisher} reads these once per frame and applies them at the single point every
 * published colour passes through.
 *
 * Owned by ControllerManager and injected the way VenueFrameProcessor is, rather than held on the
 * publisher, because a controller restart rebuilds the publisher: state living there would
 * silently release a blackout the operator had armed.
 *
 * Blackout is deliberately session-only. The dimmer level and the strobe gate persist through
 * AppPreferences and are seeded back in when the controller graph builds.
 */
export class MasterOutputState {
  private _dimmerPercent: number = DEFAULT_MASTER_DIMMER_PERCENT
  private _blackout: boolean = false
  private _strobeOutputEnabled: boolean = true

  public getDimmerPercent(): number {
    return this._dimmerPercent
  }

  /**
   * Clamps to 0-100 and rounds. The value reaches DMX through `scaleDmxValueByPercent`, which
   * expects an integer percent, and prefs on disk bypass IPC validation.
   */
  public setDimmerPercent(percent: number): void {
    if (typeof percent !== 'number' || !Number.isFinite(percent)) {
      return
    }
    this._dimmerPercent = Math.max(
      MASTER_DIMMER_MIN_PERCENT,
      Math.min(MASTER_DIMMER_MAX_PERCENT, Math.round(percent)),
    )
  }

  public isBlackoutActive(): boolean {
    return this._blackout
  }

  public setBlackout(active: boolean): void {
    this._blackout = active
  }

  public isStrobeOutputEnabled(): boolean {
    return this._strobeOutputEnabled
  }

  public setStrobeOutputEnabled(enabled: boolean): void {
    this._strobeOutputEnabled = enabled
  }

  /**
   * The scale the publisher applies to colour and intensity this frame: the dimmer level, or 0
   * while blacked out. Blackout overrides rather than moving the level, so releasing it restores
   * the operator's fader position untouched.
   */
  public getOutputPercent(): number {
    return this._blackout ? 0 : this._dimmerPercent
  }

  public getSnapshot(): MasterOutputSnapshot {
    return {
      dimmerPercent: this._dimmerPercent,
      blackout: this._blackout,
      strobeOutputEnabled: this._strobeOutputEnabled,
    }
  }
}
