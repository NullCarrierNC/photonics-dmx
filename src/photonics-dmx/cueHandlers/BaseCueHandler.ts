import { EventEmitter } from 'events';
import { CueData, CueType } from '../cues/cueTypes';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { CueRegistry } from '../cues/CueRegistry';

/**
 * Base class for cue handlers that provides common registry functionality.
 * Each game-specific handler (YARG, RB3) should extend this and initialize
 * its own cue set.
 */
export abstract class BaseCueHandler extends EventEmitter {
  protected _lightManager: DmxLightManager;
  protected _sequencer: ILightingController;
  protected _debouncePeriod: number;
  protected _lastCueTime: number = 0;
  protected registry: CueRegistry;

  constructor(
    lightManager: DmxLightManager,
    photonicsSequencer: ILightingController,
    debouncePeriod: number
  ) {
    super();
    this._lightManager = lightManager;
    this._sequencer = photonicsSequencer;
    this._debouncePeriod = debouncePeriod;
    this.registry = CueRegistry.getInstance();
  }

  /**
   * Reset the registry.
   * This should be called when switching between different cue handlers.
   */
  public reset(): void {
    this.registry.reset();
  }

  /**
   * Handle a cue by delegating to the appropriate cue implementation
   * @param cueType The type of cue to handle
   * @param parameters The cue parameters
   */
  public abstract handleCue(cueType: CueType, parameters: CueData): Promise<void>;

  /**
   * Check if enough time has passed since the last cue
   * @returns true if enough time has passed, false otherwise
   */
  protected checkDebounce(): boolean {
    const now = Date.now();
    if (now - this._lastCueTime < this._debouncePeriod) {
      return false;
    }
    this._lastCueTime = now;
    return true;
  }

  /**
   * Add a listener for handled cues
   * @param listener The listener function
   */
  public addCueHandledListener(listener: (data: CueData) => void): void {
    this.on('cueHandled', listener);
  }

  /**
   * Remove a listener for handled cues
   * @param listener The listener function
   */
  public removeCueHandledListener(listener: (data: CueData) => void): void {
    this.off('cueHandled', listener);
  }

  /**
   * Add a listener for debounced cues
   * @param listener The listener function
   */
  public addCueDebouncedListener(listener: (data: CueData) => void): void {
    this.on('cueDebounced', listener);
  }

  /**
   * Remove a listener for debounced cues
   * @param listener The listener function
   */
  public removeCueDebouncedListener(listener: (data: CueData) => void): void {
    this.off('cueDebounced', listener);
  }

  /**
   * Set the debounce period for effects
   * @param time The debounce period in milliseconds
   */
  public setEffectDebouncePeriod(time: number): void {
    this._debouncePeriod = time;
  }

  /**
   * Clean up resources
   */
  public shutdown(): void {
    this.removeAllListeners();
  }

  // Methods any cue handler must implement
  protected abstract handleCueBigRockEnding(parameters: CueData): Promise<void>;
  protected abstract handleCueBlackout_Fast(parameters: CueData): Promise<void>;
  protected abstract handleCueBlackout_Slow(parameters: CueData): Promise<void>;
  protected abstract handleCueBlackout_Spotlight(parameters: CueData): Promise<void>;
  protected abstract handleCueChorus(parameters: CueData): Promise<void>;
  protected abstract handleCueCool_Automatic(parameters: CueData): Promise<void>;
  protected abstract handleCueCool_Manual(parameters: CueData): Promise<void>;
  protected abstract handleCueDefault(parameters: CueData): Promise<void>;
  protected abstract handleCueDischord(parameters: CueData): Promise<void>;
  protected abstract handleCueFlare_Fast(parameters: CueData): Promise<void>;
  protected abstract handleCueFlare_Slow(parameters: CueData): Promise<void>;
  protected abstract handleCueFrenzy(parameters: CueData): Promise<void>;
  protected abstract handleCueHarmony(parameters: CueData): Promise<void>;
  protected abstract handleCueIntro(parameters: CueData): Promise<void>;
  protected abstract handleCueKeyframe_First(parameters: CueData): Promise<void>;
  protected abstract handleCueKeyframe_Next(parameters: CueData): Promise<void>;
  protected abstract handleCueKeyframe_Previous(parameters: CueData): Promise<void>;
  protected abstract handleCueMenu(parameters: CueData): Promise<void>;
  protected abstract handleCueNoCue(parameters: CueData): Promise<void>;
  protected abstract handleCueScore(parameters: CueData): Promise<void>;
  protected abstract handleCueSearchlights(parameters: CueData): Promise<void>;
  protected abstract handleCueSilhouettes(parameters: CueData): Promise<void>;
  protected abstract handleCueSilhouettes_Spotlight(parameters: CueData): Promise<void>;
  protected abstract handleCueStomp(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Fast(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Fastest(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Medium(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Off(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Slow(parameters: CueData): Promise<void>;
  protected abstract handleCueSweep(parameters: CueData): Promise<void>;
  protected abstract handleCueVerse(parameters: CueData): Promise<void>;
  protected abstract handleCueWarm_Automatic(parameters: CueData): Promise<void>;
  protected abstract handleCueWarm_Manual(parameters: CueData): Promise<void>;
} 