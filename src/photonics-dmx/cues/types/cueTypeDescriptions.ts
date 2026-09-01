/**
 * Author-facing descriptions of each cue type, and lookup by id.
 */
import { CueType } from './cueTypeCatalog'

export const CueTypeDescriptions = [
  {
    id: CueType.BigRockEnding,
    yargDescription: 'YARG: All lights flash random colours quickly.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Blackout_Fast,
    yargDescription: 'YARG: Sudden fade to black.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Blackout_Slow,
    yargDescription: 'YARG: Gradual fade to black.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Blackout_Spotlight,
    yargDescription: 'YARG: NOT IMPLEMENTED',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Chorus,
    yargDescription:
      'YARG: Alternating randomly between Amber/Purple/Yellow/Red - timing based on BPM.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Cool_Automatic,
    yargDescription:
      'YARG: Alternate blue/green on measure in front/back. Use Simulate measure when testing.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Cool_Manual,
    yargDescription:
      'YARG: Alternate even/odd lights between blue/green on beat. Use Simulate Beat when testing.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Default,
    yargDescription: 'YARG: All yellow on front.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Dischord,
    yargDescription:
      'YARG: Front left/right halves alternate green/blue. Flashes bright red or yellow on the measure.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Fallback,
    yargDescription:
      'YARG: Auto-triggered look when no new YARG lighting cue has arrived for the configured Fallback Time while a song is playing. Persistent; re-selected each window. Not sent over the wire by YARG.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Flare_Fast,
    yargDescription: 'YARG: Quick, intense bursts of bright light, similar to camera flashes.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Flare_Slow,
    yargDescription: 'YARG: Slower, spaced-out bursts of bright light.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Frenzy,
    yargDescription: 'YARG: Rapid color-cycle on all lights.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Harmony,
    yargDescription: 'YARG: Cross fade colours: start based on drum hit, end based on guitar key.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Intro,
    yargDescription: 'YARG: Light green on front lights.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Menu,
    yargDescription:
      'YARG: Blue lights chase in a ring around all lights with a 3 second delay between passes. NOTE: There is a timing drift issue for long running effects like this one. It will fall out of sync over time.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.NoCue,
    yargDescription: 'YARG: Currently triggers flast blackout.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Score,
    yargDescription: 'YARG: Blue with yellow slowly flashing. Timings in a random range.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Searchlights,
    yargDescription:
      'YARG: Left-to-right, right-to-left sweep of a random colour on top of existing effects. Like sweep, but much slower.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Silhouettes,
    yargDescription:
      'YARG: Colours cycle through blues/greens/purples. On back if available, front otherwise.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Silhouettes_Spotlight,
    yargDescription: 'YARG: Solid blue on all lights.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Stomp,
    yargDescription:
      'YARG: Layers a white flash on top of existing effects. Slower than a strobe with longer fade out time. Front lights only.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Strobe_Fast,
    yargDescription: 'YARG: Fast-paced strobe effect.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Strobe_Fastest,
    yargDescription: 'YARG: Extremely rapid strobe lighting.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Strobe_Medium,
    yargDescription: 'YARG: Medium-paced strobe effect, less intense than the fast strobe.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Strobe_Slow,
    yargDescription: 'YARG: Slow-paced strobe effect.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Strobe_Off,
    yargDescription: 'YARG: Disables strobe effects.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Sweep,
    yargDescription:
      'YARG: Layers a sweep of red or yellow on an existing effect. Random direction. Front lights only.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Verse,
    yargDescription: 'YARG: Similar to Chorus, but cycles through blue / yellow based on BPM.',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Warm_Automatic,
    yargDescription:
      'YARG: Cycles between red/yellow (alternate on back lights) on a measure - not beat!',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
  {
    id: CueType.Warm_Manual,
    yargDescription:
      'YARG: Cycles front even/odd lights between red/yellow on a measure - not beat!',
    rb3Description:
      'RB3E: Does not currently use cues, lights are set directly from passed LED colour values.',
  },
]

export function getCueTypeFromId(id: string): CueType | undefined {
  return Object.values(CueType).find((value) => value === id)
}
