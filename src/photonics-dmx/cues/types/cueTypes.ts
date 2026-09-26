/**
 * The cue data frame and cue catalogue, re-exported so every consumer keeps one import path.
 */

export {
  BEAT_TYPES,
  PAUSE_STATES,
  PLATFORM_VALUES,
  POST_PROCESSING_VALUES,
  SCENE_VALUES,
  SONG_SECTIONS,
  STROBE_STATES,
  VENUE_SIZES,
  defaultCueData,
} from './cueData'
export type { Beat, CueData, PostProcessing, SongSection, StrobeState } from './cueData'

export {
  CueType,
  MENU_SIDE_CUE_TYPES,
  NON_DRIVING_CUE_TYPES,
  STROBE_CUE_TYPES,
  cueTypeToStrobeSlot,
  isCueType,
  isHandlerOwnedCueType,
  isMenuSideCueType,
  isNonDrivingCueType,
  isStrobeCueType,
  lightingCueMap,
} from './cueTypeCatalog'
export type { MotionCueRef, StrobeSpeedSlot } from './cueTypeCatalog'

export { CueTypeDescriptions, getCueTypeFromId } from './cueTypeDescriptions'

export {
  isLedOn,
  ledAggregateMask,
  ledBankNibbleAt,
  ledBanksEqual,
  ledColorAt,
  positionsToMask,
} from './ledBanks'

export {
  DRUM_NOTE_MAP,
  DrumNoteType,
  INSTRUMENT_NOTE_MAP,
  InstrumentNoteType,
  isInstrumentEventTriggered,
  isVocalActive,
} from './noteEvents'
export type { DrumNote, InstrumentNote } from './noteEvents'
