import { CueData, CueType } from '../cues/cueTypes';
import { yargCues } from '../cues/yarg';
import { AbstractCueHandler } from './AbstractCueHandler';
import { ILightingController } from '../controllers/sequencer/interfaces';
import { DmxLightManager } from '../controllers/DmxLightManager';


/**
 * Complex style cues intended for YARG.
 * Provides the visual effects you see in game.
 * Some effects rely on game data only available 
 * from YARG. These won't work well with RB3.
 * 
 * Reminder: setEffect clears all running effects, regardless of layer.
 * Layer 0 will maintain its state though.
 * addEffect will not clear other effects unless it's on the same layer.
 */
class YargCueHandler extends AbstractCueHandler {
  /**
   * Creates a new YargCueHandler.
   * 
   * @param lightManager The DmxLightManager to use
   * @param photonicsSequencer The PhotonicsSequencer instance that manages all light effects
   * @param debouncePeriod Minimum time between repeated cues in milliseconds
   */
  constructor(
    lightManager: DmxLightManager,
    photonicsSequencer: ILightingController,
    debouncePeriod: number
  ) {
    super(lightManager, photonicsSequencer, debouncePeriod);
    console.log('YargCueHandler running');
  }

  /**
   * Handle a cue by delegating to the appropriate cue implementation
   * @param cueType The type of cue to handle
   * @param parameters The cue parameters
   */
  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
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
    }

    // Handle standard cues by calling the appropriate method
    switch (cueType) {
      case CueType.BigRockEnding:
        await this.handleCueBigRockEnding(parameters);
        break;
      case CueType.Chorus:
        await this.handleCueChorus(parameters);
        break;
      case CueType.Cool_Automatic:
        await this.handleCueCool_Automatic(parameters);
        break;
      case CueType.Cool_Manual:
        await this.handleCueCool_Manual(parameters);
        break;
      case CueType.Default:
        await this.handleCueDefault(parameters);
        break;
      case CueType.Dischord:
        await this.handleCueDischord(parameters);
        break;
      case CueType.Flare_Fast:
        await this.handleCueFlare_Fast(parameters);
        break;
      case CueType.Flare_Slow:
        await this.handleCueFlare_Slow(parameters);
        break;
      case CueType.Frenzy:
        await this.handleCueFrenzy(parameters);
        break;
      case CueType.Harmony:
        await this.handleCueHarmony(parameters);
        break;
      case CueType.Intro:
        await this.handleCueIntro(parameters);
        break;
      case CueType.Menu:
        await this.handleCueMenu(parameters);
        break;
      case CueType.Score:
        await this.handleCueScore(parameters);
        break;
      case CueType.Searchlights:
        await this.handleCueSearchlights(parameters);
        break;
      case CueType.Silhouettes:
        await this.handleCueSilhouettes(parameters);
        break;
      case CueType.Silhouettes_Spotlight:
        await this.handleCueSilhouettes_Spotlight(parameters);
        break;
      case CueType.Stomp:
        await this.handleCueStomp(parameters);
        break;
      case CueType.Strobe_Fast:
        await this.handleCueStrobe_Fast(parameters);
        break;
      case CueType.Strobe_Fastest:
        await this.handleCueStrobe_Fastest(parameters);
        break;
      case CueType.Strobe_Medium:
        await this.handleCueStrobe_Medium(parameters);
        break;
      case CueType.Strobe_Slow:
        await this.handleCueStrobe_Slow(parameters);
        break;
      case CueType.Sweep:
        await this.handleCueSweep(parameters);
        break;
      case CueType.Verse:
        await this.handleCueVerse(parameters);
        break;
      case CueType.Warm_Automatic:
        await this.handleCueWarm_Automatic(parameters);
        break;
      case CueType.Warm_Manual:
        await this.handleCueWarm_Manual(parameters);
        break;
      default:
        console.warn(`No implementation found for cue: ${cueType}`);
    }
  }

  protected async handleCueBigRockEnding(parameters: CueData): Promise<void> {
    await yargCues.big_rock_ending.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueBlackout_Fast(_parameters: CueData): Promise<void> {
    this._sequencer.blackout(0);
  }

  protected async handleCueBlackout_Slow(_parameters: CueData): Promise<void> {
    this._sequencer.blackout(1000);
  }

  protected async handleCueBlackout_Spotlight(_parameters: CueData): Promise<void> {
    this._sequencer.blackout(0);
  }

  protected async handleCueChorus(parameters: CueData): Promise<void> {
    await yargCues.chorus.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueCool_Automatic(parameters: CueData): Promise<void> {
    await yargCues.cool_automatic.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueCool_Manual(parameters: CueData): Promise<void> {
    await yargCues.cool_manual.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueDefault(parameters: CueData): Promise<void> {
    await yargCues.default.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueDischord(parameters: CueData): Promise<void> {
    await yargCues.dischord.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueFlare_Fast(parameters: CueData): Promise<void> {
    await yargCues.flare_fast.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueFlare_Slow(parameters: CueData): Promise<void> {
    await yargCues.flare_slow.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueFrenzy(parameters: CueData): Promise<void> {
    await yargCues.frenzy.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueHarmony(parameters: CueData): Promise<void> {
    await yargCues.harmony.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueIntro(parameters: CueData): Promise<void> {
    await yargCues.intro.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueKeyframe_First(_parameters: CueData): Promise<void> {
    this.handleKeyframe();
  }

  protected async handleCueKeyframe_Next(_parameters: CueData): Promise<void> {
    this.handleKeyframe();
  }

  protected async handleCueKeyframe_Previous(_parameters: CueData): Promise<void> {
    this.handleKeyframe();
  }

  protected async handleCueMenu(parameters: CueData): Promise<void> {
    await yargCues.menu.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueNoCue(_parameters: CueData): Promise<void> {
    this._sequencer.blackout(0);
  }

  protected async handleCueScore(parameters: CueData): Promise<void> {
    await yargCues.score.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueSearchlights(parameters: CueData): Promise<void> {
    await yargCues.searchlights.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueSilhouettes(parameters: CueData): Promise<void> {
    await yargCues.silhouettes.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueSilhouettes_Spotlight(parameters: CueData): Promise<void> {
    await yargCues.silhouettes_spotlight.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueStomp(parameters: CueData): Promise<void> {
    await yargCues.stomp.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueStrobe_Fast(parameters: CueData): Promise<void> {
    await yargCues.strobe_fast.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueStrobe_Fastest(parameters: CueData): Promise<void> {
    await yargCues.strobe_fastest.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueStrobe_Medium(parameters: CueData): Promise<void> {
    await yargCues.strobe_medium.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueStrobe_Off(parameters: CueData): Promise<void> {
    await yargCues.strobe_off.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueStrobe_Slow(parameters: CueData): Promise<void> {
    await yargCues.strobe_slow.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueSweep(parameters: CueData): Promise<void> {
    await yargCues.sweep.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueVerse(parameters: CueData): Promise<void> {
    await yargCues.verse.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueWarm_Automatic(parameters: CueData): Promise<void> {
    await yargCues.warm_automatic.execute(parameters, this._sequencer, this._lightManager);
  }

  protected async handleCueWarm_Manual(parameters: CueData): Promise<void> {
    await yargCues.warm_manual.execute(parameters, this._sequencer, this._lightManager);
  }

  /**
   * Handle keyframe navigation
   */
  public handleKeyframe(): void {
    // TODO: Implement keyframe handling
    console.warn('Keyframe handling not implemented');
  }
}

export { YargCueHandler, CueType };