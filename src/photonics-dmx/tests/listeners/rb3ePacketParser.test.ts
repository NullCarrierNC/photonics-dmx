import { describe, expect, it } from '@jest/globals'
import {
  createRb3eCueData,
  decodeBandInfo,
  decodeScore,
  describeRejectReason,
  MAX_PACKET_TYPE,
  parseRb3ePacketHeader,
  parseStageKitData,
  PROTOCOL_MAGIC,
  readNullTerminatedString,
  type StageKitPersistentState,
} from '../../listeners/RB3/rb3ePacketParser'
import { Rb3ePacketType, Rb3PlatformID } from '../../listeners/RB3/rb3eTypes'

const NOW = 1_700_000_000_000

/** Builds a well-formed RB3E datagram around the given payload. */
function packet(
  type: number,
  payload: Buffer = Buffer.alloc(0),
  opts: { platform?: number; protocolVersion?: number; declaredSize?: number } = {},
): Buffer {
  const header = Buffer.alloc(4)
  header.writeUInt8(opts.protocolVersion ?? 1, 0)
  header.writeUInt8(type, 1)
  header.writeUInt8(opts.declaredSize ?? payload.length, 2)
  header.writeUInt8(opts.platform ?? Rb3PlatformID.RB3E_PLATFORM_XBOX, 3)
  return Buffer.concat([PROTOCOL_MAGIC, header, payload])
}

const idleState: StageKitPersistentState = {
  strobeState: 'Strobe_Off',
  fogState: false,
  brightness: 'medium',
}

describe('parseRb3ePacketHeader', () => {
  it('accepts a well-formed packet and slices the declared payload', () => {
    const result = parseRb3ePacketHeader(
      packet(Rb3ePacketType.EVENT_ALIVE, Buffer.from('hi\0')),
      NOW,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.header).toEqual({
      magic: 'RB3E',
      protocolVersion: 1,
      type: Rb3ePacketType.EVENT_ALIVE,
      payloadSize: 3,
      platform: Rb3PlatformID.RB3E_PLATFORM_XBOX,
      timestamp: NOW,
    })
    expect(result.payload).toEqual(Buffer.from('hi\0'))
  })

  it('leaves trailing bytes beyond the declared payload out of the slice', () => {
    const result = parseRb3ePacketHeader(
      Buffer.concat([packet(Rb3ePacketType.EVENT_ALIVE, Buffer.from('ab')), Buffer.from('junk')]),
      NOW,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload).toEqual(Buffer.from('ab'))
  })

  it.each([0, 1, 7])('rejects a datagram shorter than the 8-byte header (%i bytes)', (length) => {
    const result = parseRb3ePacketHeader(Buffer.alloc(length), NOW)

    expect(result).toEqual({ ok: false, reason: { kind: 'too-short', length } })
  })

  it('rejects a datagram whose magic is not RB3E', () => {
    const bad = packet(Rb3ePacketType.EVENT_ALIVE)
    bad.writeUInt8(0x00, 0)

    const result = parseRb3ePacketHeader(bad, NOW)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason.kind).toBe('bad-magic')
  })

  it('rejects a packet type above the highest RB3Enhanced defines', () => {
    const result = parseRb3ePacketHeader(packet(MAX_PACKET_TYPE + 1), NOW)

    expect(result).toEqual({
      ok: false,
      reason: { kind: 'bad-type', type: MAX_PACKET_TYPE + 1 },
    })
  })

  it('rejects a packet declaring more payload than it carries', () => {
    const result = parseRb3ePacketHeader(
      packet(Rb3ePacketType.EVENT_ALIVE, Buffer.from('ab'), { declaredSize: 40 }),
      NOW,
    )

    expect(result).toEqual({
      ok: false,
      reason: { kind: 'payload-too-short', expected: 40, got: 2 },
    })
  })

  it('describes every reject reason', () => {
    expect(describeRejectReason({ kind: 'too-short', length: 3 })).toContain('3 bytes')
    expect(describeRejectReason({ kind: 'bad-magic', magic: 'deadbeef' })).toContain('deadbeef')
    expect(describeRejectReason({ kind: 'bad-type', type: 42 })).toContain('42')
    expect(describeRejectReason({ kind: 'payload-too-short', expected: 8, got: 2 })).toContain(
      'expected 8, got 2',
    )
  })
})

describe('createRb3eCueData', () => {
  it('carries the persisted strobe and fog state into the new frame', () => {
    const frame = createRb3eCueData(
      { strobeState: 'Strobe_Fast', fogState: true, brightness: 'medium' },
      Rb3PlatformID.RB3E_PLATFORM_WII,
    )

    expect(frame.strobeState).toBe('Strobe_Fast')
    expect(frame.fogState).toBe(true)
    expect(frame.rb3Platform).toBe('Wii')
    expect(frame.platform).toBe('RB3E')
  })

  it('names an unrecognised platform byte Unknown', () => {
    expect(createRb3eCueData(idleState, 0xee).rb3Platform).toBe('Unknown')
  })
})

describe('parseStageKitData', () => {
  it('reads the left channel as an 8-position LED bitmask', () => {
    expect(parseStageKitData(0b0000_0000, 0, idleState, NOW).data.positions).toEqual([])
    expect(parseStageKitData(0b0000_0001, 0, idleState, NOW).data.positions).toEqual([0])
    expect(parseStageKitData(0b1000_0001, 0, idleState, NOW).data.positions).toEqual([0, 7])
    expect(parseStageKitData(0b1111_1111, 0, idleState, NOW).data.positions).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
  })

  it.each([
    [32, 'blue'],
    [64, 'green'],
    [96, 'yellow'],
    [128, 'red'],
    [0, 'off'],
  ])('maps right channel %i to colour %s', (right, colour) => {
    expect(parseStageKitData(0xff, right, idleState, NOW).data.color).toBe(colour)
  })

  it('treats an unrecognised right channel as no colour', () => {
    expect(parseStageKitData(0xff, 200, idleState, NOW).data.color).toBe('off')
  })

  it.each([
    [3, 'slow', 'Strobe_Slow'],
    [4, 'medium', 'Strobe_Medium'],
    [5, 'fast', 'Strobe_Fast'],
    [6, 'fastest', 'Strobe_Fastest'],
    [7, 'off', 'Strobe_Off'],
  ])('right channel %i sets strobe %s and persists %s', (right, effect, persisted) => {
    const { data, state } = parseStageKitData(0, right, idleState, NOW)

    expect(data.strobeEffect).toBe(effect)
    expect(state.strobeState).toBe(persisted)
    expect(data.color).toBe('off')
  })

  it('turns fog on and off, leaving strobe untouched', () => {
    const lit: StageKitPersistentState = { ...idleState, strobeState: 'Strobe_Fast' }

    const on = parseStageKitData(0, 1, lit, NOW)
    expect(on.state.fogState).toBe(true)
    expect(on.state.strobeState).toBe('Strobe_Fast')

    const off = parseStageKitData(0, 2, on.state, NOW)
    expect(off.state.fogState).toBe(false)
    expect(off.state.strobeState).toBe('Strobe_Fast')
  })

  it('clears both strobe and fog on DisableAll', () => {
    const busy: StageKitPersistentState = {
      strobeState: 'Strobe_Fastest',
      fogState: true,
      brightness: 'medium',
    }

    const { data, state } = parseStageKitData(0xff, 255, busy, NOW)

    expect(state).toEqual({ strobeState: 'Strobe_Off', fogState: false, brightness: 'medium' })
    expect(data.strobeEffect).toBe('off')
    expect(data.fog).toBe(false)
  })

  it('leaves persisted state alone for a colour packet', () => {
    const busy: StageKitPersistentState = {
      strobeState: 'Strobe_Medium',
      fogState: true,
      brightness: 'medium',
    }

    const { data, state } = parseStageKitData(0b0000_0011, 64, busy, NOW)

    expect(state).toEqual(busy)
    expect(data.strobeEffect).toBeUndefined()
    expect(data.fog).toBe(true)
  })

  it('reports the channels and timestamp it was given', () => {
    const { data } = parseStageKitData(0x0f, 32, idleState, NOW)

    expect(data.leftChannel).toBe(0x0f)
    expect(data.rightChannel).toBe(32)
    expect(data.timestamp).toBe(NOW)
    expect(data.brightness).toBe('medium')
  })
})

describe('decodeScore', () => {
  it('reads the total, the four member scores and the star count', () => {
    const payload = Buffer.alloc(21)
    payload.writeInt32LE(123456, 0)
    payload.writeInt32LE(1, 4)
    payload.writeInt32LE(2, 8)
    payload.writeInt32LE(3, 12)
    payload.writeInt32LE(4, 16)
    payload.writeUInt8(5, 20)

    expect(decodeScore(payload)).toEqual({
      totalScore: 123456,
      memberScores: [1, 2, 3, 4],
      stars: 5,
    })
  })

  it('returns null when the payload cannot hold the struct', () => {
    expect(decodeScore(Buffer.alloc(20))).toBeNull()
  })
})

describe('decodeBandInfo', () => {
  it('reads four members across the existence, difficulty and track arrays', () => {
    const payload = Buffer.from([
      1,
      0,
      1,
      1, // exists
      0,
      1,
      2,
      3, // difficulty
      0,
      1,
      2,
      3, // track type
    ])

    expect(decodeBandInfo(payload)).toEqual([
      { exists: true, difficulty: 'Easy', trackType: 'Guitar' },
      { exists: false, difficulty: 'Medium', trackType: 'Bass' },
      { exists: true, difficulty: 'Hard', trackType: 'Drums' },
      { exists: true, difficulty: 'Expert', trackType: 'Vocals' },
    ])
  })

  it('names unmapped difficulty and track bytes Unknown', () => {
    const payload = Buffer.from([1, 0, 0, 0, 99, 0, 0, 0, 99, 0, 0, 0])

    const members = decodeBandInfo(payload)

    expect(members?.[0]).toEqual({ exists: true, difficulty: 'Unknown', trackType: 'Unknown' })
  })

  it('returns null when the payload cannot hold the three arrays', () => {
    expect(decodeBandInfo(Buffer.alloc(11))).toBeNull()
  })
})

describe('readNullTerminatedString', () => {
  it('stops at the first null', () => {
    expect(readNullTerminatedString(Buffer.from('Song Name\0trailing'))).toBe('Song Name')
  })

  it('returns the whole buffer when there is no null', () => {
    expect(readNullTerminatedString(Buffer.from('Song Name'))).toBe('Song Name')
  })

  it('reads an empty string from a leading null', () => {
    expect(readNullTerminatedString(Buffer.from('\0rest'))).toBe('')
  })
})
