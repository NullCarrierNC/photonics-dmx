import { CueData, CueType } from '../cues/cueTypes';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { DmxLightManager } from '../controllers/DmxLightManager';
import { BaseCueHandler } from './BaseCueHandler';


// Import YARG cue set to register with registry
import '../cues/yarg';

/**
 * YargCueHandler handles the cues called by the YARG network listener.
 * 
 * The handler uses a registry system to manage multiple sets of cue implementations.
 * When a cue is triggered:
 * 1. If no group is active, a random group is selected
 * 2. The cue is executed using the active group's implementation
 * 3. If the active group doesn't implement the cue, falls back to the default group
 * 
 * Reminder: setEffect clears all running effects, regardless of layer.
 * Layer 0 will maintain its state though.
 * addEffect will not clear other effects unless it's on the same layer.
 */
class YargCueHandler extends BaseCueHandler {
  constructor(
    lightManager: DmxLightManager,
    photonicsSequencer: ILightingController,
    debouncePeriod: number
  ) {
    super(lightManager, photonicsSequencer, debouncePeriod);
  }

  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
    if (!this.checkDebounce()) return;

    // Special cases that need to be handled differently
    switch (cueType) {
      case CueType.Blackout_Fast:
        this._sequencer.blackout(0);
        return;
      case CueType.Blackout_Slow:
        this._sequencer.blackout(1000);
        return;
      case CueType.Blackout_Spotlight:
        this._sequencer.blackout(0);
        return;
      case CueType.Strobe_Off:
        return; // Do nothing
      case CueType.Keyframe_First:
      case CueType.Keyframe_Next:
      case CueType.Keyframe_Previous:
        this.handleKeyframe();
        return;
      case CueType.NoCue:
        this._sequencer.blackout(0);
        return;
      case CueType.Menu:
        this.registry.setActiveGroups([]);
        break;
    }

    // Get implementation from registry
    const implementation = this.registry.getCueImplementation(cueType);
    if (implementation) {
      await implementation.execute(parameters, this._sequencer, this._lightManager);
    } else {
      console.error(`No implementation found for cue: ${cueType}`);
    }
  }

  /**
   * Handle keyframe navigation
   */
  public handleKeyframe(): void {
    // TODO: Implement keyframe handling
    console.warn('Keyframe handling not implemented');
  }

  protected async handleCueBigRockEnding(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.BigRockEnding, parameters);
  }

  protected async handleCueBlackout_Fast(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Blackout_Fast, _parameters);
  }

  protected async handleCueBlackout_Slow(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Blackout_Slow, _parameters);
  }

  protected async handleCueBlackout_Spotlight(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Blackout_Spotlight, _parameters);
  }

  protected async handleCueChorus(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Chorus, parameters);
  }

  protected async handleCueCool_Automatic(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Cool_Automatic, parameters);
  }

  protected async handleCueCool_Manual(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Cool_Manual, parameters);
  }

  protected async handleCueDefault(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Default, parameters);
  }

  protected async handleCueDischord(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Dischord, parameters);
  }

  protected async handleCueFlare_Fast(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Flare_Fast, parameters);
  }

  protected async handleCueFlare_Slow(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Flare_Slow, parameters);
  }

  protected async handleCueFrenzy(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Frenzy, parameters);
  }

  protected async handleCueHarmony(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Harmony, parameters);
  }

  protected async handleCueIntro(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Intro, parameters);
  }

  protected async handleCueKeyframe_First(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Keyframe_First, _parameters);
  }

  protected async handleCueKeyframe_Next(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Keyframe_Next, _parameters);
  }

  protected async handleCueKeyframe_Previous(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Keyframe_Previous, _parameters);
  }

  protected async handleCueMenu(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Menu, parameters);
  }

  protected async handleCueNoCue(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.NoCue, _parameters);
  }

  protected async handleCueScore(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Score, parameters);
  }

  protected async handleCueSearchlights(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Searchlights, parameters);
  }

  protected async handleCueSilhouettes(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Silhouettes, parameters);
  }

  protected async handleCueSilhouettes_Spotlight(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Silhouettes_Spotlight, parameters);
  }

  protected async handleCueStomp(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Stomp, parameters);
  }

  protected async handleCueStrobe_Fast(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Strobe_Fast, parameters);
  }

  protected async handleCueStrobe_Fastest(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Strobe_Fastest, parameters);
  }

  protected async handleCueStrobe_Medium(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Strobe_Medium, parameters);
  }

  protected async handleCueStrobe_Off(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Strobe_Off, parameters);
  }

  protected async handleCueStrobe_Slow(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Strobe_Slow, parameters);
  }

  protected async handleCueSweep(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Sweep, parameters);
  }

  protected async handleCueVerse(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Verse, parameters);
  }

  protected async handleCueWarm_Automatic(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Warm_Automatic, parameters);
  }

  protected async handleCueWarm_Manual(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Warm_Manual, parameters);
  }
}

export { YargCueHandler, CueType };