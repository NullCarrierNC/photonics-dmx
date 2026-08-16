/**
 * Forward-gating for YARG frames passed to cue handlers.
 * Pulses, note/vocal edges, and lighting-level changes forward immediately; inert frames
 * cap at ~30 Hz for cue-called keepalive. Bonus frames forward but coalesce like other cue-called ticks.
 */
import { CueData, DrumNoteType, InstrumentNoteType, isVocalActive } from '../../cues/types/cueTypes'

export const FRAME_KEEPALIVE_MS = 1000 / 30

export interface InstrumentRisingEdges {
  drumNotes: DrumNoteType[]
  guitarNotes: InstrumentNoteType[]
  bassNotes: InstrumentNoteType[]
  keysNotes: InstrumentNoteType[]
}

function notesEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function risingNotes<T>(prev: readonly T[], curr: readonly T[]): T[] {
  return curr.filter((note) => !prev.includes(note))
}

export function computeInstrumentRisingEdges(
  prev: CueData | null,
  curr: CueData,
): InstrumentRisingEdges {
  const previous = prev ?? ({} as Partial<CueData>)
  return {
    drumNotes: risingNotes(previous.drumNotes ?? [], curr.drumNotes),
    guitarNotes: risingNotes(previous.guitarNotes ?? [], curr.guitarNotes),
    bassNotes: risingNotes(previous.bassNotes ?? [], curr.bassNotes),
    keysNotes: risingNotes(previous.keysNotes ?? [], curr.keysNotes),
  }
}

export function instrumentNotesChanged(prev: CueData | null, curr: CueData): boolean {
  if (prev === null) {
    return (
      curr.drumNotes.length > 0 ||
      curr.guitarNotes.length > 0 ||
      curr.bassNotes.length > 0 ||
      curr.keysNotes.length > 0
    )
  }
  return (
    !notesEqual(prev.drumNotes, curr.drumNotes) ||
    !notesEqual(prev.guitarNotes, curr.guitarNotes) ||
    !notesEqual(prev.bassNotes, curr.bassNotes) ||
    !notesEqual(prev.keysNotes, curr.keysNotes)
  )
}

export function hasPulseFrame(frame: CueData): boolean {
  return (
    (frame.beat !== 'Off' && frame.beat !== 'Unknown') ||
    (frame.keyframe !== 'Off' && frame.keyframe !== 'Unknown') ||
    frame.bonusEffect === true
  )
}

export function hasVocalAggregateEdge(prev: CueData | null, curr: CueData): boolean {
  if (prev === null) {
    return isVocalActive(curr)
  }
  return isVocalActive(curr) !== isVocalActive(prev)
}

export function levelFieldsChanged(prev: CueData | null, curr: CueData): boolean {
  if (prev === null) {
    return true
  }
  return (
    prev.platform !== curr.platform ||
    prev.currentScene !== curr.currentScene ||
    prev.pauseState !== curr.pauseState ||
    prev.venueSize !== curr.venueSize ||
    prev.songSection !== curr.songSection ||
    prev.lightingCue !== curr.lightingCue ||
    prev.postProcessing !== curr.postProcessing ||
    prev.fogState !== curr.fogState ||
    prev.strobeState !== curr.strobeState ||
    prev.trackMode !== curr.trackMode ||
    (prev.spotlight ?? 0) !== (curr.spotlight ?? 0) ||
    (prev.singalong ?? 0) !== (curr.singalong ?? 0) ||
    (prev.cameraCutConstraint ?? 0) !== (curr.cameraCutConstraint ?? 0) ||
    (prev.cameraCutPriority ?? 0) !== (curr.cameraCutPriority ?? 0) ||
    (prev.cameraCutSubject ?? 0) !== (curr.cameraCutSubject ?? 0)
  )
}

export function shouldForwardFrame(
  prevReceived: CueData | null,
  frame: CueData,
  lastForwardedAt: number,
  nowMs: number,
): boolean {
  if (prevReceived === null) {
    return true
  }
  if (hasPulseFrame(frame)) {
    return true
  }
  if (instrumentNotesChanged(prevReceived, frame)) {
    return true
  }
  if (hasVocalAggregateEdge(prevReceived, frame)) {
    return true
  }
  if (levelFieldsChanged(prevReceived, frame)) {
    return true
  }
  if (nowMs - lastForwardedAt >= FRAME_KEEPALIVE_MS) {
    return true
  }
  return false
}
