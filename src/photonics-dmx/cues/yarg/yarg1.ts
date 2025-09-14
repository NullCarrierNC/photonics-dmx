import { CueRegistry } from '../CueRegistry';
import { CueType } from '../cueTypes';
import { ICueGroup } from '../interfaces/ICueGroup';

// Import default group cues
import { DefaultCue } from './handlers/yarg1/DefaultCue';
import { DischordCue } from './handlers/yarg1/DischordCue';
import { ChorusCue } from './handlers/yarg1/ChorusCue';
import { CoolManualCue } from './handlers/yarg1/CoolManualCue';
import { StompCue } from './handlers/yarg1/StompCue';
import { VerseCue } from './handlers/yarg1/VerseCue';
import { WarmManualCue } from './handlers/yarg1/WarmManualCue';
import { BigRockEndingCue } from './handlers/yarg1/BigRockEndingCue';
import { CoolAutomaticCue } from './handlers/yarg1/CoolAutomaticCue';
import { FlareFastCue } from './handlers/yarg1/FlareFastCue';
import { FlareSlowCue } from './handlers/yarg1/FlareSlowCue';
import { FrenzyCue } from './handlers/yarg1/FrenzyCue';
import { IntroCue } from './handlers/yarg1/IntroCue';
import { HarmonyCue } from './handlers/yarg1/HarmonyCue';
import { SilhouettesCue } from './handlers/yarg1/SilhouettesCue';
import { SilhouettesSpotlightCue } from './handlers/yarg1/SilhouettesSpotlightCue';
import { SweepCue } from './handlers/yarg1/SweepCue';
import { WarmAutomaticCue } from './handlers/yarg1/WarmAutomaticCue';
import { ScoreCue } from './handlers/yarg1/ScoreCue';
import { StrobeFastCue } from './handlers/stagekit/StrobeFastCue';
import { StrobeFastestCue } from './handlers/stagekit/StrobeFastestCue';
import { StrobeMediumCue } from './handlers/stagekit/StrobeMediumCue';
import { StrobeOffCue } from './handlers/stagekit/StrobeOffCue';
import { StrobeSlowCue } from './handlers/stagekit/StrobeSlowCue';
import { MenuCue } from './handlers/yarg1/MenuCue';
import { SearchlightsCue } from './handlers/yarg1/SearchlightsCue';


const defaultGroup: ICueGroup = {
  id: 'yarg1',
  name: 'YARG Alternative Set 1',
  description: 'An alternatiive set of YARG cues largely inspired by, but not matching, the original Stage Kit.',
  cues: new Map([
    [CueType.Default, new DefaultCue()],
    [CueType.Dischord, new DischordCue()],
    [CueType.Chorus, new ChorusCue()],
    [CueType.Cool_Manual, new CoolManualCue()],
    [CueType.Stomp, new StompCue()],
    [CueType.Verse, new VerseCue()],
    [CueType.Warm_Manual, new WarmManualCue()],
    [CueType.BigRockEnding, new BigRockEndingCue()],
    [CueType.Cool_Automatic, new CoolAutomaticCue()],
    [CueType.Flare_Fast, new FlareFastCue()],
    [CueType.Flare_Slow, new FlareSlowCue()],
    [CueType.Frenzy, new FrenzyCue()],
    [CueType.Intro, new IntroCue()],
    [CueType.Harmony, new HarmonyCue()],
    [CueType.Silhouettes, new SilhouettesCue()],
    [CueType.Silhouettes_Spotlight, new SilhouettesSpotlightCue()],
    [CueType.Sweep, new SweepCue()],
    [CueType.Warm_Automatic, new WarmAutomaticCue()],
    [CueType.Score, new ScoreCue()],
    [CueType.Strobe_Fast, new StrobeFastCue()],
    [CueType.Strobe_Fastest, new StrobeFastestCue()],
    [CueType.Strobe_Medium, new StrobeMediumCue()],
    [CueType.Strobe_Off, new StrobeOffCue()],
    [CueType.Strobe_Slow, new StrobeSlowCue()],
    [CueType.Menu, new MenuCue()],
    [CueType.Searchlights, new SearchlightsCue()],
  ]),
};

// Get the registry instance and register the default group
const registry = CueRegistry.getInstance();
registry.registerGroup(defaultGroup); 
