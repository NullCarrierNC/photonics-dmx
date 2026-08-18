/**
 * Runtime behaviour shared by every mode of the net family (yarg, rb3): cue identity arrives from
 * outside keyed by `CueType`, carried on a `CueData` frame.
 *
 * The gate and the extractor are family-level rather than per-mode on purpose. Both modes author
 * against one `CueData` shape, and `cueDataPropertyMeta` promises that any property a file may carry
 * keeps resolving, so splitting them per mode would silently zero out a working rb3 cue that reads
 * `venue-size` while gaining nothing at runtime (a YARG frame never carries `ledBanks`). What differs
 * between the modes is the authoring vocabulary, which lives on each mode's descriptor.
 */

import type { CueData } from '../types/cueTypes'
import {
  isInstrumentEventTriggered,
  isVocalActive,
  isLedOn,
  ledAggregateMask,
  ledBankNibbleAt,
  ledColorAt,
} from '../types/cueTypes'
import type { NetCueDataProperty } from '../types/nodeCueTypes'
import { monotonicNowMs } from '../../../shared/time'

/**
 * Whether a per-frame `cueData`-derived condition fires this frame: beat / half-beat / measure,
 * keyframe (any) and directional keyframe-first/next/previous, and the vocal-note, LED, fog and
 * instrument-note edges.
 *
 * `triggerOnColorChange` is the per-node opt-in for led-N edges to also fire on a same-position
 * bank-colour change. It defaults off, so a caller with no node keeps plain on/off edge semantics.
 */
export function isNetEventTriggered(
  eventType: string,
  cueData: CueData,
  triggerOnColorChange = false,
): boolean {
  if (eventType === 'measure') {
    return cueData.beat === 'Measure'
  }
  if (eventType === 'beat') {
    return cueData.beat === 'Strong' || cueData.beat === 'Weak' || cueData.beat === 'Measure'
  }
  if (eventType === 'half-beat') {
    return cueData.beat === 'Strong' || cueData.beat === 'Weak'
  }
  if (eventType === 'keyframe') {
    return (
      cueData.keyframe === 'First' || cueData.keyframe === 'Next' || cueData.keyframe === 'Previous'
    )
  }
  if (eventType === 'keyframe-first') return cueData.keyframe === 'First'
  if (eventType === 'keyframe-next') return cueData.keyframe === 'Next'
  if (eventType === 'keyframe-previous') return cueData.keyframe === 'Previous'
  // Vocal events are edge-triggered: compare singing state against the previous frame
  // (stamped by CueHandler.addHistoryToCueData) so each node fires once per edge.
  // A missing previousFrame (first frame of the cue) counts as not-singing. When a strobe
  // is active these edges fire only in the primary cue's graph: handleCue updates the
  // previous-frame snapshot on the primary call, so the strobe slot sees prev == current.
  if (eventType === 'vocal-note') {
    return isVocalActive(cueData) && !isVocalActive(cueData.previousFrame ?? {})
  }
  if (eventType === 'vocal-note-off') {
    return !isVocalActive(cueData) && isVocalActive(cueData.previousFrame ?? {})
  }
  // RB3 StageKit LED position edges, matched like vocal events against the previous frame.
  // LED bank state persists between packets, so a level trigger would re-fire every frame; the
  // edge fires once when the aggregate (any-bank) position lights up (led-N) or clears (led-N-off).
  const ledMatch = /^led-([1-8])(-off)?$/.exec(eventType)
  if (ledMatch) {
    const idx = Number(ledMatch[1]) - 1
    const now = isLedOn(cueData, idx)
    const prev = isLedOn(cueData.previousFrame ?? {}, idx)
    if (ledMatch[2]) return !now && prev // led-N-off: clears the aggregate position
    if (now && !prev) return true // on-edge: the position just lit up
    // Opt-in colour change: the position stays lit but the banks lighting it changed. Lets
    // sweeps/flashes fire on lighting that holds all LEDs on and only swaps colours.
    if (now && prev && triggerOnColorChange) {
      return ledBankNibbleAt(cueData, idx) !== ledBankNibbleAt(cueData.previousFrame ?? {}, idx)
    }
    return false
  }
  if (eventType === 'fog-on') {
    return cueData.fogState === true && (cueData.previousFrame?.fogState ?? false) === false
  }
  if (eventType === 'fog-off') {
    return cueData.fogState === false && (cueData.previousFrame?.fogState ?? false) === true
  }
  // Instrument note events are edge-triggered against the previous frame like the vocal and LED
  // edges above: a note held across keepalive frames fires once, on the frame it arrives.
  const instrumentResult = isInstrumentEventTriggered(
    eventType,
    cueData.guitarNotes,
    cueData.bassNotes,
    cueData.keysNotes,
    cueData.drumNotes,
    cueData.previousFrame,
  )
  if (instrumentResult !== null) {
    return instrumentResult
  }
  return false
}

/**
 * Extract YARG-specific cue data.
 */
export function extractNetCueDataValue(
  property: NetCueDataProperty,
  cueData: CueData,
  cueId: string,
): number | string | boolean {
  // The per-position LED families (`led-{1-8}-on` / `led-{1-8}-color`) parse to one 0-based index, so the
  // hand-numbered switch arms collapse to a single regex — no per-property index arithmetic to mis-copy.
  const ledMatch = /^led-([1-8])-(on|color)$/.exec(property)
  if (ledMatch) {
    const index = Number(ledMatch[1]) - 1
    return ledMatch[2] === 'on' ? isLedOn(cueData, index) : ledColorAt(cueData, index)
  }
  switch (property) {
    case 'cue-name':
      return cueId
    case 'cue-type':
      return cueData.lightingCue
    case 'previous-cue':
      return cueData.previousCue ?? ''
    case 'execution-count':
      return cueData.executionCount ?? 0
    case 'bpm':
      return cueData.beatsPerMinute
    case 'beat-duration-ms':
      return cueData.beatsPerMinute > 0 ? Math.round(60000 / cueData.beatsPerMinute) : 500
    case 'song-section':
      return cueData.songSection
    case 'current-scene':
      return cueData.currentScene
    case 'beat-type':
      return cueData.beat
    case 'keyframe':
      return cueData.keyframe
    case 'venue-size':
      return cueData.venueSize
    case 'guitar-note-count':
      return cueData.guitarNotes.length
    case 'bass-note-count':
      return cueData.bassNotes.length
    case 'drum-note-count':
      return cueData.drumNotes.length
    case 'keys-note-count':
      return cueData.keysNotes.length
    case 'total-score':
      return cueData.totalScore ?? 0
    case 'performer':
      return cueData.performer
    case 'bonus-effect':
      return cueData.bonusEffect
    case 'fog-state':
      return cueData.fogState
    case 'time-since-cue-start':
      return monotonicNowMs() - (cueData.cueStartTime ?? monotonicNowMs())
    case 'time-since-last-cue':
      return cueData.timeSinceLastCue ?? 0
    // RB3 StageKit LED / effect state.
    case 'led-color':
      // Latest packet's bank colour name ('red'|'green'|'blue'|'yellow'), or 'transparent' when nothing
      // is lit. 'transparent' is a real palette colour (fully-transparent black), so binding this to a
      // set-color / effect colour param lets a lower layer show through when the StageKit goes dark
      // rather than painting black — and avoids the unknown-name resolver fallback (which maps to blue).
      return !cueData.ledColor || cueData.ledColor === 'off' ? 'transparent' : cueData.ledColor
    case 'led-states':
      return ledAggregateMask(cueData)
    case 'led-count':
      return countBits(ledAggregateMask(cueData))
    case 'led-red-states':
      return cueData.ledBanks?.red ?? 0
    case 'led-green-states':
      return cueData.ledBanks?.green ?? 0
    case 'led-blue-states':
      return cueData.ledBanks?.blue ?? 0
    case 'led-yellow-states':
      return cueData.ledBanks?.yellow ?? 0
    // led-{1-8}-on and led-{1-8}-color are handled by the regex head above (per-position on / dominant
    // bank colour), so they need no per-index switch arms here.
    case 'strobe-state':
      return cueData.strobeState
    default:
      return 0
  }
}

/** Count set bits in an 8-bit LED mask (number of lit positions). */
function countBits(mask: number): number {
  let n = 0
  let m = mask & 0xff
  while (m) {
    m &= m - 1
    n++
  }
  return n
}
