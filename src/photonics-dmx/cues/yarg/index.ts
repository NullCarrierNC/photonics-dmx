import { DefaultCue } from './set1/DefaultCue';
import { DischordCue } from './set1/DischordCue';
import { ChorusCue } from './set1/ChorusCue';
import { CoolManualCue } from './set1/CoolManualCue';
import { StompCue } from './set1/StompCue';
import { VerseCue } from './set1/VerseCue';
import { WarmManualCue } from './set1/WarmManualCue';
import { BigRockEndingCue } from './set1/BigRockEndingCue';
import { CoolAutomaticCue } from './set1/CoolAutomaticCue';
import { FlareFastCue } from './set1/FlareFastCue';
import { FlareSlowCue } from './set1/FlareSlowCue';
import { FrenzyCue } from './set1/FrenzyCue';
import { IntroCue } from './set1/IntroCue';
import { HarmonyCue } from './set1/HarmonyCue';
import { SilhouettesCue } from './set1/SilhouettesCue';
import { SilhouettesSpotlightCue } from './set1/SilhouettesSpotlightCue';
import { SweepCue } from './set1/SweepCue';
import { WarmAutomaticCue } from './set1/WarmAutomaticCue';
import { ScoreCue } from './set1/ScoreCue';
import { SoloCue } from './set1/SoloCue';
import { StrobeFastCue } from './set1/StrobeFastCue';
import { StrobeFastestCue } from './set1/StrobeFastestCue';
import { StrobeMediumCue } from './set1/StrobeMediumCue';
import { StrobeOffCue } from './set1/StrobeOffCue';
import { StrobeSlowCue } from './set1/StrobeSlowCue';
import { MenuCue } from './set1/MenuCue';
import { SearchlightsCue } from './set1/SearchlightsCue';

export const yargCues = {
  default: new DefaultCue(),
  dischord: new DischordCue(),
  chorus: new ChorusCue(),
  cool_manual: new CoolManualCue(),
  stomp: new StompCue(),
  verse: new VerseCue(),
  warm_manual: new WarmManualCue(),
  big_rock_ending: new BigRockEndingCue(),
  cool_automatic: new CoolAutomaticCue(),
  flare_fast: new FlareFastCue(),
  flare_slow: new FlareSlowCue(),
  frenzy: new FrenzyCue(),
  intro: new IntroCue(),
  harmony: new HarmonyCue(),
  silhouettes: new SilhouettesCue(),
  silhouettes_spotlight: new SilhouettesSpotlightCue(),
  sweep: new SweepCue(),
  warm_automatic: new WarmAutomaticCue(),
  score: new ScoreCue(),
  solo: new SoloCue(),
  strobe_fast: new StrobeFastCue(),
  strobe_fastest: new StrobeFastestCue(),
  strobe_medium: new StrobeMediumCue(),
  strobe_off: new StrobeOffCue(),
  strobe_slow: new StrobeSlowCue(),
  menu: new MenuCue(),
  searchlights: new SearchlightsCue(),
}; 