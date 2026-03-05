import { CueData, CueType } from '../cues/types/cueTypes'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { DmxLightManager } from '../controllers/DmxLightManager'
import { BaseCueHandler } from './BaseCueHandler'
import { INetCue } from '../cues/interfaces/INetCue'

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
const STROBE_TYPES: CueType[] = [
  CueType.Strobe_Fastest,
  CueType.Strobe_Fast,
  CueType.Strobe_Medium,
  CueType.Strobe_Slow,
  CueType.Strobe_Off,
]

class YargCueHandler extends BaseCueHandler {
  private currentPrimaryCue: INetCue | null = null
  private currentPrimaryCueType: CueType | null = null
  private currentSecondaryCue: INetCue | null = null
  private currentSecondaryCueType: CueType | null = null

  constructor(
    lightManager: DmxLightManager,
    photonicsSequencer: ILightingController,
    debouncePeriod: number,
  ) {
    super(lightManager, photonicsSequencer, debouncePeriod)
  }

  /**
   * Handle a beat event from YARG
   */
  public handleBeat(): void {
    this._sequencer.onBeat()
  }

  /**
   * Handle a measure event from YARG
   */
  public handleMeasure(): void {
    this._sequencer.onBeat()
    this._sequencer.onMeasure()
  }

  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
    if (!this.checkDebounce()) return

    // Update CueData with history and context information
    const historicCueData = this.addHistoryToCueData(cueType, parameters)

    // Special cases that need to be handled differently
    switch (cueType) {
      case CueType.Blackout_Fast:
        this.stopCurrentCue()
        this._sequencer.blackout(0)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Blackout_Slow:
        this.stopCurrentCue()
        this._sequencer.blackout(500)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Blackout_Spotlight:
        this.stopCurrentCue()
        this._sequencer.blackout(0)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Strobe_Off:
        if (this.currentSecondaryCue) {
          this.currentSecondaryCue.onStop?.()
          this.currentSecondaryCue = null
          this.currentSecondaryCueType = null
        }
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Keyframe_First:
      case CueType.Keyframe_Next:
      case CueType.Keyframe_Previous:
        this.handleKeyframe()
        this.emit('cueHandled', historicCueData)
        return
      case CueType.NoCue:
        this.stopCurrentCue()
        this._sequencer.blackout(0)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Menu:
      //      this.stopCurrentCue();
      //     break;
    }

    // Get implementation from registry
    // Use trackMode, defaulting to 'tracked' if not specified
    const trackMode = parameters.trackMode || 'tracked'
    const cue = this.registry.getCueImplementation(cueType, trackMode)

    if (cue) {
      const incomingIsStrobe = STROBE_TYPES.includes(cueType)

      if (incomingIsStrobe) {
        // Strobes run on top of primary; track separately so we don't lose the primary cue reference.
        if (this.currentSecondaryCueType !== cueType) {
          if (this.currentSecondaryCue) {
            this.currentSecondaryCue.onStop?.()
            this.currentSecondaryCue = null
            this.currentSecondaryCueType = null
          }
          this.currentSecondaryCue = cue
          this.currentSecondaryCueType = cueType
        }
      } else {
        // Non-strobe (primary) cue: stop previous primary only; leave secondary (strobe) untouched.
        if (this.currentPrimaryCueType !== cueType) {
          if (this.currentPrimaryCue) {
            this.currentPrimaryCue.onStop?.()
            this.currentPrimaryCue = null
            this.currentPrimaryCueType = null
          }
          this.currentPrimaryCue = cue
          this.currentPrimaryCueType = cueType
        }
      }

      await cue.execute(historicCueData, this._sequencer, this._lightManager)
      this.emit('cueHandled', historicCueData)
    } else {
      console.error(`No implementation found for cue: ${cueType}`)
      this.emit('cueHandled', historicCueData)
    }
  }

  /**
   * Stop the currently executing primary and secondary cues and call their onStop lifecycle methods.
   * Used when transitioning to a new primary cue, on blackout, and by stopActiveCue().
   */
  private stopCurrentCue(): void {
    if (this.currentPrimaryCue) {
      this.currentPrimaryCue.onStop?.()
      this.currentPrimaryCue = null
      this.currentPrimaryCueType = null
    }
    if (this.currentSecondaryCue) {
      this.currentSecondaryCue.onStop?.()
      this.currentSecondaryCue = null
      this.currentSecondaryCueType = null
    }
  }

  /**
   * Stop the active cue (if any) and run its onStop lifecycle.
   * Used by Cue Simulation / test harnesses so restarting the same cue works reliably.
   */
  public stopActiveCue(): void {
    this.stopCurrentCue()
  }

  /**
   * Handle keyframe navigation
   */
  public handleKeyframe(): void {
    this._sequencer.onKeyframe()
  }

  protected async handleCueBigRockEnding(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.BigRockEnding, parameters)
  }

  protected async handleCueBlackout_Fast(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Blackout_Fast, _parameters)
  }

  protected async handleCueBlackout_Slow(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Blackout_Slow, _parameters)
  }

  protected async handleCueBlackout_Spotlight(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Blackout_Spotlight, _parameters)
  }

  protected async handleCueChorus(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Chorus, parameters)
  }

  protected async handleCueCool_Automatic(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Cool_Automatic, parameters)
  }

  protected async handleCueCool_Manual(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Cool_Manual, parameters)
  }

  protected async handleCueDefault(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Default, parameters)
  }

  protected async handleCueDischord(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Dischord, parameters)
  }

  protected async handleCueFlare_Fast(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Flare_Fast, parameters)
  }

  protected async handleCueFlare_Slow(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Flare_Slow, parameters)
  }

  protected async handleCueFrenzy(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Frenzy, parameters)
  }

  protected async handleCueHarmony(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Harmony, parameters)
  }

  protected async handleCueIntro(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Intro, parameters)
  }

  protected async handleCueKeyframe_First(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Keyframe_First, _parameters)
  }

  protected async handleCueKeyframe_Next(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Keyframe_Next, _parameters)
  }

  protected async handleCueKeyframe_Previous(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Keyframe_Previous, _parameters)
  }

  protected async handleCueMenu(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Menu, parameters)
  }

  protected async handleCueNoCue(_parameters: CueData): Promise<void> {
    await this.handleCue(CueType.NoCue, _parameters)
  }

  protected async handleCueScore(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Score, parameters)
  }

  protected async handleCueSearchlights(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Searchlights, parameters)
  }

  protected async handleCueSilhouettes(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Silhouettes, parameters)
  }

  protected async handleCueSilhouettes_Spotlight(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Silhouettes_Spotlight, parameters)
  }

  protected async handleCueStomp(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Stomp, parameters)
  }

  protected async handleCueStrobe_Fast(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Strobe_Fast, parameters)
  }

  protected async handleCueStrobe_Fastest(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Strobe_Fastest, parameters)
  }

  protected async handleCueStrobe_Medium(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Strobe_Medium, parameters)
  }

  protected async handleCueStrobe_Off(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Strobe_Off, parameters)
  }

  protected async handleCueStrobe_Slow(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Strobe_Slow, parameters)
  }

  protected async handleCueSweep(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Sweep, parameters)
  }

  protected async handleCueVerse(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Verse, parameters)
  }

  protected async handleCueWarm_Automatic(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Warm_Automatic, parameters)
  }

  protected async handleCueWarm_Manual(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Warm_Manual, parameters)
  }

  /**
   * Clean up resources and call destroy lifecycle on any executing cue
   */
  public shutdown(): void {
    if (this.currentPrimaryCue) {
      this.currentPrimaryCue.onDestroy?.()
      this.currentPrimaryCue = null
      this.currentPrimaryCueType = null
    }
    if (this.currentSecondaryCue) {
      this.currentSecondaryCue.onDestroy?.()
      this.currentSecondaryCue = null
      this.currentSecondaryCueType = null
    }
    super.shutdown()
  }
}

export { YargCueHandler, CueType }
