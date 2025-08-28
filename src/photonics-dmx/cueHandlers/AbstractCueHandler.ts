import { EventEmitter } from 'events';
import { CueData, CueType } from '../cues/cueTypes';
import { LightTarget, LocationGroup,  TrackedLight } from '../types';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { ILightingController } from '../controllers/sequencer/interfaces';
/** 
 * TODO: WE're moving away from this class to use BaseCueHandler instead.
 * The current RB3E cue handler is still using it pending refactor to use 
 * external cue definitions.
*/
export abstract class AbstractCueHandler extends EventEmitter {
  protected _lightManager: DmxLightManager;
  /**
   * Central interface to the PhotonicsSequencer, through which all effect operations
   * should be performed.
   */
  protected _sequencer: ILightingController;

  // Debounce and cue management
  protected debouncePeriod: number;
  protected debouncedCues: CueType[];
  protected lastDebouncedCueTime: number = 0;
  protected lastDebouncedCueData: CueData | null = null;
  protected lastDebouncedCueCallback: (() => void) | null = null;
  protected lastCue: string = '';

  // Timeout for inactivity (e.g. to trigger a blackout after a period of no cues)
  protected timeoutHandle: NodeJS.Timeout | number | null = null;
  protected readonly INACTIVITY_TIMEOUT = 15000;

  /**
   * Creates a new CueHandler
   * @param lightManager The DmxLightManager that manages virtual light instances
   * @param photonicsSequencer The PhotonicsSequencer instance that serves as the central coordinator for all light effects
   * @param debouncePeriod Time in milliseconds to debounce rapid cue calls
   */
  constructor(
    lightManager: DmxLightManager,
    photonicsSequencer: ILightingController,
    debouncePeriod: number
  ) {
    super();
    this._lightManager = lightManager;
    this._sequencer = photonicsSequencer;
    this.debouncePeriod = debouncePeriod;
    this.debouncedCues = [
      CueType.Default,
      CueType.Dischord,
      CueType.Chorus,
      CueType.Cool_Manual,
      CueType.Cool_Automatic,
      CueType.Verse,
      CueType.Warm_Automatic,
      CueType.Warm_Manual,
      CueType.BigRockEnding,
      CueType.Blackout_Fast,
      CueType.Blackout_Slow,
      CueType.Blackout_Spotlight,
      CueType.Frenzy,
      CueType.Intro,
      CueType.Harmony,
      CueType.Silhouettes,
      CueType.Silhouettes_Spotlight,
      CueType.Searchlights,
      CueType.Menu,
      CueType.Score,
    ];
    this.resetTimeout();
  }


  // ABSTRACT CUE HANDLERS
  // Subclasses must implement these methods to provide cue-specific logic.
  protected abstract handleCueDefault(parameters: CueData): Promise<void>;
  protected abstract handleCueDischord(parameters: CueData): Promise<void>;
  protected abstract handleCueChorus(parameters: CueData): Promise<void>;
  protected abstract handleCueCool_Manual(parameters: CueData): Promise<void>;
  protected abstract handleCueStomp(parameters: CueData): Promise<void>;
  protected abstract handleCueVerse(parameters: CueData): Promise<void>;
  protected abstract handleCueWarm_Manual(parameters: CueData): Promise<void>;
  protected abstract handleCueBigRockEnding(parameters: CueData): Promise<void>;
  protected abstract handleCueBlackout_Fast(parameters: CueData): Promise<void>;
  protected abstract handleCueBlackout_Slow(parameters: CueData): Promise<void>;
  protected abstract handleCueBlackout_Spotlight(parameters: CueData): Promise<void>;
  protected abstract handleCueCool_Automatic(parameters: CueData): Promise<void>;
  protected abstract handleCueFlare_Fast(parameters: CueData): Promise<void>;
  protected abstract handleCueFlare_Slow(parameters: CueData): Promise<void>;
  protected abstract handleCueFrenzy(parameters: CueData): Promise<void>;
  protected abstract handleCueIntro(parameters: CueData): Promise<void>;
  protected abstract handleCueHarmony(parameters: CueData): Promise<void>;
  protected abstract handleCueSilhouettes(parameters: CueData): Promise<void>;
  protected abstract handleCueSilhouettes_Spotlight(parameters: CueData): Promise<void>;
  protected abstract handleCueSearchlights(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Fastest(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Fast(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Medium(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Slow(parameters: CueData): Promise<void>;
  protected abstract handleCueStrobe_Off(parameters: CueData): Promise<void>;
  protected abstract handleCueSweep(parameters: CueData): Promise<void>;
  protected abstract handleCueWarm_Automatic(parameters: CueData): Promise<void>;
  protected abstract handleCueKeyframe_First(parameters: CueData): Promise<void>;
  protected abstract handleCueKeyframe_Next(parameters: CueData): Promise<void>;
  protected abstract handleCueKeyframe_Previous(parameters: CueData): Promise<void>;
  protected abstract handleCueMenu(parameters: CueData): Promise<void>;
  protected abstract handleCueScore(parameters: CueData): Promise<void>;
  

    /**
   * Enable or disable real-time debugging of light layers
   * @param enable Whether to enable debugging
   * @param refreshRateMs Optional refresh rate in milliseconds
   */
    public setDebugMode(enable: boolean, refreshRateMs?: number): void {
      this.enableLightLayerDebug(enable, refreshRateMs);
    }


    
  /**
   * Provide a default implementation for unknown or no–cue.
   */
  protected async handleCueNoCue(_parameters: CueData): Promise<void> {
    await this._sequencer.blackout(10);
  }

  public addCueHandledListener(listener: (data: CueData) => void): void {
    this.on('cueHandled', listener);
  }

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

  public setEffectDebouncePeriod(time: number): void {
    this.debouncePeriod = time;
  }

  public shutdown(): void {
    this.removeAllListeners();
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle as NodeJS.Timeout);
    }
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

  public handleSustain(ms: number): void {
    console.warn("handleSustain called with", ms);
  }


  public handleCue(cue: CueType, parameters: CueData): void {
    // If the cue is in the list of debounced cues, enforce the debounce logic.
    if (this.debouncedCues.includes(cue)) {
      const now = Date.now();
      if (now - this.lastDebouncedCueTime < this.debouncePeriod) {
        if (
          this.lastDebouncedCueData &&
          JSON.stringify(this.lastDebouncedCueData) === JSON.stringify(parameters)
        ) {
          // Still handle strobe if needed.
          this.handleStrobe(parameters);
          return;
        }
        this.lastDebouncedCueData = parameters;
        if (this.lastDebouncedCueCallback) {
          this.lastDebouncedCueCallback();
        }
        // this.emit('cueDebounced', parameters); // Commented out as debounced cues are unnecessary
        this.handleStrobe(parameters);
        return;
      }
      this.lastDebouncedCueTime = now;
    }

    // Dispatch to the appropriate abstract cue handler
    let cuePromise: Promise<void>;
    switch (cue) {
      case CueType.Default:
        cuePromise = this.handleCueDefault(parameters);
        break;
      case CueType.Dischord:
        cuePromise = this.handleCueDischord(parameters);
        break;
      case CueType.Chorus:
        cuePromise = this.handleCueChorus(parameters);
        break;
      case CueType.Cool_Manual:
        cuePromise = this.handleCueCool_Manual(parameters);
        break;
      case CueType.Stomp:
        cuePromise = this.handleCueStomp(parameters);
        break;
      case CueType.Verse:
        cuePromise = this.handleCueVerse(parameters);
        break;
      case CueType.Warm_Manual:
        cuePromise = this.handleCueWarm_Manual(parameters);
        break;
      case CueType.BigRockEnding:
        cuePromise = this.handleCueBigRockEnding(parameters);
        break;
      case CueType.Blackout_Fast:
        cuePromise = this.handleCueBlackout_Fast(parameters);
        break;
      case CueType.Blackout_Slow:
        cuePromise = this.handleCueBlackout_Slow(parameters);
        break;
      case CueType.Blackout_Spotlight:
        cuePromise = this.handleCueBlackout_Spotlight(parameters);
        break;
      case CueType.Cool_Automatic:
        cuePromise = this.handleCueCool_Automatic(parameters);
        break;
      case CueType.Flare_Fast:
        cuePromise = this.handleCueFlare_Fast(parameters);
        break;
      case CueType.Flare_Slow:
        cuePromise = this.handleCueFlare_Slow(parameters);
        break;
      case CueType.Frenzy:
        cuePromise = this.handleCueFrenzy(parameters);
        break;
      case CueType.Intro:
        cuePromise = this.handleCueIntro(parameters);
        break;
      case CueType.Harmony:
        cuePromise = this.handleCueHarmony(parameters);
        break;
      case CueType.Silhouettes:
        cuePromise = this.handleCueSilhouettes(parameters);
        break;
      case CueType.Silhouettes_Spotlight:
        cuePromise = this.handleCueSilhouettes_Spotlight(parameters);
        break;
      case CueType.Searchlights:
        cuePromise = this.handleCueSearchlights(parameters);
        break;
      case CueType.Strobe_Fastest:
        cuePromise = this.handleCueStrobe_Fastest(parameters);
        break;
      case CueType.Strobe_Fast:
        cuePromise = this.handleCueStrobe_Fast(parameters);
        break;
      case CueType.Strobe_Medium:
        cuePromise = this.handleCueStrobe_Medium(parameters);
        break;
      case CueType.Strobe_Slow:
        cuePromise = this.handleCueStrobe_Slow(parameters);
        break;
      case CueType.Strobe_Off:
        cuePromise = this.handleCueStrobe_Off(parameters);
        break;
      case CueType.Sweep:
        cuePromise = this.handleCueSweep(parameters);
        break;
      case CueType.Warm_Automatic:
        cuePromise = this.handleCueWarm_Automatic(parameters);
        break;
      case CueType.Keyframe_First:
        cuePromise = this.handleCueKeyframe_First(parameters);
        break;
      case CueType.Keyframe_Next:
        cuePromise = this.handleCueKeyframe_Next(parameters);
        break;
      case CueType.Keyframe_Previous:
        cuePromise = this.handleCueKeyframe_Previous(parameters);
        break;
      case CueType.Menu:
        cuePromise = this.handleCueMenu(parameters);
        break;
      case CueType.Score:
        cuePromise = this.handleCueScore(parameters);
        break;
      case CueType.NoCue:
        cuePromise = this.handleCueNoCue(parameters);
        break;
      case CueType.Strobe:
        // Don't directly call the strobe handler, the handleStrobe below will do it.
        // This is a special case for RB3 where the strobe cue is handled by the right channel.
        cuePromise = Promise.resolve();
        break;

      case CueType.Unknown:
      default:
        console.warn(`Unknown cue: ${cue}`);
        cuePromise = this.handleCueNoCue(parameters);
        break;
    }

    if (this.debouncedCues.includes(cue)) {
      this.lastDebouncedCueCallback = () => {
      };
    }

    cuePromise.then(() => {
      this.emit('cueHandled', parameters);
      this.handleStrobe(parameters);
      this.resetTimeout();
    });
  }

 
 
 
  protected handleStrobe(parameters: CueData): void {
    if (parameters.strobeState === 'Strobe_Off') {
      this.handleCueStrobe_Off(parameters);
    } else if (parameters.strobeState === 'Strobe_Slow') {
      this.handleCueStrobe_Slow(parameters);
    } else if (parameters.strobeState === 'Strobe_Medium') {
      this.handleCueStrobe_Medium(parameters);
    } else if (parameters.strobeState === 'Strobe_Fast') {
      this.handleCueStrobe_Fast(parameters);
    } else if (parameters.strobeState === 'Strobe_Fastest') {
      this.handleCueStrobe_Fastest(parameters);
    }
  }


  protected async clearPreviousCue(cueName: string): Promise<void> {
    if (this.lastCue !== cueName) {
      console.warn(`>>>>> ${cueName}`);
      await this._sequencer.blackout(0);
    }
    this.lastCue = cueName;
  }


  /**
   * Helper method for subclasses to reset the timeout.
   * @protected
   */
  protected resetTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle as NodeJS.Timeout);
    }
    this.timeoutHandle = setTimeout(() => {
      // Perform inactivity timeout actions here
      // This would typically call a method to handle the timeout
      console.log('Inactivity timeout reached');
    }, this.INACTIVITY_TIMEOUT);
  }

  
  /**
   * Enable or disable real-time light layer debugging
   * @param enable Whether to enable real-time debugging
   * @param refreshRateMs Optional refresh rate (default: 2000ms)
   */
  public enableLightLayerDebug(enable: boolean, refreshRateMs?: number): void {
    this._sequencer.enableDebug(enable, refreshRateMs);
  }

  protected getLights(group: LocationGroup[], target: LightTarget): TrackedLight[] {
    return this._lightManager.getLights(group, target);
  }


  protected msPerBeat(beatsPerMinute: number): number {
    const beatsPerSecond = beatsPerMinute * 60;
    if (beatsPerSecond <= 0) {
      throw new Error("Beats per second must be greater than zero");
    }
    return 1000 / beatsPerSecond;
  }




}