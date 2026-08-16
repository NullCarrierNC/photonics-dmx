/**
 * Version-aware YARG UDP datagram parser (v3–v5+).
 * v5 inserts FogRemainingCentiseconds at bytes 37–38; trailing fields shift +2.
 */
import {
  CueData,
  SongSection,
  PostProcessing,
  Beat,
  StrobeState,
  lightingCueMap,
  InstrumentNoteType,
  DrumNoteType,
} from '../../cues/types/cueTypes'
import {
  PlatformByte,
  VenueSizeByte,
  SceneIndexByte,
  PauseStateByte,
  SongSectionByte,
  GuitarBassKeyboardNotesByte,
  DrumNotesByte,
  PostProcessingByte,
  KeyFrameByte,
  BeatByte,
  StrobeByte,
  DatagramVersionByte,
  YARG_PACKET_HEADER,
  LEGACY_PACKET_SIZE,
  V4_FIXED_PACKET_SIZE,
  V5_FIXED_PACKET_SIZE,
  MAX_KNOWN_DATAGRAM_VERSION,
} from './yargTypes'

const PLAYER_STAR_POWER_COUNT_SIZE = 2
const PLAYER_STAR_POWER_ENTRY_SIZE = 2
const PREFIX_ONLY_TAIL_END = 37 // exclusive: bytes 0-36 inclusive

/** Maps post-processing byte values to their string literal names. */
const POST_PROCESSING_MAP: Record<number, PostProcessing> = {
  [PostProcessingByte.Default]: 'Default',
  [PostProcessingByte.Bloom]: 'Bloom',
  [PostProcessingByte.Bright]: 'Bright',
  [PostProcessingByte.Contrast]: 'Contrast',
  [PostProcessingByte.Posterize]: 'Posterize',
  [PostProcessingByte.PhotoNegative]: 'PhotoNegative',
  [PostProcessingByte.Mirror]: 'Mirror',
  [PostProcessingByte.BlackAndWhite]: 'BlackAndWhite',
  [PostProcessingByte.SepiaTone]: 'SepiaTone',
  [PostProcessingByte.SilverTone]: 'SilverTone',
  [PostProcessingByte.Choppy_BlackAndWhite]: 'Choppy_BlackAndWhite',
  [PostProcessingByte.PhotoNegative_RedAndBlack]: 'PhotoNegative_RedAndBlack',
  [PostProcessingByte.Polarized_BlackAndWhite]: 'Polarized_BlackAndWhite',
  [PostProcessingByte.Polarized_RedAndBlue]: 'Polarized_RedAndBlue',
  [PostProcessingByte.Desaturated_Blue]: 'Desaturated_Blue',
  [PostProcessingByte.Desaturated_Red]: 'Desaturated_Red',
  [PostProcessingByte.Contrast_Red]: 'Contrast_Red',
  [PostProcessingByte.Contrast_Green]: 'Contrast_Green',
  [PostProcessingByte.Contrast_Blue]: 'Contrast_Blue',
  [PostProcessingByte.Grainy_Film]: 'Grainy_Film',
  [PostProcessingByte.Grainy_ChromaticAbberation]: 'Grainy_ChromaticAbberation',
  [PostProcessingByte.Scanlines]: 'Scanlines',
  [PostProcessingByte.Scanlines_BlackAndWhite]: 'Scanlines_BlackAndWhite',
  [PostProcessingByte.Scanlines_Blue]: 'Scanlines_Blue',
  [PostProcessingByte.Scanlines_Security]: 'Scanlines_Security',
  [PostProcessingByte.Trails]: 'Trails',
  [PostProcessingByte.Trails_Long]: 'Trails_Long',
  [PostProcessingByte.Trails_Desaturated]: 'Trails_Desaturated',
  [PostProcessingByte.Trails_Flickery]: 'Trails_Flickery',
  [PostProcessingByte.Trails_Spacey]: 'Trails_Spacey',
}

export type YargParseRejectReason = 'header' | 'too-short' | 'size-mismatch' | 'version-too-old'

export type YargParseResult =
  | { kind: 'cue'; data: CueData; newerVersionWarning?: boolean }
  | { kind: 'shutdown' }
  | {
      kind: 'reject'
      reason: YargParseRejectReason
      detail: string
      datagramVersion?: number
    }

export interface TailByteOffsets {
  fogRemainingCentiseconds: number
  strobeState: number
  beat: number
  keyframe: number
  bonusEffect: number
  autoGen: number
  spotlight: number
  singalong: number
  cameraCutConstraint: number
  cameraCutPriority: number
  cameraCutSubject: number
  playerStarPowerCount: number
}

/** v5 tail offsets; apply fogShift (-2) for v3/v4. */
export function getTailByteOffsets(datagramVersion: number): TailByteOffsets {
  const fogShift = datagramVersion >= DatagramVersionByte.FogRemainingDuration ? 0 : -2
  return {
    fogRemainingCentiseconds: 37 + fogShift,
    strobeState: 39 + fogShift,
    beat: 40 + fogShift,
    keyframe: 41 + fogShift,
    bonusEffect: 42 + fogShift,
    autoGen: 43 + fogShift,
    spotlight: 44 + fogShift,
    singalong: 45 + fogShift,
    cameraCutConstraint: 46 + fogShift,
    cameraCutPriority: 47 + fogShift,
    cameraCutSubject: 48 + fogShift,
    playerStarPowerCount: 49 + fogShift,
  }
}

export function getFixedPacketSize(datagramVersion: number): number {
  if (datagramVersion >= DatagramVersionByte.FogRemainingDuration) {
    return V5_FIXED_PACKET_SIZE
  }
  if (datagramVersion >= DatagramVersionByte.PlayerStarPower) {
    return V4_FIXED_PACKET_SIZE
  }
  return LEGACY_PACKET_SIZE
}

export function getExpectedPacketSize(datagramVersion: number, playerCount: number): number {
  const fixed = getFixedPacketSize(datagramVersion)
  if (datagramVersion >= DatagramVersionByte.PlayerStarPower) {
    return fixed + playerCount * PLAYER_STAR_POWER_ENTRY_SIZE
  }
  return fixed
}

export function tryValidatePacket(
  buffer: Buffer,
  minSupportedVersion: number,
): YargParseResult | null {
  if (buffer.length < 4 + 1) {
    return {
      kind: 'reject',
      reason: 'too-short',
      detail: `packet is too short (${buffer.length} bytes)`,
    }
  }

  const header = buffer.readUInt32LE(0)
  if (header !== YARG_PACKET_HEADER) {
    return {
      kind: 'reject',
      reason: 'header',
      detail: `packet header is not YARG (0x${header.toString(16)})`,
    }
  }

  const datagramVersion = buffer.readUInt8(4)

  if (datagramVersion === DatagramVersionByte.Shutdown) {
    if (buffer.length < 5) {
      return {
        kind: 'reject',
        reason: 'too-short',
        detail: `shutdown packet is too short (${buffer.length} bytes)`,
      }
    }
    return { kind: 'shutdown' }
  }

  if (datagramVersion < minSupportedVersion) {
    return {
      kind: 'reject',
      reason: 'version-too-old',
      detail: `YARG Datagram Version too old: received version ${datagramVersion}, need at least version ${minSupportedVersion}`,
      datagramVersion,
    }
  }

  if (datagramVersion > MAX_KNOWN_DATAGRAM_VERSION) {
    return null
  }

  const fixedSize = getFixedPacketSize(datagramVersion)
  if (buffer.length < fixedSize) {
    return {
      kind: 'reject',
      reason: 'size-mismatch',
      detail: `packet is incomplete (${buffer.length} bytes, expected at least ${fixedSize})`,
      datagramVersion,
    }
  }

  let expectedSize = fixedSize
  if (datagramVersion >= DatagramVersionByte.PlayerStarPower) {
    const countOffset = getTailByteOffsets(datagramVersion).playerStarPowerCount
    const playerCount = buffer.readUInt16LE(countOffset)
    expectedSize = getExpectedPacketSize(datagramVersion, playerCount)
  }

  if (buffer.length !== expectedSize) {
    return {
      kind: 'reject',
      reason: 'size-mismatch',
      detail: `packet size is ${buffer.length} bytes; expected exactly ${expectedSize}`,
      datagramVersion,
    }
  }

  return null
}

export function parseYargPacket(buffer: Buffer, minSupportedVersion: number): YargParseResult {
  const validationError = tryValidatePacket(buffer, minSupportedVersion)
  if (validationError !== null) {
    return validationError
  }

  const datagramVersion = buffer.readUInt8(4)

  if (datagramVersion === DatagramVersionByte.Shutdown) {
    return { kind: 'shutdown' }
  }

  if (datagramVersion > MAX_KNOWN_DATAGRAM_VERSION) {
    if (buffer.length < PREFIX_ONLY_TAIL_END) {
      return {
        kind: 'reject',
        reason: 'too-short',
        detail: `packet is too short (${buffer.length} bytes) for prefix decode`,
        datagramVersion,
      }
    }
    const v5SizeMatch = matchesV5SizeRule(buffer)
    if (v5SizeMatch) {
      return {
        kind: 'cue',
        data: decodeFullPacket(buffer, datagramVersion),
        newerVersionWarning: true,
      }
    }
    return {
      kind: 'cue',
      data: decodePrefixOnlyPacket(buffer, datagramVersion),
      newerVersionWarning: true,
    }
  }

  return {
    kind: 'cue',
    data: decodeFullPacket(buffer, datagramVersion),
  }
}

function matchesV5SizeRule(buffer: Buffer): boolean {
  if (buffer.length < V5_FIXED_PACKET_SIZE) {
    return false
  }
  const playerCount = buffer.readUInt16LE(getTailByteOffsets(5).playerStarPowerCount)
  return buffer.length === getExpectedPacketSize(5, playerCount)
}

function decodePrefixOnlyPacket(buffer: Buffer, datagramVersion: number): CueData {
  const prefix = decodePrefixFields(buffer, datagramVersion)
  const fogState = buffer.readUInt8(36) === 1
  return {
    ...prefix,
    fogState,
    strobeState: 'Strobe_Off',
    beat: 'Off',
    keyframe: 'Off',
    bonusEffect: false,
    trackMode: 'tracked',
    spotlight: 0,
    singalong: 0,
    performer: 0,
    fogRemainingCentiseconds: 0xffff,
    playerStarPower: [],
    starPowerActiveCount: 0,
    starPowerMaxPercent: 0,
  }
}

function decodeFullPacket(buffer: Buffer, datagramVersion: number): CueData {
  const decodeVersion =
    datagramVersion > MAX_KNOWN_DATAGRAM_VERSION ? MAX_KNOWN_DATAGRAM_VERSION : datagramVersion
  const prefix = decodePrefixFields(buffer, datagramVersion)
  const offsets = getTailByteOffsets(decodeVersion)
  const hasFogDuration = decodeVersion >= DatagramVersionByte.FogRemainingDuration

  const fogState = buffer.readUInt8(36) === 1
  let fogRemainingCentiseconds = 0xffff
  if (hasFogDuration) {
    fogRemainingCentiseconds = buffer.readUInt16LE(offsets.fogRemainingCentiseconds)
  }

  const strobeStateValue = buffer.readUInt8(offsets.strobeState)
  const beatValue = buffer.readUInt8(offsets.beat)
  const keyframeValue = buffer.readUInt8(offsets.keyframe)
  const bonusEffect = buffer.readUInt8(offsets.bonusEffect) === 1
  const autoGenTrack = buffer.readUInt8(offsets.autoGen) === 1
  const spotlight = buffer.readUInt8(offsets.spotlight)
  const singalong = buffer.readUInt8(offsets.singalong)
  const cameraCutConstraint = buffer.readUInt8(offsets.cameraCutConstraint)
  const cameraCutPriority = buffer.readUInt8(offsets.cameraCutPriority)
  const cameraCutSubject = buffer.readUInt8(offsets.cameraCutSubject)

  let playerStarPower: ReadonlyArray<{ amount: number; isActive: boolean }> = []
  if (decodeVersion >= DatagramVersionByte.PlayerStarPower) {
    const playerCount = buffer.readUInt16LE(offsets.playerStarPowerCount)
    const entries: Array<{ amount: number; isActive: boolean }> = []
    let entryOffset = offsets.playerStarPowerCount + PLAYER_STAR_POWER_COUNT_SIZE
    for (let i = 0; i < playerCount; i++) {
      entries.push({
        amount: buffer.readUInt8(entryOffset),
        isActive: buffer.readUInt8(entryOffset + 1) !== 0,
      })
      entryOffset += PLAYER_STAR_POWER_ENTRY_SIZE
    }
    playerStarPower = entries
  }

  const starPowerActiveCount = playerStarPower.filter((p) => p.isActive).length
  const starPowerMaxPercent =
    playerStarPower.length > 0
      ? Math.max(...playerStarPower.map((p) => Math.round((p.amount / 255) * 100)))
      : 0

  return {
    ...prefix,
    fogState,
    fogRemainingCentiseconds,
    strobeState: getStrobeState(strobeStateValue),
    beat: getBeatDescription(beatValue),
    keyframe: getKeyframeDescription(keyframeValue),
    bonusEffect,
    trackMode: autoGenTrack ? 'autogen' : 'tracked',
    spotlight,
    singalong,
    performer: spotlight | singalong,
    cameraCutConstraint,
    cameraCutPriority,
    cameraCutSubject,
    playerStarPower,
    starPowerActiveCount,
    starPowerMaxPercent,
  }
}

function decodePrefixFields(
  buffer: Buffer,
  datagramVersion: number,
): Omit<
  CueData,
  | 'fogState'
  | 'fogRemainingCentiseconds'
  | 'strobeState'
  | 'beat'
  | 'keyframe'
  | 'bonusEffect'
  | 'trackMode'
  | 'spotlight'
  | 'singalong'
  | 'performer'
  | 'cameraCutConstraint'
  | 'cameraCutPriority'
  | 'cameraCutSubject'
  | 'playerStarPower'
  | 'starPowerActiveCount'
  | 'starPowerMaxPercent'
> {
  let offset = 5
  const platformByte = buffer.readUInt8(offset++)
  const sceneByte = buffer.readUInt8(offset++)
  const pauseStateByte = buffer.readUInt8(offset++)
  const venueSizeByte = buffer.readUInt8(offset++)
  const beatsPerMinute = buffer.readFloatLE(offset)
  offset += 4
  const songSectionByte = buffer.readUInt8(offset++)
  const guitarNotesByte = buffer.readUInt8(offset++)
  const bassNotesByte = buffer.readUInt8(offset++)
  const drumNotesByte = buffer.readUInt8(offset++)
  const keysNotesByte = buffer.readUInt8(offset++)
  const vocalNote = buffer.readFloatLE(offset)
  offset += 4
  const harmony0Note = buffer.readFloatLE(offset)
  offset += 4
  const harmony1Note = buffer.readFloatLE(offset)
  offset += 4
  const harmony2Note = buffer.readFloatLE(offset)
  offset += 4
  const lightingCueValue = buffer.readUInt8(offset++)
  const postProcessingByte = buffer.readUInt8(offset++)

  const lightingCue = lightingCueMap[lightingCueValue] || `Unknown (${lightingCueValue})`

  return {
    datagramVersion,
    platform: getPlatform(platformByte),
    currentScene: getCurrentScene(sceneByte),
    pauseState: getPauseState(pauseStateByte),
    venueSize: getVenueSize(venueSizeByte),
    beatsPerMinute,
    songSection: getSongSection(songSectionByte),
    guitarNotes: getInstrumentNotes(guitarNotesByte),
    bassNotes: getInstrumentNotes(bassNotesByte),
    drumNotes: getDrumNotes(drumNotesByte),
    keysNotes: getInstrumentNotes(keysNotesByte),
    vocalNote,
    harmony0Note,
    harmony1Note,
    harmony2Note,
    lightingCue,
    postProcessing: getPostProcessing(postProcessingByte),
  }
}

function getPlatform(byteValue: number): CueData['platform'] {
  switch (byteValue) {
    case PlatformByte.Windows:
      return 'Windows'
    case PlatformByte.Linux:
      return 'Linux'
    case PlatformByte.Mac:
      return 'Mac'
    default:
      return 'Unknown'
  }
}

function getCurrentScene(byteValue: number): CueData['currentScene'] {
  switch (byteValue) {
    case SceneIndexByte.Menu:
      return 'Menu'
    case SceneIndexByte.Gameplay:
      return 'Gameplay'
    case SceneIndexByte.Score:
      return 'Score'
    case SceneIndexByte.Calibration:
      return 'Calibration'
    case SceneIndexByte.Practice:
      return 'Practice'
    default:
      return 'Unknown'
  }
}

function getPauseState(byteValue: number): CueData['pauseState'] {
  switch (byteValue) {
    case PauseStateByte.AtMenu:
      return 'AtMenu'
    case PauseStateByte.Unpaused:
      return 'Unpaused'
    case PauseStateByte.Paused:
      return 'Paused'
    default:
      return 'AtMenu'
  }
}

function getVenueSize(byteValue: number): CueData['venueSize'] {
  switch (byteValue) {
    case VenueSizeByte.Small:
      return 'Small'
    case VenueSizeByte.Large:
      return 'Large'
    case VenueSizeByte.NoVenue:
    default:
      return 'NoVenue'
  }
}

function getSongSection(byteValue: number): SongSection {
  switch (byteValue) {
    case SongSectionByte.None:
      return 'None'
    case SongSectionByte.Chorus:
      return 'Chorus'
    case SongSectionByte.Verse:
      return 'Verse'
    default:
      return 'Unknown'
  }
}

function getPostProcessing(byteValue: number): PostProcessing {
  return POST_PROCESSING_MAP[byteValue] ?? 'Unknown'
}

function getInstrumentNotes(byteValue: number): InstrumentNoteType[] {
  if (byteValue === GuitarBassKeyboardNotesByte.None) {
    return []
  }
  const notes: InstrumentNoteType[] = []
  if ((byteValue & GuitarBassKeyboardNotesByte.Open) === GuitarBassKeyboardNotesByte.Open) {
    notes.push(InstrumentNoteType.Open)
  }
  if ((byteValue & GuitarBassKeyboardNotesByte.Green) === GuitarBassKeyboardNotesByte.Green) {
    notes.push(InstrumentNoteType.Green)
  }
  if ((byteValue & GuitarBassKeyboardNotesByte.Red) === GuitarBassKeyboardNotesByte.Red) {
    notes.push(InstrumentNoteType.Red)
  }
  if ((byteValue & GuitarBassKeyboardNotesByte.Yellow) === GuitarBassKeyboardNotesByte.Yellow) {
    notes.push(InstrumentNoteType.Yellow)
  }
  if ((byteValue & GuitarBassKeyboardNotesByte.Blue) === GuitarBassKeyboardNotesByte.Blue) {
    notes.push(InstrumentNoteType.Blue)
  }
  if ((byteValue & GuitarBassKeyboardNotesByte.Orange) === GuitarBassKeyboardNotesByte.Orange) {
    notes.push(InstrumentNoteType.Orange)
  }
  return notes
}

function getDrumNotes(byteValue: number): DrumNoteType[] {
  if (byteValue === DrumNotesByte.None) {
    return []
  }
  const notes: DrumNoteType[] = []
  if ((byteValue & DrumNotesByte.Kick) === DrumNotesByte.Kick) {
    notes.push(DrumNoteType.Kick)
  }
  if ((byteValue & DrumNotesByte.RedDrum) === DrumNotesByte.RedDrum) {
    notes.push(DrumNoteType.RedDrum)
  }
  if ((byteValue & DrumNotesByte.YellowDrum) === DrumNotesByte.YellowDrum) {
    notes.push(DrumNoteType.YellowDrum)
  }
  if ((byteValue & DrumNotesByte.BlueDrum) === DrumNotesByte.BlueDrum) {
    notes.push(DrumNoteType.BlueDrum)
  }
  if ((byteValue & DrumNotesByte.GreenDrum) === DrumNotesByte.GreenDrum) {
    notes.push(DrumNoteType.GreenDrum)
  }
  if ((byteValue & DrumNotesByte.YellowCymbal) === DrumNotesByte.YellowCymbal) {
    notes.push(DrumNoteType.YellowCymbal)
  }
  if ((byteValue & DrumNotesByte.BlueCymbal) === DrumNotesByte.BlueCymbal) {
    notes.push(DrumNoteType.BlueCymbal)
  }
  if ((byteValue & DrumNotesByte.GreenCymbal) === DrumNotesByte.GreenCymbal) {
    notes.push(DrumNoteType.GreenCymbal)
  }
  return notes
}

function getBeatDescription(byteValue: number): Beat {
  switch (byteValue) {
    case BeatByte.Measure:
      return 'Measure'
    case BeatByte.Strong:
      return 'Strong'
    case BeatByte.Weak:
      return 'Weak'
    case BeatByte.Off:
      return 'Off'
    default:
      return 'Unknown'
  }
}

function getStrobeState(byteValue: number): StrobeState {
  switch (byteValue) {
    case StrobeByte.Strobe_Fastest:
      return 'Strobe_Fastest'
    case StrobeByte.Strobe_Fast:
      return 'Strobe_Fast'
    case StrobeByte.Strobe_Medium:
      return 'Strobe_Medium'
    case StrobeByte.Strobe_Slow:
      return 'Strobe_Slow'
    case StrobeByte.Strobe_Off:
      return 'Strobe_Off'
    default:
      return 'Unknown'
  }
}

function getKeyframeDescription(
  byteValue: number,
): 'Off' | 'First' | 'Next' | 'Previous' | 'Unknown' {
  switch (byteValue) {
    case KeyFrameByte.Off:
      return 'Off'
    case KeyFrameByte.KeyframeFirst:
      return 'First'
    case KeyFrameByte.KeyframeNext:
      return 'Next'
    case KeyFrameByte.KeyframePrevious:
      return 'Previous'
    default:
      return 'Unknown'
  }
}

export { PREFIX_ONLY_TAIL_END }
