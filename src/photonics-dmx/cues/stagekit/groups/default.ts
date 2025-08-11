import { CueRegistry } from '../../CueRegistry';
import { CueType } from '../../cueTypes';
import { ICueGroup } from '../../interfaces/ICueGroup';

// Import StageKit group cues
import { StageKitMenuCue } from '../default/StageKitMenuCue';
import { StageKitScoreCue } from '../default/StageKitScoreCue';
import { StageKitLoopWarmCue } from '../default/StageKitLoopWarmCue';
import { StageKitLoopCoolCue } from '../default/StageKitLoopCoolCue';
import { StageKitDefaultCue } from '../default/StageKitDefaultCue';
import { StageKitStompCue } from '../default/StageKitStompCue';
import { StageKitDischordCue } from '../default/StageKitDischordCue';
import { StageKitIntroCue } from '../default/StageKitIntroCue';
import { StageKitHarmonyCue } from '../default/StageKitHarmonyCue';
import { StageKitSweepCue } from '../default/StageKitSweepCue';
import { StageKitFrenzyCue } from '../default/StageKitFrenzyCue';
import { StageKitSearchlightsCue } from '../default/StageKitSearchlightsCue';
import { StageKitSilhouettesCue } from '../default/StageKitSilhouettesCue';
import { StageKitSilhouettesSpotlightCue } from '../default/StageKitSilhouettesSpotlightCue';
import { StageKitBigRockEndingCue } from '../default/StageKitBigRockEndingCue';
import { StageKitFlareFastCue } from '../default/StageKitFlareFastCue';
import { StageKitFlareSlowCue } from '../default/StageKitFlareSlowCue';
import { StageKitBlackoutCue } from '../default/StageKitBlackoutCue';
import { StageKitStrobeFastCue } from '../default/StageKitStrobeFastCue';
import { StageKitStrobeFastestCue } from '../default/StageKitStrobeFastestCue';
import { StageKitStrobeMediumCue } from '../default/StageKitStrobeMediumCue';
import { StageKitStrobeOffCue } from '../default/StageKitStrobeOffCue';
import { StageKitStrobeSlowCue } from '../default/StageKitStrobeSlowCue';

/**
 * Create and register the StageKit default cue group.
 * The StageKit group provides implementations that try to match the original
 * Rock Band Stage Kit visual effects mapped to DMX lights.
 * These cues are designed to work with the 8-LED StageKit system.
 */
const stagekitGroup: ICueGroup = {
  id: 'stagekit',
  name: 'StageKit Default',
  description: 'StageKit cues that mimic the original Stage Kit visual effects',
  cues: new Map([
    [CueType.Menu, new StageKitMenuCue()],
    [CueType.Score, new StageKitScoreCue()],
    [CueType.Warm_Manual, new StageKitLoopWarmCue()],
    [CueType.Cool_Manual, new StageKitLoopCoolCue()],
    [CueType.Default, new StageKitDefaultCue()],
    [CueType.Stomp, new StageKitStompCue()],
    [CueType.Dischord, new StageKitDischordCue()],
    [CueType.Intro, new StageKitIntroCue()],
    [CueType.Harmony, new StageKitHarmonyCue()],
    [CueType.Sweep, new StageKitSweepCue()],
    [CueType.Frenzy, new StageKitFrenzyCue()],
    [CueType.Searchlights, new StageKitSearchlightsCue()],
    [CueType.Silhouettes, new StageKitSilhouettesCue()],
    [CueType.Silhouettes_Spotlight, new StageKitSilhouettesSpotlightCue()],
    [CueType.BigRockEnding, new StageKitBigRockEndingCue()],
    [CueType.Flare_Fast, new StageKitFlareFastCue()],
    [CueType.Flare_Slow, new StageKitFlareSlowCue()],
    [CueType.Blackout_Fast, new StageKitBlackoutCue()],
    [CueType.Strobe_Fast, new StageKitStrobeFastCue()],
    [CueType.Strobe_Fastest, new StageKitStrobeFastestCue()],
    [CueType.Strobe_Medium, new StageKitStrobeMediumCue()],
    [CueType.Strobe_Off, new StageKitStrobeOffCue()],
    [CueType.Strobe_Slow, new StageKitStrobeSlowCue()],
  ]),
};

// Get the registry instance and register the StageKit group
const registry = CueRegistry.getInstance();
registry.registerGroup(stagekitGroup); 