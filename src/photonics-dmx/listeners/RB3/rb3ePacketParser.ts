/**
 * Pure decoding of the RB3Enhanced datagram: header validation, the empty cue-data frame each
 * packet fills in, and the StageKit byte pair.
 */
import { Rb3Difficulty, Rb3PlatformID, Rb3TrackType } from './rb3eTypes'
import type { StageKitData } from './rb3eTypes'
import type { CueData, StrobeState } from '../../cues/types/cueTypes'

/** "RB3E" in ASCII -> 0x52, 0x42, 0x33, 0x45 */
export const PROTOCOL_MAGIC = Buffer.from([0x52, 0x42, 0x33, 0x45])

/** Highest packet type RB3Enhanced defines. Anything above it is rejected. */
export const MAX_PACKET_TYPE = 10

// Platform mapping from RB3Enhanced
export const PLATFORM_MAP: Record<number, string> = {
  [Rb3PlatformID.RB3E_PLATFORM_XBOX]: 'Xbox',
  [Rb3PlatformID.RB3E_PLATFORM_XENIA]: 'Xenia',
  [Rb3PlatformID.RB3E_PLATFORM_WII]: 'Wii',
  [Rb3PlatformID.RB3E_PLATFORM_DOLPHIN]: 'Dolphin',
  [Rb3PlatformID.RB3E_PLATFORM_PS3]: 'PS3',
  [Rb3PlatformID.RB3E_PLATFORM_RPCS3]: 'RPCS3',
  [Rb3PlatformID.RB3E_PLATFORM_UNKNOWN]: 'Unknown',
}

// Track type mapping from RB3Enhanced
export const TRACK_TYPE_MAP: Record<number, Rb3TrackType> = {
  0: 'Guitar',
  1: 'Bass',
  2: 'Drums',
  3: 'Vocals',
  4: 'Keys',
  5: 'Harmony',
  255: 'Unknown',
}

// Difficulty mapping from RB3Enhanced
export const DIFFICULTY_MAP: Record<number, Rb3Difficulty> = {
  0: 'Easy',
  1: 'Medium',
  2: 'Hard',
  3: 'Expert',
  255: 'Unknown',
}

export interface Rb3ePacketHeader {
  magic: 'RB3E'
  protocolVersion: number
  type: number
  payloadSize: number
  platform: number
  timestamp: number
}

/** Why a datagram was not accepted, for the caller to log. */
export type Rb3eRejectReason =
  | { kind: 'too-short'; length: number }
  | { kind: 'bad-magic'; magic: string }
  | { kind: 'bad-type'; type: number }
  | { kind: 'payload-too-short'; expected: number; got: number }

export type Rb3ePacketParseResult =
  | { ok: true; header: Rb3ePacketHeader; payload: Buffer }
  | { ok: false; reason: Rb3eRejectReason }

/**
 * Validates the 8-byte RB3E header and slices out the payload it declares.
 *
 * The packet is counted by the caller only once this returns ok, so a malformed datagram does not
 * advance the packet count.
 */
export function parseRb3ePacketHeader(buffer: Buffer, now: number): Rb3ePacketParseResult {
  // Minimum 8 bytes for RB3E header (magic + 4 more).
  if (buffer.length < 8) {
    return { ok: false, reason: { kind: 'too-short', length: buffer.length } }
  }

  const magic = buffer.subarray(0, 4)
  if (
    !(
      magic[0] === PROTOCOL_MAGIC[0] &&
      magic[1] === PROTOCOL_MAGIC[1] &&
      magic[2] === PROTOCOL_MAGIC[2] &&
      magic[3] === PROTOCOL_MAGIC[3]
    )
  ) {
    return { ok: false, reason: { kind: 'bad-magic', magic: magic.toString('hex') } }
  }

  let offset = 4
  const protocolVersion = buffer.readUInt8(offset++)
  const packetType = buffer.readUInt8(offset++)
  const payloadSize = buffer.readUInt8(offset++)
  const platform = buffer.readUInt8(offset++)

  if (packetType > MAX_PACKET_TYPE) {
    return { ok: false, reason: { kind: 'bad-type', type: packetType } }
  }

  if (buffer.length < offset + payloadSize) {
    return {
      ok: false,
      reason: { kind: 'payload-too-short', expected: payloadSize, got: buffer.length - offset },
    }
  }

  return {
    ok: true,
    header: {
      magic: 'RB3E',
      protocolVersion,
      type: packetType,
      payloadSize,
      platform,
      timestamp: now,
    },
    payload: buffer.subarray(offset, offset + payloadSize),
  }
}

/** Strobe, fog and brightness persist between packets, so a StageKit byte pair is read against them. */
export interface StageKitPersistentState {
  strobeState: StrobeState
  fogState: boolean
  brightness: 'low' | 'medium' | 'high'
}

/**
 * The cue-data frame a packet starts from, carrying forward the strobe and fog state a previous
 * StageKit packet set.
 */
export function createRb3eCueData(state: StageKitPersistentState, platform: number): CueData {
  return {
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
    fogState: state.fogState,
    strobeState: state.strobeState,
    performer: 0,
    trackMode: 'tracked',
    beat: 'Unknown',
    keyframe: 'Unknown',
    bonusEffect: false,
    ledColor: null,
    rb3Platform: PLATFORM_MAP[platform] || 'Unknown',
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
  }
}

/**
 * Parses RB3E StageKit bytes into StageKit data, and returns the strobe/fog state the packet
 * leaves behind.
 *
 * @param leftChannel The left channel value (LED position bitmask)
 * @param rightChannel The right channel value (color bank or effect control)
 */
export function parseStageKitData(
  leftChannel: number,
  rightChannel: number,
  state: StageKitPersistentState,
  now: number,
): { data: StageKitData; state: StageKitPersistentState } {
  // Parse left channel as LED position bitmask
  const positions: number[] = []
  for (let i = 0; i < 8; i++) {
    const bit = 1 << i
    if (leftChannel & bit) {
      positions.push(i)
    }
  }

  let strobeState = state.strobeState
  let fogState = state.fogState

  // Parse right channel for colors and effects
  let color: string
  let strobeEffect: 'slow' | 'medium' | 'fast' | 'fastest' | 'off' | undefined

  switch (rightChannel) {
    case 1: // FogOn
      fogState = true
      color = 'off'
      break
    case 2: // FogOff
      fogState = false
      color = 'off'
      break
    case 3: // StrobeSlow
      strobeEffect = 'slow'
      strobeState = 'Strobe_Slow'
      color = 'off'
      break
    case 4: // StrobeMedium
      strobeEffect = 'medium'
      strobeState = 'Strobe_Medium'
      color = 'off'
      break
    case 5: // StrobeFast
      strobeEffect = 'fast'
      strobeState = 'Strobe_Fast'
      color = 'off'
      break
    case 6: // StrobeFastest
      strobeEffect = 'fastest'
      strobeState = 'Strobe_Fastest'
      color = 'off'
      break
    case 7: // StrobeOff
      strobeEffect = 'off'
      strobeState = 'Strobe_Off'
      color = 'off'
      break
    case 32: // Blue LEDs (0x20)
      color = 'blue'
      break
    case 64: // Green LEDs (0x40)
      color = 'green'
      break
    case 96: // Yellow LEDs (0x60)
      color = 'yellow'
      break
    case 128: // Red LEDs (0x80)
      color = 'red'
      break
    case 0: // No color
      color = 'off'
      break
    case 255: // DisableAll (0xFF): StageKit reset - clear strobe + fog and turn everything off.
      strobeEffect = 'off'
      strobeState = 'Strobe_Off'
      fogState = false
      color = 'off'
      break
    default:
      color = 'off'
      break
  }

  return {
    data: {
      positions,
      color,
      brightness: state.brightness,
      fog: fogState,
      strobeEffect,
      leftChannel,
      rightChannel,
      timestamp: now,
    },
    state: { strobeState, fogState, brightness: state.brightness },
  }
}

/** Says why a datagram was turned away, in the wording the checks have always logged. */
export function describeRejectReason(reason: Rb3eRejectReason): string {
  switch (reason.kind) {
    case 'too-short':
      return `Received packet is too short: ${reason.length} bytes`
    case 'bad-magic':
      return `Invalid protocol magic: ${reason.magic}`
    case 'bad-type':
      return `Invalid packet type: ${reason.type}`
    case 'payload-too-short':
      return `Packet payload is too short: expected ${reason.expected}, got ${reason.got}`
  }
}

export interface Rb3eScore {
  totalScore: number
  memberScores: number[]
  stars: number
}

/** Score struct is 4 + 4*4 + 1 = 21 bytes. Returns null when the payload cannot hold it. */
export function decodeScore(payload: Buffer): Rb3eScore | null {
  if (payload.length < 21) {
    return null
  }
  return {
    totalScore: payload.readInt32LE(0),
    memberScores: [
      payload.readInt32LE(4),
      payload.readInt32LE(8),
      payload.readInt32LE(12),
      payload.readInt32LE(16),
    ],
    stars: payload.readUInt8(20),
  }
}

export interface Rb3eBandMember {
  exists: boolean
  difficulty: Rb3Difficulty
  trackType: Rb3TrackType
}

/** Band info is 3 arrays of 4 bytes: existence, difficulty, track type. */
export function decodeBandInfo(payload: Buffer): Rb3eBandMember[] | null {
  if (payload.length < 12) {
    return null
  }
  const members: Rb3eBandMember[] = []
  for (let i = 0; i < 4; i++) {
    members.push({
      exists: payload.readUInt8(i) !== 0,
      difficulty: DIFFICULTY_MAP[payload.readUInt8(4 + i)] || 'Unknown',
      trackType: TRACK_TYPE_MAP[payload.readUInt8(8 + i)] || 'Unknown',
    })
  }
  return members
}

export function readNullTerminatedString(buf: Buffer): string {
  const nullIndex = buf.indexOf(0x00)
  if (nullIndex !== -1) {
    return buf.subarray(0, nullIndex).toString('utf8')
  }
  // If no null terminator found, return entire buffer as a string
  return buf.toString('utf8')
}
