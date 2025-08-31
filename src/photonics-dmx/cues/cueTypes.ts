export type InstrumentNote = "None" | "Open" | "Green" | "Red" | "Yellow" | "Blue" | "Orange";
export type DrumNote = "None" | "Kick" | "RedDrum" | "YellowDrum" | "BlueDrum" | "GreenDrum" | "YellowCymbal" | "BlueCymbal" | "GreenCymbal";

// Enums for note types to avoid string literal mistakes
export enum InstrumentNoteType {
  None = "None",
  Open = "Open",
  Green = "Green",
  Red = "Red",
  Yellow = "Yellow",
  Blue = "Blue",
  Orange = "Orange"
}

export enum DrumNoteType {
  None = "None",
  Kick = "Kick",
  RedDrum = "RedDrum",
  YellowDrum = "YellowDrum",
  BlueDrum = "BlueDrum",
  GreenDrum = "GreenDrum",
  YellowCymbal = "YellowCymbal",
  BlueCymbal = "BlueCymbal",
  GreenCymbal = "GreenCymbal"
}

// Import RB3E types
import { Rb3Difficulty, Rb3TrackType } from '../listeners/RB3/rb3eTypes';


export type SongSection = "None" | "Chorus" | "Verse" | "Unknown";
export type PostProcessing = "Default" | "Bloom" | "Bright" | "Saturation" | "Contrast" | "Sharpness" | "Vignette" | "ChromaticAberration" | "MotionBlur" | "DepthOfField" | "AmbientOcclusion" | "Unknown";
export type Beat = "Measure" | "Strong" | "Weak" | "Off" | "Unknown";
export type StrobeState = "Strobe_Fastest" | "Strobe_Fast" | "Strobe_Medium" | "Strobe_Slow" | "Strobe_Off" | "Unknown";




export type CueData = {
    datagramVersion: number;
    platform: "RB3E" | "Unknown" | "Windows" | "Linux" | "Mac";
    currentScene: "Unknown" | "Menu" | "Gameplay" | "Score" | "Calibration";
    pauseState: "Unpaused" | "AtMenu" | "Paused";
    venueSize: "NoVenue" | "Small" | "Large";
    beatsPerMinute: number;
    songSection: SongSection;
    guitarNotes: InstrumentNoteType[];
    bassNotes: InstrumentNoteType[];
    drumNotes: DrumNoteType[];
    keysNotes: InstrumentNoteType[];
    vocalNote: number;
    harmony0Note: number;
    harmony1Note: number;
    harmony2Note: number;
    lightingCue: CueType | string;
    postProcessing: PostProcessing;
    fogState: boolean;
    strobeState: StrobeState;
    performer: number;
    autoGenTrack?: boolean;
    beat: Beat;
    keyframe: string;
    bonusEffect: boolean;
    
  
    // Optional RB3E-specific properties
    ledColor?: string | null;
    ledPositions?: number[];
    
    sustainDurationMs?: number;
    measureOrBeat?: number;

    totalScore?: number;          
    memberScores?: number[];  
    stars?: number;  
    
    // Additional RB3E data fields
    rb3Platform?: string;
    rb3BuildTag?: string;
    rb3SongName?: string;
    rb3SongArtist?: string;
    rb3SongShortName?: string;
    rb3VenueName?: string;
    rb3ScreenName?: string;
    rb3BandInfo?: {
      members: Array<{
        exists: boolean;
        difficulty: Rb3Difficulty;
        trackType: Rb3TrackType;
      }>;
    };
    rb3ModData?: {
      identifyValue: string;
      string: string;
    };
  };


  export const defaultCueData: CueData = {
    datagramVersion: 1,
    platform: "RB3E",
    currentScene: "Unknown",
    pauseState: "Unpaused",
    venueSize: "NoVenue",
    beatsPerMinute: 0,
    songSection: "Unknown",
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: "NoCue",
    postProcessing: "Default",
    fogState: false,
    strobeState: "Strobe_Off",
    performer: 0,
    beat: "Unknown",
    keyframe: "Unknown",
    bonusEffect: false,
    ledColor: null,
    rb3Platform: "Unknown",
    rb3BuildTag: "",
    rb3SongName: "",
    rb3SongArtist: "",
    rb3SongShortName: "",
    rb3VenueName: "",
    rb3ScreenName: "",
    rb3BandInfo: {
      members: [
        { exists: false, difficulty: 'Unknown' as Rb3Difficulty, trackType: 'Unknown' as Rb3TrackType },
        { exists: false, difficulty: 'Unknown' as Rb3Difficulty, trackType: 'Unknown' as Rb3TrackType },
        { exists: false, difficulty: 'Unknown' as Rb3Difficulty, trackType: 'Unknown' as Rb3TrackType },
        { exists: false, difficulty: 'Unknown' as Rb3Difficulty, trackType: 'Unknown' as Rb3TrackType }
      ]
    },
    rb3ModData: {
      identifyValue: "",
      string: ""
    }
  };




  
  /**
  * Enum representing different lighting cues.
  */
  export enum CueType {
    BigRockEnding = "BigRockEnding",
    Blackout_Fast = "Blackout_Fast",
    Blackout_Slow = "Blackout_Slow",
    Blackout_Spotlight = "Blackout_Spotlight",
    Chorus = "Chorus",
    Cool_Manual = "Cool_Manual",
    Cool_Automatic = "Cool_Automatic",
    Default = "Default",
    Dischord = "Dischord",
    Flare_Fast = "Flare_Fast",
    Flare_Slow = "Flare_Slow",
    Frenzy = "Frenzy",
    Harmony = "Harmony",
    Intro = "Intro",
    Keyframe_First = "Keyframe_First",
    Keyframe_Next = "Keyframe_Next",
    Keyframe_Previous = "Keyframe_Previous",
    Menu = "Menu",
    Score = "Score",
    Searchlights = "Searchlights",
    Silhouettes = "Silhouettes",
    Silhouettes_Spotlight = "Silhouettes_Spotlight",
    Stomp = "Stomp",
    Strobe_Fastest = "Strobe_Fastest",
    Strobe_Fast = "Strobe_Fast",
    Strobe_Medium = "Strobe_Medium",
    Strobe_Slow = "Strobe_Slow",
    Strobe_Off = "Strobe_Off",
    Solo = "Solo",
    Sweep = "Sweep",
    Verse = "Verse",
    Warm_Automatic = "Warm_Automatic",
    Warm_Manual = "Warm_Manual",
    NoCue = "NoCue",
    Unknown = "UnknownCue",
    Strobe = "Strobe", // RB3 has a discreet strobe cue
    DisableAll = "DisableAll", // RB3 has a discreet disable all cue
  }
  


export const lightingCueMap: Record<number, CueType> = {
  0:  CueType.Default,
  1:  CueType.Dischord,
  2:  CueType.Chorus,
  3:  CueType.Cool_Manual,
  4:  CueType.Stomp,
  5:  CueType.Verse,
  6:  CueType.Warm_Manual,
  7:  CueType.BigRockEnding,
  8:  CueType.Blackout_Fast,
  9:  CueType.Blackout_Slow,
  10: CueType.Blackout_Spotlight,
  11: CueType.Cool_Automatic,
  12: CueType.Flare_Fast,
  13: CueType.Flare_Slow,
  14: CueType.Frenzy,
  15: CueType.Intro,
  16: CueType.Harmony,
  17: CueType.Silhouettes,
  18: CueType.Silhouettes_Spotlight,
  19: CueType.Searchlights,
  20: CueType.Strobe_Fastest,
  21: CueType.Strobe_Fast,
  22: CueType.Strobe_Medium,
  23: CueType.Strobe_Slow,
  24: CueType.Strobe_Off,
  25: CueType.Sweep,
  26: CueType.Warm_Automatic,
  27: CueType.Keyframe_First,
  28: CueType.Keyframe_Next,
  29: CueType.Keyframe_Previous,
  30: CueType.Menu,
  31: CueType.Score,
  32: CueType.NoCue
};


  export const CueTypeDescriptions = [
    { id: CueType.BigRockEnding, 
      yargDescription: "YARG: All lights flash random colours quickly.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Blackout_Fast, 
      yargDescription: "YARG: Sudden fade to black.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Blackout_Slow, 
      yargDescription: "YARG: Gradual fade to black.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Blackout_Spotlight, 
      yargDescription: "YARG: NOT IMPLEMENTED", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Chorus, 
      yargDescription: "YARG: Alternating randomly between Amber/Purple/Yellow/Red - timing based on BPM.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Cool_Automatic, 
      yargDescription: "YARG: Alternate blue/green on measure in front/back. Use Simulate measure when testing.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Cool_Manual, 
      yargDescription: "YARG: Alternate even/odd lights between blue/green on beat. Use Simulate Beat when testing.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Default, 
      yargDescription: "YARG: All yellow on front.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Dischord, 
      yargDescription: "YARG: Front left/right halves alternate green/blue. Flashes bright red or yellow on the measure.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Flare_Fast, 
      yargDescription: "YARG: Quick, intense bursts of bright light, similar to camera flashes.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Flare_Slow, 
      yargDescription: "YARG: Slower, spaced-out bursts of bright light.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Frenzy, 
      yargDescription: "YARG: Rapid color-cycle on all lights.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Harmony, 
      yargDescription: "YARG: Cross fade colours: start based on drum hit, end based on guitar key.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Intro, 
      yargDescription: "YARG: Light green on front lights.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Menu, 
      yargDescription: "YARG: Blue lights chase in a ring around all lights with a 3 second delay between passes. NOTE: There is a timing drift issue for long running effects like this one. It will fall out of sync over time.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.NoCue, 
      yargDescription: "YARG: Currently triggers flast blackout.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Score, 
      yargDescription: "YARG: Blue with yellow slowly flashing. Timings in a random range.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Searchlights, 
      yargDescription: "YARG: Left-to-right, right-to-left sweep of a random colour on top of existing effects. Like sweep, but much slower.",
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Silhouettes, 
      yargDescription: "YARG: Colours cycle through blues/greens/purples. On back if available, front otherwise.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Silhouettes_Spotlight, 
      yargDescription: "YARG: Solid blue on all lights.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Stomp, 
      yargDescription: "YARG: Layers a white flash on top of existing effects. Slower than a strobe with longer fade out time. Front lights only.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Strobe_Fast, 
      yargDescription: "YARG: Fast-paced strobe effect.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Strobe_Fastest,
      yargDescription: "YARG: Extremely rapid strobe lighting.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Strobe_Medium, 
      yargDescription: "YARG: Medium-paced strobe effect, less intense than the fast strobe.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Strobe_Slow, 
      yargDescription: "YARG: Slow-paced strobe effect.",
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Strobe_Off, 
      yargDescription: "YARG: Disables strobe effects.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Sweep, 
      yargDescription: "YARG: Layers a sweep of red or yellow on an existing effect. Random direction. Front lights only.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Verse, 
      yargDescription: "YARG: Similar to Chorus, but cycles through blue / yellow based on BPM.", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Warm_Automatic, 
      yargDescription: "YARG: Cycles between red/yellow (alternate on back lights) on a measure - not beat!", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
    { id: CueType.Warm_Manual, 
      yargDescription: "YARG: Cycles front even/odd lights between red/yellow on a measure - not beat!", 
      rb3Description: "RB3E: Does not currently use cues, lights are set directly from passed LED colour values." },
  ];
  
  
  export function getCueTypeFromId(id: string): CueType | undefined {
    return Object.values(CueType).find(value => value === id);
  }