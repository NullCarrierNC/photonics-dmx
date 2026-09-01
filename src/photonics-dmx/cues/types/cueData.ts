/**
 * The per-frame cue data a listener produces, and its zero value.
 */
import type { Rb3Difficulty, Rb3TrackType } from '../../listeners/RB3/rb3eTypes'
import { CueType } from './cueTypeCatalog'
import { DrumNoteType, InstrumentNoteType } from './noteEvents'

/** Runtime arrays for CueData union types (single source of truth for property metadata and UI dropdowns). */
export const VENUE_SIZES = ['NoVenue', 'Small', 'Large'] as const
export const BEAT_TYPES = ['Measure', 'Strong', 'Weak', 'Off', 'Unknown'] as const
export const SCENE_VALUES = [
  'Unknown',
  'Menu',
  'Gameplay',
  'Score',
  'Calibration',
  'Practice',
] as const
export const SONG_SECTIONS = ['None', 'Chorus', 'Verse', 'Unknown'] as const
export const STROBE_STATES = [
  'Strobe_Fastest',
  'Strobe_Fast',
  'Strobe_Medium',
  'Strobe_Slow',
  'Strobe_Off',
  'Unknown',
] as const
export const PAUSE_STATES = ['Unpaused', 'AtMenu', 'Paused'] as const
export const POST_PROCESSING_VALUES = [
  'Default',
  'Bloom',
  'Bright',
  'Contrast',
  'Posterize',
  'PhotoNegative',
  'Mirror',
  'BlackAndWhite',
  'SepiaTone',
  'SilverTone',
  'Choppy_BlackAndWhite',
  'PhotoNegative_RedAndBlack',
  'Polarized_BlackAndWhite',
  'Polarized_RedAndBlue',
  'Desaturated_Blue',
  'Desaturated_Red',
  'Contrast_Red',
  'Contrast_Green',
  'Contrast_Blue',
  'Grainy_Film',
  'Grainy_ChromaticAbberation',
  'Scanlines',
  'Scanlines_BlackAndWhite',
  'Scanlines_Blue',
  'Scanlines_Security',
  'Trails',
  'Trails_Long',
  'Trails_Desaturated',
  'Trails_Flickery',
  'Trails_Spacey',
  'Unknown',
] as const
export const PLATFORM_VALUES = ['RB3E', 'Unknown', 'Windows', 'Linux', 'Mac'] as const

export type SongSection = (typeof SONG_SECTIONS)[number]
export type PostProcessing = (typeof POST_PROCESSING_VALUES)[number]
export type Beat = (typeof BEAT_TYPES)[number]
export type StrobeState = (typeof STROBE_STATES)[number]

export type CueData = {
  datagramVersion: number
  platform: (typeof PLATFORM_VALUES)[number]
  currentScene: (typeof SCENE_VALUES)[number]
  pauseState: (typeof PAUSE_STATES)[number]
  venueSize: (typeof VENUE_SIZES)[number]
  beatsPerMinute: number
  songSection: SongSection
  guitarNotes: InstrumentNoteType[]
  bassNotes: InstrumentNoteType[]
  drumNotes: DrumNoteType[]
  keysNotes: InstrumentNoteType[]
  vocalNote: number
  harmony0Note: number
  harmony1Note: number
  harmony2Note: number
  lightingCue: CueType | string
  postProcessing: PostProcessing
  fogState: boolean
  strobeState: StrobeState
  performer: number
  /** YARG: performer bitmask for spotlight (optional, YARG only). */
  spotlight?: number
  /** YARG: performer bitmask for singalong (optional, YARG only). */
  singalong?: number
  /** YARG: camera cut constraint flags (optional, when packet length >= 47). */
  cameraCutConstraint?: number
  /** YARG: camera cut priority (optional, when packet length >= 47). */
  cameraCutPriority?: number
  /** YARG: camera cut subject (optional, when packet length >= 47). */
  cameraCutSubject?: number
  trackMode?: 'tracked' | 'autogen' | 'simulated'
  /** When set with trackMode 'simulated', use this group for cue resolution instead of random active-group selection. */
  simulationCueGroup?: string
  /**
   * Force this group for cue resolution in any track mode (RB3 game-mode primary rotation stamps the
   * chosen primary group here so the handler renders it deterministically). Honored ahead of the
   * simulation group and normal selection, unset by YARG.
   */
  preferredCueGroup?: string
  beat: Beat
  keyframe: 'Off' | 'First' | 'Next' | 'Previous' | 'Unknown'
  bonusEffect: boolean
  /** YARG v5+: fog time remaining in centiseconds, 0xffff = until an explicit fog-off. */
  fogRemainingCentiseconds?: number
  /** YARG v4+: per-player star power. amount 0-255 maps to 0-100%. */
  playerStarPower?: ReadonlyArray<{ amount: number; isActive: boolean }>
  starPowerActiveCount?: number
  starPowerMaxPercent?: number

  // Cue history and context
  previousCue?: CueType
  cueHistory?: CueType[]
  executionCount?: number
  cueStartTime?: number
  timeSinceLastCue?: number
  previousFrame?: Partial<CueData>

  // Optional RB3E-specific properties.
  // `ledColor` / `ledPositions` describe the MOST RECENT StageKit packet (its colour bank + lit
  // positions). `ledBanks` is the persistent per-colour-bank state the RB3 cue-mode processor
  // maintains across packets (each value an 8-bit position mask), read by the led-* events and
  // cue-data properties. See ledAggregateMask / isLedOn.
  ledColor?: string | null
  ledPositions?: number[]
  ledBanks?: { red: number; green: number; blue: number; yellow: number }

  sustainDurationMs?: number
  measureOrBeat?: number

  totalScore?: number
  memberScores?: number[]
  stars?: number

  // Additional RB3E data fields
  rb3Platform?: string
  rb3BuildTag?: string
  rb3SongName?: string
  rb3SongArtist?: string
  rb3SongShortName?: string
  rb3VenueName?: string
  rb3ScreenName?: string
  rb3BandInfo?: {
    members: Array<{
      exists: boolean
      difficulty: Rb3Difficulty
      trackType: Rb3TrackType
    }>
  }
  rb3ModData?: {
    identifyValue: string
    string: string
  }
}

export const defaultCueData: CueData = {
  datagramVersion: 1,
  platform: 'RB3E',
  currentScene: 'Unknown',
  pauseState: 'Unpaused',
  venueSize: 'NoVenue',
  beatsPerMinute: 0,
  songSection: 'Unknown',
  guitarNotes: [],
  bassNotes: [],
  drumNotes: [],
  keysNotes: [],
  vocalNote: 0,
  harmony0Note: 0,
  harmony1Note: 0,
  harmony2Note: 0,
  lightingCue: 'NoCue',
  postProcessing: 'Default',
  fogState: false,
  strobeState: 'Strobe_Off',
  performer: 0,
  beat: 'Unknown',
  keyframe: 'Off',
  bonusEffect: false,
  fogRemainingCentiseconds: 0xffff,
  playerStarPower: [],
  starPowerActiveCount: 0,
  starPowerMaxPercent: 0,

  // Cue history defaults
  cueHistory: [],
  executionCount: 0,
  cueStartTime: 0,
  timeSinceLastCue: 0,
  ledColor: null,
  ledBanks: { red: 0, green: 0, blue: 0, yellow: 0 },
  rb3Platform: 'Unknown',
  rb3BuildTag: '',
  rb3SongName: '',
  rb3SongArtist: '',
  rb3SongShortName: '',
  rb3VenueName: '',
  rb3ScreenName: '',
  rb3BandInfo: {
    members: [
      {
        exists: false,
        difficulty: 'Unknown' as Rb3Difficulty,
        trackType: 'Unknown' as Rb3TrackType,
      },
      {
        exists: false,
        difficulty: 'Unknown' as Rb3Difficulty,
        trackType: 'Unknown' as Rb3TrackType,
      },
      {
        exists: false,
        difficulty: 'Unknown' as Rb3Difficulty,
        trackType: 'Unknown' as Rb3TrackType,
      },
      {
        exists: false,
        difficulty: 'Unknown' as Rb3Difficulty,
        trackType: 'Unknown' as Rb3TrackType,
      },
    ],
  },
  rb3ModData: {
    identifyValue: '',
    string: '',
  },
  // Optional fields the RB3 StageKit direct processor also emits. Defaulted here so both RB3
  // processors produce the same CueData shape and a new consumer never sees them undefined.
  trackMode: 'tracked',
  ledPositions: [],
  sustainDurationMs: 0,
  measureOrBeat: 0,
  totalScore: 0,
  memberScores: [],
  stars: 0,
}
