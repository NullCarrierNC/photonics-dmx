import { CueRegistry } from '../../CueRegistry';
import { CueType } from '../../cueTypes';
import { ICueGroup } from '../../interfaces/ICueGroup';

// Import StageKit group cues
import { StageKitMenuCue } from '../handlers/stagekit/StageKitMenuCue';
import { StageKitScoreCue } from '../handlers/stagekit/StageKitScoreCue';
import { StageKitLoopWarmCue } from '../handlers/stagekit/StageKitLoopWarmCue';
import { StageKitLoopCoolCue } from '../handlers/stagekit/StageKitLoopCoolCue';
import { StageKitDefaultCue } from '../handlers/stagekit/StageKitDefaultCue';
import { StageKitStompCue } from '../handlers/stagekit/StageKitStompCue';
import { StageKitDischordCue } from '../handlers/stagekit/StageKitDischordCue';
import { StageKitIntroCue } from '../handlers/stagekit/StageKitIntroCue';
import { StageKitHarmonyCue } from '../handlers/stagekit/StageKitHarmonyCue';
import { StageKitSweepCue } from '../handlers/stagekit/StageKitSweepCue';
import { StageKitFrenzyCue } from '../handlers/stagekit/StageKitFrenzyCue';
import { StageKitSearchlightsCue } from '../handlers/stagekit/StageKitSearchlightsCue';
import { StageKitSilhouettesCue } from '../handlers/stagekit/StageKitSilhouettesCue';
import { StageKitSilhouettesSpotlightCue } from '../handlers/stagekit/StageKitSilhouettesSpotlightCue';
import { StageKitBigRockEndingCue } from '../handlers/stagekit/StageKitBigRockEndingCue';
import { StageKitFlareFastCue } from '../handlers/stagekit/StageKitFlareFastCue';
import { StageKitFlareSlowCue } from '../handlers/stagekit/StageKitFlareSlowCue';
import { StageKitBlackoutCue } from '../handlers/stagekit/StageKitBlackoutCue';


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
  ]),
};

// Get the registry instance and register the StageKit group
const registry = CueRegistry.getInstance();
registry.registerGroup(stagekitGroup); 