import { EventEmitter } from 'events';
import { CueData, CueType, InstrumentNoteType, DrumNoteType } from '../cues/cueTypes';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { CueRegistry } from '../cues/CueRegistry';
import { LightTarget, LocationGroup, TrackedLight, CueGroup } from '../types';

/**
 * Base class for cue handlers that provides common registry functionality.
 * Each game-specific handler (YARG, RB3) should extend this and initialize
 * its own cue set.
 */
export abstract class BaseCueHandler extends EventEmitter {
  protected _lightManager: DmxLightManager;
  protected _sequencer: ILightingController;
  protected debouncePeriod: number;
  protected lastDebouncedCueTime: number = 0;
  protected registry: CueRegistry;
  
  // Cue history tracking
  private cueHistory: CueType[] = [];
  private currentCue?: CueType;
  private executionCount = 0;
  private cueStartTime = 0;
  private lastCueChangeTime = 0;
  private previousCueData?: Partial<CueData>;

  constructor(
    lightManager: DmxLightManager,
    photonicsSequencer: ILightingController,
    debouncePeriod: number
  ) {
    super();
    this._lightManager = lightManager;
    this._sequencer = photonicsSequencer;
    this.debouncePeriod = debouncePeriod;
    this.registry = CueRegistry.getInstance();
  }

  /**
   * Reset the registry.
   * This should be called when switching between different cue handlers.
   */
  public reset(): void {
    this.registry.reset();
    this.resetCueHistory();
  }

  /**
   * Reset cue history tracking
   * Called when starting a new session or switching handlers
   */
  public resetCueHistory(): void {
    this.cueHistory = [];
    this.currentCue = undefined;
    this.executionCount = 0;
    this.cueStartTime = 0;
    this.lastCueChangeTime = 0;
    this.previousCueData = undefined;
  }

  /**
   * Handle a cue by delegating to the appropriate cue implementation
   * @param cueType The type of cue to handle
   * @param parameters The cue parameters
   */
  public abstract handleCue(cueType: CueType, parameters: CueData): Promise<void>;

  /**
   * Add history to CueData with context information
   * @param cueType The current cue type
   * @param parameters The original cue parameters
   * @returns CueData with history information
   */
  protected addHistoryToCueData(cueType: CueType, parameters: CueData): CueData {
    const now = Date.now();
    
    // Detect cue changes and update history
    if (this.currentCue !== cueType) {
      // Only add to history if different from the last cue (avoid immediate succession duplicates)
      if (this.currentCue && this.currentCue !== cueType) {
        this.cueHistory.push(this.currentCue);
        
        // Limit history to last 5 cues
        if (this.cueHistory.length > 5) {
          this.cueHistory.shift();
        }
      }
      
      this.currentCue = cueType;
      this.executionCount = 1;
      this.lastCueChangeTime = now;
      this.cueStartTime = now;
    } else {
      this.executionCount++;
    }

    // Calculate timing information
    const timeSinceLastCue = now - this.lastCueChangeTime;
    
    
    const historyCueData: CueData = {
      ...parameters,
      previousCue: this.cueHistory.length > 0 ? this.cueHistory[this.cueHistory.length - 1] : undefined,
      cueHistory: [...this.cueHistory],
      executionCount: this.executionCount,
      cueStartTime: this.cueStartTime,
      timeSinceLastCue,
      previousFrame: this.previousCueData
    };

    // Store current frame for next comparison
    this.previousCueData = {
      vocalNote: parameters.vocalNote,
      harmony0Note: parameters.harmony0Note,
      harmony1Note: parameters.harmony1Note,
      harmony2Note: parameters.harmony2Note,
      beat: parameters.beat,
      keyframe: parameters.keyframe
    };

    return historyCueData;
  }

  /**
   * Check if enough time has passed since the last cue
   * @returns true if enough time has passed, false otherwise
   */
  protected checkDebounce(): boolean {
    const now = Date.now();
    if (now - this.lastDebouncedCueTime < this.debouncePeriod) {
      return false;
    }
    this.lastDebouncedCueTime = now;
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

  /*
  public addCueDebouncedListener(listener: (data: CueData) => void): void {
    this.on('cueDebounced', listener);
  }

  public removeCueDebouncedListener(listener: (data: CueData) => void): void {
    this.off('cueDebounced', listener);
  }
  */

  /**
   * Set the debounce period for effects
   * @param time The debounce period in milliseconds
   */
  public setEffectDebouncePeriod(time: number): void {
    this.debouncePeriod = time;
  }

  /**
   * Clean up resources
   */
  public shutdown(): void {
    this.removeAllListeners();
  }

  public handleBeat(): void {
    this._sequencer.onBeat();
  }

  public handleKeyframe(): void {
    this._sequencer.onKeyframe();
  }

  public handleMeasure(): void {
    this._sequencer.onBeat();
    this._sequencer.onMeasure();
  }



  /**
   * Handle individual drum note events
   * @param noteType The type of drum note
   * @param data The cue data associated with the note
   */
  public handleDrumNote(noteType: DrumNoteType, _data: CueData): void {
    // Call the sequencer method for drum notes
    this._sequencer.onDrumNote(noteType);
  }

  /**
   * Handle individual guitar note events
   * @param noteType The type of guitar note
   * @param data The cue data associated with the note
   */
  public handleGuitarNote(noteType: InstrumentNoteType, _data: CueData): void {
    // Call the sequencer method for guitar notes
    this._sequencer.onGuitarNote(noteType);
  }

  /**
   * Handle individual bass note events
   * @param noteType The type of bass note
   * @param data The cue data associated with the note
   */
  public handleBassNote(noteType: InstrumentNoteType, _data: CueData): void {
    // Call the sequencer method for bass notes
    this._sequencer.onBassNote(noteType);
  }

  /**
   * Handle individual keys note events
   * @param noteType The type of keys note
   * @param data The cue data associated with the note
   */
  public handleKeysNote(noteType: InstrumentNoteType, _data: CueData): void {
    // Call the sequencer method for keys notes
    this._sequencer.onKeysNote(noteType);
  }

  public handleSustain(ms: number): void {
    console.warn("handleSustain called with", ms);
  }

  public setDebugMode(enable: boolean, refreshRateMs?: number): void {
    this.enableLightLayerDebug(enable, refreshRateMs);
  }

  public enableLightLayerDebug(enable: boolean, refreshRateMs?: number): void {
    this._sequencer.enableDebug(enable);
    if (refreshRateMs) {
      this._sequencer.debugLightLayers();
    }
  }

  protected getLights(group: LocationGroup[], target: LightTarget): TrackedLight[] {
    const lights = this._lightManager.getLightsInGroup(group);
    return this._lightManager.getLightsByTarget(lights, target);
  }

  protected msPerBeat(beatsPerMinute: number): number {
    return (60 * 1000) / beatsPerMinute;
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
  protected abstract handleCueStrobe_Fastest(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Fast(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Medium(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Slow(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Off(parameters: CueData): Promise<void>;
  protected abstract handleCueSweep(parameters: CueData): Promise<void>;
  protected abstract handleCueVerse(parameters: CueData): Promise<void>;
  protected abstract handleCueWarm_Automatic(parameters: CueData): Promise<void>;
  protected abstract handleCueWarm_Manual(parameters: CueData): Promise<void>;

  public getAvailableCueGroups(): CueGroup[] {
    const groupNames = this.registry.getAllGroups();
    const groups = groupNames.map(name => this.registry.getGroup(name)).filter(g => g);
    // The type from the registry is ICueGroup, we need to cast it to CueGroup
    return groups.map(g => ({ name: g!.name, description: g!.description })) as CueGroup[];
  }

  /**
   * Get current cue history for debugging/monitoring
   * @returns Object containing current cue state and history
   */
  public getCueHistoryState(): {
    currentCue?: CueType;
    previousCue?: CueType;
    cueHistory: CueType[];
    executionCount: number;
    timeSinceLastCue: number;
  } {
    return {
      currentCue: this.currentCue,
      previousCue: this.cueHistory.length > 0 ? this.cueHistory[this.cueHistory.length - 1] : undefined,
      cueHistory: [...this.cueHistory],
      executionCount: this.executionCount,
      timeSinceLastCue: Date.now() - this.lastCueChangeTime
    };
  }
} 