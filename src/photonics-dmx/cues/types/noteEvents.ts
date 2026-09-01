/**
 * Instrument and drum notes, and the edge tests that turn a frame into a note event.
 */
import type { CueData } from './cueData'

export type InstrumentNote = 'None' | 'Open' | 'Green' | 'Red' | 'Yellow' | 'Blue' | 'Orange'
export type DrumNote =
  | 'None'
  | 'Kick'
  | 'RedDrum'
  | 'YellowDrum'
  | 'BlueDrum'
  | 'GreenDrum'
  | 'YellowCymbal'
  | 'BlueCymbal'
  | 'GreenCymbal'

// Enums for note types to avoid string literal mistakes
export enum InstrumentNoteType {
  None = 'None',
  Open = 'Open',
  Green = 'Green',
  Red = 'Red',
  Yellow = 'Yellow',
  Blue = 'Blue',
  Orange = 'Orange',
}

export enum DrumNoteType {
  None = 'None',
  Kick = 'Kick',
  RedDrum = 'RedDrum',
  YellowDrum = 'YellowDrum',
  BlueDrum = 'BlueDrum',
  GreenDrum = 'GreenDrum',
  YellowCymbal = 'YellowCymbal',
  BlueCymbal = 'BlueCymbal',
  GreenCymbal = 'GreenCymbal',
}

/**
 * Maps event string suffixes to InstrumentNoteType values
 * Used to convert event names like 'guitar-open' to InstrumentNoteType.Open
 */
export const INSTRUMENT_NOTE_MAP: Record<string, InstrumentNoteType> = {
  open: InstrumentNoteType.Open,
  green: InstrumentNoteType.Green,
  red: InstrumentNoteType.Red,
  yellow: InstrumentNoteType.Yellow,
  blue: InstrumentNoteType.Blue,
  orange: InstrumentNoteType.Orange,
}

/**
 * Maps drum event string suffixes to DrumNoteType values
 * Used to convert event names like 'drum-kick' to DrumNoteType.Kick
 */
export const DRUM_NOTE_MAP: Record<string, DrumNoteType> = {
  'kick': DrumNoteType.Kick,
  'red': DrumNoteType.RedDrum,
  'yellow': DrumNoteType.YellowDrum,
  'blue': DrumNoteType.BlueDrum,
  'green': DrumNoteType.GreenDrum,
  'yellow-cymbal': DrumNoteType.YellowCymbal,
  'blue-cymbal': DrumNoteType.BlueCymbal,
  'green-cymbal': DrumNoteType.GreenCymbal,
}

/**
 * Parse an event type string and check if a note is present in the given arrays.
 * Returns true if the event is triggered based on the current notes.
 */
export function isInstrumentEventTriggered(
  eventType: string,
  guitarNotes: InstrumentNoteType[],
  bassNotes: InstrumentNoteType[],
  keysNotes: InstrumentNoteType[],
  drumNotes: DrumNoteType[],
  previousFrame?: Partial<CueData>,
): boolean | null {
  const prevGuitar = previousFrame?.guitarNotes ?? []
  const prevBass = previousFrame?.bassNotes ?? []
  const prevKeys = previousFrame?.keysNotes ?? []
  const prevDrums = previousFrame?.drumNotes ?? []

  // Guitar events
  if (eventType.startsWith('guitar-')) {
    const note = INSTRUMENT_NOTE_MAP[eventType.slice(7)]
    return note ? guitarNotes.includes(note) && !prevGuitar.includes(note) : null
  }
  // Bass events
  if (eventType.startsWith('bass-')) {
    const note = INSTRUMENT_NOTE_MAP[eventType.slice(5)]
    return note ? bassNotes.includes(note) && !prevBass.includes(note) : null
  }
  // Keys events
  if (eventType.startsWith('keys-')) {
    const note = INSTRUMENT_NOTE_MAP[eventType.slice(5)]
    return note ? keysNotes.includes(note) && !prevKeys.includes(note) : null
  }
  // Drum events
  if (eventType.startsWith('drum-')) {
    const note = DRUM_NOTE_MAP[eventType.slice(5)]
    return note ? drumNotes.includes(note) && !prevDrums.includes(note) : null
  }
  // Not an instrument event
  return null
}

/**
 * Whether any vocal or harmony part is sounding on the given frame. Used both for vocal note
 * edge detection (the sequencer wait-condition path) and for triggering vocal event nodes.
 */
export function isVocalActive(frame: Partial<CueData>): boolean {
  return (
    (frame.vocalNote ?? 0) > 0 ||
    (frame.harmony0Note ?? 0) > 0 ||
    (frame.harmony1Note ?? 0) > 0 ||
    (frame.harmony2Note ?? 0) > 0
  )
}
