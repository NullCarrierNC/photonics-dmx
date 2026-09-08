/**
 * The context every simulated song event and instrument note carries: which venue and tempo to
 * pretend the song has, and which cue group and effect the simulation should drive.
 *
 * Beat, measure and keyframe all send exactly this, so they cannot drift apart. An instrument note
 * adds the instrument and the note on top of it.
 */

/** The venue sizes YARG reports, which the simulator pretends to be in. */
export type SimulatedVenueSize = 'NoVenue' | 'Small' | 'Large'

export interface SimulationContext {
  venueSize: SimulatedVenueSize
  bpm: number
  /** Empty when no group is selected, which the buttons are disabled for anyway. */
  cueGroup: string
  /** Null when no effect is selected. */
  effectId: string | null
}

export function simulationContext(
  venueSize: SimulatedVenueSize,
  bpm: number,
  cueGroup: string,
  effect: { id: string } | null,
): SimulationContext {
  return { venueSize, bpm, cueGroup, effectId: effect?.id || null }
}

export interface InstrumentNotePayload extends SimulationContext {
  instrument: string
  noteType: string
}

export function instrumentNotePayload(
  context: SimulationContext,
  instrument: string,
  noteType: string,
): InstrumentNotePayload {
  return { ...context, instrument, noteType }
}
