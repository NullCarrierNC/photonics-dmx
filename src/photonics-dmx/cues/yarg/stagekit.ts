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


/**
 * Create and register the StageKit default cue group.
 * The StageKit group provides implementations that try to match the original
 * Rock Band Stage Kit visual effects mapped to DMX lights.
 * These cues are designed to work with the 8-LED StageKit system.
 */
const stagekitGroup: ICueGroup = {
  id: 'stagekit',
  name: 'StageKit',
  description: 'Stage Kit cues that mimic the original Stage Kit visual effects',
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
  ]),
};

// Get the registry instance and register the StageKit group
const registry = CueRegistry.getInstance();
registry.registerGroup(stagekitGroup); 
registry.setStageKitGroup(stagekitGroup.id);