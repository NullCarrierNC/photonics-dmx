import {
  BeatByte,
  DatagramVersionByte,
  DrumNotesByte,
  GuitarBassKeyboardNotesByte,
  KeyFrameByte,
  PostProcessingByte,
  SceneIndexByte,
  StrobeByte,
  PlatformByte,
  PauseStateByte,
  VenueSizeByte,
  SongSectionByte,
  CameraCutSubjectByte,
  YARG_PACKET_HEADER,
} from '../../listeners/YARG/yargTypes'
import { CueType } from '../../cues/types/cueTypes'

/** Authoritative fixture sizes (independent of production parser helpers). */
export const FIXTURE_V3_PACKET_SIZE = 47
export const FIXTURE_V4_FIXED_PACKET_SIZE = 49
export const FIXTURE_V5_FIXED_PACKET_SIZE = 51
const PLAYER_STAR_POWER_ENTRY_SIZE = 2

export interface FixtureTailOffsets {
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

/** v5 tail offsets from YALCY wire layout; apply fogShift (-2) for v3/v4. */
export function fixtureTailOffsets(datagramVersion: number): FixtureTailOffsets {
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

export function fixtureFixedPacketSize(datagramVersion: number): number {
  if (datagramVersion >= DatagramVersionByte.FogRemainingDuration) {
    return FIXTURE_V5_FIXED_PACKET_SIZE
  }
  if (datagramVersion >= DatagramVersionByte.PlayerStarPower) {
    return FIXTURE_V4_FIXED_PACKET_SIZE
  }
  return FIXTURE_V3_PACKET_SIZE
}

export function fixtureExpectedPacketSize(datagramVersion: number, playerCount: number): number {
  const fixed = fixtureFixedPacketSize(datagramVersion)
  if (datagramVersion >= DatagramVersionByte.PlayerStarPower) {
    return fixed + playerCount * PLAYER_STAR_POWER_ENTRY_SIZE
  }
  return fixed
}

export interface YargPacketFieldValues {
  datagramVersion: number
  platform?: number
  scene?: number
  pause?: number
  venue?: number
  bpm?: number
  songSection?: number
  guitarNotes?: number
  bassNotes?: number
  drumNotes?: number
  keysNotes?: number
  vocalNote?: number
  harmony0Note?: number
  harmony1Note?: number
  harmony2Note?: number
  lightingCue?: number
  postProcessing?: number
  fogState?: boolean
  fogRemainingCentiseconds?: number
  strobe?: number
  beat?: number
  keyframe?: number
  bonusEffect?: boolean
  autoGen?: boolean
  spotlight?: number
  singalong?: number
  cameraCutConstraint?: number
  cameraCutPriority?: number
  cameraCutSubject?: number
  playerStarPower?: ReadonlyArray<{ amount: number; isActive: boolean }>
}

const DEFAULT_FIELDS: Required<
  Omit<YargPacketFieldValues, 'datagramVersion' | 'playerStarPower' | 'fogRemainingCentiseconds'>
> & {
  playerStarPower: ReadonlyArray<{ amount: number; isActive: boolean }>
  fogRemainingCentiseconds: number
} = {
  platform: PlatformByte.Mac,
  scene: SceneIndexByte.Practice,
  pause: PauseStateByte.Unpaused,
  venue: VenueSizeByte.Large,
  bpm: 137.5,
  songSection: SongSectionByte.Verse,
  guitarNotes: GuitarBassKeyboardNotesByte.Green | GuitarBassKeyboardNotesByte.Red,
  bassNotes: GuitarBassKeyboardNotesByte.Yellow,
  drumNotes: DrumNotesByte.Kick | DrumNotesByte.RedDrum,
  keysNotes: GuitarBassKeyboardNotesByte.Blue,
  vocalNote: 72,
  harmony0Note: 60,
  harmony1Note: 64,
  harmony2Note: 67,
  lightingCue: 14, // Frenzy
  postProcessing: PostProcessingByte.Scanlines_Blue,
  fogState: true,
  fogRemainingCentiseconds: 0x1234,
  strobe: StrobeByte.Strobe_Medium,
  beat: BeatByte.Strong,
  keyframe: KeyFrameByte.KeyframeNext,
  bonusEffect: true,
  autoGen: true,
  spotlight: 0b10101,
  singalong: 0b01010,
  cameraCutConstraint: 4,
  cameraCutPriority: 1,
  cameraCutSubject: CameraCutSubjectByte.Random,
  playerStarPower: [
    { amount: 200, isActive: true },
    { amount: 50, isActive: false },
  ],
}

export function buildYargPacket(fields: YargPacketFieldValues): Buffer {
  const version = fields.datagramVersion
  const merged = { ...DEFAULT_FIELDS, ...fields }
  const playerStarPower = merged.playerStarPower ?? []
  const playerCount = version >= DatagramVersionByte.PlayerStarPower ? playerStarPower.length : 0
  const size = fixtureExpectedPacketSize(version, playerCount)
  const buf = Buffer.alloc(size, 0)

  buf.writeUInt32LE(YARG_PACKET_HEADER, 0)
  buf.writeUInt8(version, 4)
  buf.writeUInt8(merged.platform, 5)
  buf.writeUInt8(merged.scene, 6)
  buf.writeUInt8(merged.pause, 7)
  buf.writeUInt8(merged.venue, 8)
  buf.writeFloatLE(merged.bpm, 9)
  buf.writeUInt8(merged.songSection, 13)
  buf.writeUInt8(merged.guitarNotes, 14)
  buf.writeUInt8(merged.bassNotes, 15)
  buf.writeUInt8(merged.drumNotes, 16)
  buf.writeUInt8(merged.keysNotes, 17)
  buf.writeFloatLE(merged.vocalNote, 18)
  buf.writeFloatLE(merged.harmony0Note, 22)
  buf.writeFloatLE(merged.harmony1Note, 26)
  buf.writeFloatLE(merged.harmony2Note, 30)
  buf.writeUInt8(merged.lightingCue, 34)
  buf.writeUInt8(merged.postProcessing, 35)
  buf.writeUInt8(merged.fogState ? 1 : 0, 36)

  const offsets = fixtureTailOffsets(version)
  if (version >= DatagramVersionByte.FogRemainingDuration) {
    buf.writeUInt16LE(merged.fogRemainingCentiseconds, offsets.fogRemainingCentiseconds)
  }

  buf.writeUInt8(merged.strobe, offsets.strobeState)
  buf.writeUInt8(merged.beat, offsets.beat)
  buf.writeUInt8(merged.keyframe, offsets.keyframe)
  buf.writeUInt8(merged.bonusEffect ? 1 : 0, offsets.bonusEffect)
  buf.writeUInt8(merged.autoGen ? 1 : 0, offsets.autoGen)
  buf.writeUInt8(merged.spotlight, offsets.spotlight)
  buf.writeUInt8(merged.singalong, offsets.singalong)
  buf.writeUInt8(merged.cameraCutConstraint, offsets.cameraCutConstraint)
  buf.writeUInt8(merged.cameraCutPriority, offsets.cameraCutPriority)
  buf.writeUInt8(merged.cameraCutSubject, offsets.cameraCutSubject)

  if (version >= DatagramVersionByte.PlayerStarPower) {
    buf.writeUInt16LE(playerCount, offsets.playerStarPowerCount)
    let entryOffset = offsets.playerStarPowerCount + 2
    for (const entry of playerStarPower) {
      buf.writeUInt8(entry.amount, entryOffset)
      buf.writeUInt8(entry.isActive ? 1 : 0, entryOffset + 1)
      entryOffset += PLAYER_STAR_POWER_ENTRY_SIZE
    }
  }

  return buf
}

export function buildYargShutdownPacket(): Buffer {
  const buf = Buffer.alloc(5)
  buf.writeUInt32LE(YARG_PACKET_HEADER, 0)
  buf.writeUInt8(DatagramVersionByte.Shutdown, 4)
  return buf
}

/** Logical field values shared across v3/v4/v5 for cross-version tests. */
export function buildCrossVersionLogicalFields(): Omit<YargPacketFieldValues, 'datagramVersion'> {
  return {
    platform: PlatformByte.Mac,
    scene: SceneIndexByte.Practice,
    pause: PauseStateByte.Unpaused,
    venue: VenueSizeByte.Large,
    bpm: 137.5,
    songSection: SongSectionByte.Verse,
    guitarNotes: GuitarBassKeyboardNotesByte.Green,
    bassNotes: GuitarBassKeyboardNotesByte.Red,
    drumNotes: DrumNotesByte.Kick,
    keysNotes: GuitarBassKeyboardNotesByte.Yellow,
    vocalNote: 72,
    harmony0Note: 60,
    harmony1Note: 64,
    harmony2Note: 67,
    lightingCue: 14,
    postProcessing: PostProcessingByte.Scanlines_Blue,
    fogState: true,
    fogRemainingCentiseconds: 0x1234,
    strobe: StrobeByte.Strobe_Medium,
    beat: BeatByte.Strong,
    keyframe: KeyFrameByte.KeyframeNext,
    bonusEffect: true,
    autoGen: true,
    spotlight: 0b10101,
    singalong: 0b01010,
    cameraCutConstraint: 4,
    cameraCutPriority: 1,
    cameraCutSubject: CameraCutSubjectByte.Random,
    playerStarPower: [{ amount: 200, isActive: true }],
  }
}

export const EXPECTED_FRENZY_CUE = CueType.Frenzy
