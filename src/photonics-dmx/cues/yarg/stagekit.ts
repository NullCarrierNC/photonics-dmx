import { CueRegistry } from '../CueRegistry';
import { CueType } from '../cueTypes';
import { ICueGroup } from '../interfaces/ICueGroup';

// Import StageKit group cues
import { StageKitMenuCue } from './handlers/stagekit/StageKitMenuCue';
import { StageKitScoreCue } from './handlers/stagekit/StageKitScoreCue';
import { StageKitDefaultCue } from './handlers/stagekit/StageKitDefaultCue';
import { StageKitStompCue } from './handlers/stagekit/StageKitStompCue';
import { StageKitDischordCue } from './handlers/stagekit/StageKitDischordCue';
import { StageKitIntroCue } from './handlers/stagekit/StageKitIntroCue';
import { StageKitHarmonyCue } from './handlers/stagekit/StageKitHarmonyCue';
import { StageKitSweepCue } from './handlers/stagekit/StageKitSweepCue';
import { StageKitFrenzyCue } from './handlers/stagekit/StageKitFrenzyCue';
import { StageKitSearchlightsCue } from './handlers/stagekit/StageKitSearchlightsCue';
import { StageKitSilhouettesCue } from './handlers/stagekit/StageKitSilhouettesCue';
import { StageKitSilhouettesSpotlightCue } from './handlers/stagekit/StageKitSilhouettesSpotlightCue';
import { StageKitFlareFastCue } from './handlers/stagekit/StageKitFlareFastCue';
import { StageKitFlareSlowCue } from './handlers/stagekit/StageKitFlareSlowCue';
import { StageKitWarmManualCue } from './handlers/stagekit/StageKitWarmManualCue';
import { StageKitCoolAutoCue } from './handlers/stagekit/StageKitCoolAutoCue';
import { StageKitCoolManualCue } from './handlers/stagekit/StageKitCoolManualCue';
import { StageKitWarmAutoCue } from './handlers/stagekit/StageKitWarmAutoCue';
import { StrobeFastCue } from './handlers/stagekit/StrobeFastCue';
import { StrobeFastestCue } from './handlers/stagekit/StrobeFastestCue';
import { StrobeMediumCue } from './handlers/stagekit/StrobeMediumCue';
import { StrobeOffCue } from './handlers/stagekit/StrobeOffCue';
import { StrobeSlowCue } from './handlers/stagekit/StrobeSlowCue';


/**
 * Create and register the StageKit default cue group.
 * The StageKit group provides implementations that try to match the original
 * Rock Band Stage Kit visual effects mapped to DMX lights.
 */
const stagekitGroup: ICueGroup = {
  id: 'stagekit',
  name: 'Stage Kit',
  description: 'Stage Kit cues that mimic the original Stage Kit visual effects. There is some variation to account for mapping to a smaller number of lights.',
  cues: new Map([
    [CueType.Menu, new StageKitMenuCue()],
    [CueType.Score, new StageKitScoreCue()],
    [CueType.Warm_Manual, new StageKitWarmManualCue()],
    [CueType.Cool_Manual, new StageKitCoolManualCue()],
    [CueType.Cool_Automatic, new StageKitCoolAutoCue()],
    [CueType.Warm_Automatic, new StageKitWarmAutoCue()],
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
    [CueType.Flare_Fast, new StageKitFlareFastCue()],
    [CueType.Flare_Slow, new StageKitFlareSlowCue()],
    // Register the strobes again so that we don't show a fallback in stage kit mode
    // when a strobe cue is triggered.
    [CueType.Strobe_Fast, new StrobeFastCue()],
    [CueType.Strobe_Fastest, new StrobeFastestCue()],
    [CueType.Strobe_Medium, new StrobeMediumCue()],
    [CueType.Strobe_Off, new StrobeOffCue()],
    [CueType.Strobe_Slow, new StrobeSlowCue()]
  ]),
};

// Get the registry instance and register the StageKit group
const registry = CueRegistry.getInstance();
registry.registerGroup(stagekitGroup); 
registry.setStageKitGroup(stagekitGroup.id);
registry.setDefaultGroup(stagekitGroup.id);
registry.activateGroup(stagekitGroup.id);