import { CueRegistry } from '../../CueRegistry';
import { CueType } from '../../cueTypes';
import { ICueGroup } from '../../interfaces/ICueGroup';

// Import default group cues
import { DefaultCue } from '../default/DefaultCue';
import { DischordCue } from '../default/DischordCue';
import { ChorusCue } from '../default/ChorusCue';
import { CoolManualCue } from '../default/CoolManualCue';
import { StompCue } from '../default/StompCue';
import { VerseCue } from '../default/VerseCue';
import { WarmManualCue } from '../default/WarmManualCue';
import { BigRockEndingCue } from '../default/BigRockEndingCue';
import { CoolAutomaticCue } from '../default/CoolAutomaticCue';
import { FlareFastCue } from '../default/FlareFastCue';
import { FlareSlowCue } from '../default/FlareSlowCue';
import { FrenzyCue } from '../default/FrenzyCue';
import { IntroCue } from '../default/IntroCue';
import { HarmonyCue } from '../default/HarmonyCue';
import { SilhouettesCue } from '../default/SilhouettesCue';
import { SilhouettesSpotlightCue } from '../default/SilhouettesSpotlightCue';
import { SweepCue } from '../default/SweepCue';
import { WarmAutomaticCue } from '../default/WarmAutomaticCue';
import { ScoreCue } from '../default/ScoreCue';
import { StrobeFastCue } from '../default/StrobeFastCue';
import { StrobeFastestCue } from '../default/StrobeFastestCue';
import { StrobeMediumCue } from '../default/StrobeMediumCue';
import { StrobeOffCue } from '../default/StrobeOffCue';
import { StrobeSlowCue } from '../default/StrobeSlowCue';
import { MenuCue } from '../default/MenuCue';
import { SearchlightsCue } from '../default/SearchlightsCue';

/**
 * Create and register the default cue group.
 * The default group provides the base implementation for all cues.
 * Other groups can override specific cues while falling back to these
 * implementations for cues they don't define.
 */
const defaultGroup: ICueGroup = {
  name: 'default',
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