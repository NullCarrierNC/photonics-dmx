/**
 * The cue-data frames the StageKit processor emits, and the LED bank snapshot they carry.
 *
 * RB3E sends LED state one colour bank at a time, so the banks accumulate across events and every
 * frame carries the whole snapshot, which is the shape the renderer preview expects.
 */
import { CueData, defaultCueData, positionsToMask } from '../cues/types/cueTypes'
import type { StageKitData } from '../listeners/RB3/rb3eTypes'
import { monotonicNowMs } from '../../shared/time'

/** The four StageKit colour banks, each a bitmask over the eight LED positions. */
export interface LedBankMasks {
  red: number
  green: number
  blue: number
  yellow: number
}

const EMPTY_BANKS: LedBankMasks = { red: 0, green: 0, blue: 0, yellow: 0 }

/**
 * Accumulates per-bank StageKit events into one snapshot: a colour sets that bank to its positions
 * and empty positions clear only that bank. Strobe/fog packets carry `color: 'off'` and must not
 * reset the accumulated banks, so callers use {@link reset} for DisableAll instead.
 */
export class LedBankAccumulator {
  private masks: LedBankMasks = { ...EMPTY_BANKS }

  public reset(): void {
    this.masks = { ...EMPTY_BANKS }
  }

  public update(color: string, positions: number[]): void {
    if (color === 'red' || color === 'green' || color === 'blue' || color === 'yellow') {
      this.masks[color] = positionsToMask(positions)
    }
  }

  public snapshot(): LedBankMasks {
    return { ...this.masks }
  }
}

function strobeStateFor(strobeEffect: StageKitData['strobeEffect']): CueData['strobeState'] {
  switch (strobeEffect) {
    case 'slow':
      return 'Strobe_Slow'
    case 'medium':
      return 'Strobe_Medium'
    case 'fast':
      return 'Strobe_Fast'
    case 'fastest':
      return 'Strobe_Fastest'
    default:
      return 'Strobe_Off'
  }
}

/** Gameplay frame for one StageKit event, carrying the accumulated bank snapshot. */
export function buildStageKitCueData(event: StageKitData, ledBanks: LedBankMasks): CueData {
  const { positions, color, strobeEffect, fog } = event

  return {
    ...defaultCueData,
    datagramVersion: 1,
    platform: 'RB3E',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize: 'Large',
    beatsPerMinute: 120,
    songSection: 'Verse',
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: 'StageKitDirect',
    postProcessing: 'Default',
    // Carry the StageKit fog state through for downstream/debug consumers. There is no DMX fog
    // output yet (a future fixture/channel concept), so nothing renders it today.
    fogState: fog ?? false,
    strobeState: strobeStateFor(strobeEffect),
    performer: 0,
    trackMode: 'tracked',
    beat: 'Strong',
    keyframe: 'Off',
    bonusEffect: false,
    ledColor: color === 'off' ? '' : color,
    ledPositions: positions,
    ledBanks,
    rb3Platform: 'RB3E',
    rb3BuildTag: '',
    rb3SongName: '',
    rb3SongArtist: '',
    rb3SongShortName: '',
    rb3VenueName: '',
    rb3ScreenName: '',
    rb3BandInfo: { members: [] },
    rb3ModData: { identifyValue: '', string: '' },
    totalScore: 0,
    memberScores: [],
    stars: 0,
    sustainDurationMs: 0,
    measureOrBeat: 0,
    cueHistory: [],
    executionCount: 1,
    cueStartTime: monotonicNowMs(),
    timeSinceLastCue: 0,
  }
}

/** Gameplay transition frame after clearing accumulated LED banks. */
export function buildInGameClearCueData(realCueData: CueData | null, platform: string): CueData {
  return {
    ...defaultCueData,
    datagramVersion: realCueData?.datagramVersion || 1,
    platform: realCueData?.platform || 'RB3E',
    currentScene: 'Gameplay',
    pauseState: realCueData?.pauseState || 'Unpaused',
    venueSize: realCueData?.venueSize || 'Large',
    beatsPerMinute: realCueData?.beatsPerMinute || 0,
    songSection: realCueData?.songSection || 'Unknown',
    guitarNotes: realCueData?.guitarNotes || [],
    bassNotes: realCueData?.bassNotes || [],
    drumNotes: realCueData?.drumNotes || [],
    keysNotes: realCueData?.keysNotes || [],
    vocalNote: realCueData?.vocalNote || 0,
    harmony0Note: realCueData?.harmony0Note || 0,
    harmony1Note: realCueData?.harmony1Note || 0,
    harmony2Note: realCueData?.harmony2Note || 0,
    lightingCue: 'StageKitDirect',
    postProcessing: realCueData?.postProcessing || 'Default',
    fogState: realCueData?.fogState || false,
    strobeState: realCueData?.strobeState || 'Strobe_Off',
    performer: realCueData?.performer || 0,
    trackMode: realCueData?.trackMode || 'tracked',
    beat: realCueData?.beat || 'Unknown',
    keyframe: realCueData?.keyframe || 'Unknown',
    bonusEffect: realCueData?.bonusEffect || false,
    ledColor: '',
    ledPositions: [],
    rb3Platform: platform,
    rb3BuildTag: realCueData?.rb3BuildTag || '',
    rb3SongName: realCueData?.rb3SongName || '',
    rb3SongArtist: realCueData?.rb3SongArtist || '',
    rb3SongShortName: realCueData?.rb3SongShortName || '',
    rb3VenueName: realCueData?.rb3VenueName || '',
    rb3ScreenName: realCueData?.rb3ScreenName || '',
    rb3BandInfo: realCueData?.rb3BandInfo || { members: [] },
    rb3ModData: realCueData?.rb3ModData || { identifyValue: '', string: '' },
    totalScore: realCueData?.totalScore || 0,
    memberScores: realCueData?.memberScores || [],
    stars: realCueData?.stars || 0,
    sustainDurationMs: realCueData?.sustainDurationMs || 0,
    measureOrBeat: realCueData?.measureOrBeat || 0,
    cueHistory: [],
    executionCount: 1,
    cueStartTime: monotonicNowMs(),
    timeSinceLastCue: 0,
  }
}

/**
 * Cue payload for RB3 menu-style screens (code-based Default cue, not node editor).
 *
 * A menu has no StageKit LEDs lit, so the caller resets the accumulator and defaultCueData's empty
 * ledBanks is emitted.
 */
export function buildMenusCueData(
  realCueData: CueData | null,
  platform: string,
  rb3ScreenNameOverride?: string,
): CueData {
  return {
    ...defaultCueData,
    datagramVersion: realCueData?.datagramVersion || 1,
    platform: realCueData?.platform || 'RB3E',
    currentScene: 'Menu',
    pauseState: realCueData?.pauseState || 'Unpaused',
    venueSize: 'NoVenue',
    beatsPerMinute: realCueData?.beatsPerMinute || 0,
    songSection: realCueData?.songSection || 'Unknown',
    guitarNotes: realCueData?.guitarNotes || [],
    bassNotes: realCueData?.bassNotes || [],
    drumNotes: realCueData?.drumNotes || [],
    keysNotes: realCueData?.keysNotes || [],
    vocalNote: realCueData?.vocalNote || 0,
    harmony0Note: realCueData?.harmony0Note || 0,
    harmony1Note: realCueData?.harmony1Note || 0,
    harmony2Note: realCueData?.harmony2Note || 0,
    lightingCue: 'Default',
    postProcessing: realCueData?.postProcessing || 'Default',
    fogState: realCueData?.fogState || false,
    strobeState: realCueData?.strobeState || 'Strobe_Off',
    performer: realCueData?.performer || 0,
    trackMode: realCueData?.trackMode || 'tracked',
    beat: realCueData?.beat || 'Unknown',
    keyframe: realCueData?.keyframe || 'Unknown',
    bonusEffect: realCueData?.bonusEffect || false,
    ledColor: '',
    ledPositions: [],
    rb3Platform: platform,
    rb3BuildTag: realCueData?.rb3BuildTag || '',
    rb3SongName: realCueData?.rb3SongName || '',
    rb3SongArtist: realCueData?.rb3SongArtist || '',
    rb3SongShortName: realCueData?.rb3SongShortName || '',
    rb3VenueName: realCueData?.rb3VenueName || '',
    rb3ScreenName: rb3ScreenNameOverride ?? realCueData?.rb3ScreenName ?? '',
    rb3BandInfo: realCueData?.rb3BandInfo || { members: [] },
    rb3ModData: realCueData?.rb3ModData || { identifyValue: '', string: '' },
    totalScore: realCueData?.totalScore || 0,
    memberScores: realCueData?.memberScores || [],
    stars: realCueData?.stars || 0,
    sustainDurationMs: realCueData?.sustainDurationMs || 0,
    measureOrBeat: realCueData?.measureOrBeat || 0,
    cueHistory: [],
    executionCount: 1,
    cueStartTime: monotonicNowMs(),
    timeSinceLastCue: 0,
  }
}
