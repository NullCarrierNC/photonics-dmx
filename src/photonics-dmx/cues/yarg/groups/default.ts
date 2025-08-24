import { CueRegistry } from '../../CueRegistry';
import { CueType } from '../../cueTypes';
import { ICueGroup } from '../../interfaces/ICueGroup';

// Import default group cues
import { DefaultCue } from '../handlers/default/DefaultCue';
import { DischordCue } from '../handlers/default/DischordCue';
import { ChorusCue } from '../handlers/default/ChorusCue';
import { CoolManualCue } from '../handlers/default/CoolManualCue';
import { StompCue } from '../handlers/default/StompCue';
import { VerseCue } from '../handlers/default/VerseCue';
import { WarmManualCue } from '../handlers/default/WarmManualCue';
import { BigRockEndingCue } from '../handlers/default/BigRockEndingCue';
import { CoolAutomaticCue } from '../handlers/default/CoolAutomaticCue';
import { FlareFastCue } from '../handlers/default/FlareFastCue';
import { FlareSlowCue } from '../handlers/default/FlareSlowCue';
import { FrenzyCue } from '../handlers/default/FrenzyCue';
import { IntroCue } from '../handlers/default/IntroCue';
import { HarmonyCue } from '../handlers/default/HarmonyCue';
import { SilhouettesCue } from '../handlers/default/SilhouettesCue';
import { SilhouettesSpotlightCue } from '../handlers/default/SilhouettesSpotlightCue';
import { SweepCue } from '../handlers/default/SweepCue';
import { WarmAutomaticCue } from '../handlers/default/WarmAutomaticCue';
import { ScoreCue } from '../handlers/default/ScoreCue';
import { StrobeFastCue } from '../handlers/default/StrobeFastCue';
import { StrobeFastestCue } from '../handlers/default/StrobeFastestCue';
import { StrobeMediumCue } from '../handlers/default/StrobeMediumCue';
import { StrobeOffCue } from '../handlers/default/StrobeOffCue';
import { StrobeSlowCue } from '../handlers/default/StrobeSlowCue';
import { MenuCue } from '../handlers/default/MenuCue';
import { SearchlightsCue } from '../handlers/default/SearchlightsCue';

/**
 * Create and register the default cue group.
 * The default group provides the base implementation for all cues.
 * Other groups can override specific cues while falling back to these
 * implementations for cues they don't define.
 */
const defaultGroup: ICueGroup = {
  id: 'default',
  name: 'YARG Default',
  description: 'The original set of YARG cues. If other groups don\'t define a cue, this group\'s cue will be used.',
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
registry.setDefaultGroup(defaultGroup.id);
registry.activateGroup(defaultGroup.id);