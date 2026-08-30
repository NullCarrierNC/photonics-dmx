import { describe, expect, it } from '@jest/globals'
import {
  parseYargPacket,
  getTailByteOffsets,
  getFixedPacketSize,
  getExpectedPacketSize,
} from '../../listeners/YARG/yargPacketParser'
import {
  MIN_SUPPORTED_DATAGRAM_VERSION,
  BeatByte,
  StrobeByte,
  KeyFrameByte,
  DatagramVersionByte,
} from '../../listeners/YARG/yargTypes'
import {
  buildCrossVersionLogicalFields,
  buildYargPacket,
  buildYargShutdownPacket,
  EXPECTED_FRENZY_CUE,
  fixtureExpectedPacketSize,
  fixtureTailOffsets,
  FIXTURE_V3_PACKET_SIZE,
  FIXTURE_V4_FIXED_PACKET_SIZE,
  FIXTURE_V5_FIXED_PACKET_SIZE,
} from '../helpers/yargPacket'
import { CueType } from '../../cues/types/cueTypes'

describe('yargPacketParser', () => {
  const minVersion = MIN_SUPPORTED_DATAGRAM_VERSION

  it('fixture tail offsets match production parser offsets', () => {
    for (const version of [3, 4, 5]) {
      expect(getTailByteOffsets(version)).toEqual(fixtureTailOffsets(version))
    }
  })

  it('fixture fixed sizes match production parser fixed sizes', () => {
    expect(getFixedPacketSize(3)).toBe(FIXTURE_V3_PACKET_SIZE)
    expect(getFixedPacketSize(4)).toBe(FIXTURE_V4_FIXED_PACKET_SIZE)
    expect(getFixedPacketSize(5)).toBe(FIXTURE_V5_FIXED_PACKET_SIZE)
  })

  it('accepts exact v3/v4/v5 sizes from independent fixture math', () => {
    for (const version of [3, 4, 5] as const) {
      const playerCount = version >= DatagramVersionByte.PlayerStarPower ? 1 : 0
      const buf = buildYargPacket({
        datagramVersion: version,
        ...buildCrossVersionLogicalFields(),
        playerStarPower: version >= 4 ? [{ amount: 200, isActive: true }] : [],
      })
      expect(buf.length).toBe(fixtureExpectedPacketSize(version, playerCount))
      expect(parseYargPacket(buf, minVersion).kind).toBe('cue')
    }
  })

  it('parses shutdown sentinel', () => {
    const result = parseYargPacket(buildYargShutdownPacket(), minVersion)
    expect(result.kind).toBe('shutdown')
  })

  it('rejects version below minimum', () => {
    const buf = buildYargPacket({ datagramVersion: 2 })
    const result = parseYargPacket(buf, minVersion)
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'reject',
        reason: 'version-too-old',
        datagramVersion: 2,
      }),
    )
  })

  it('round-trips v3 packet fields', () => {
    const fields = buildCrossVersionLogicalFields()
    const buf = buildYargPacket({ datagramVersion: 3, ...fields, playerStarPower: [] })
    const result = parseYargPacket(buf, minVersion)
    expect(result.kind).toBe('cue')
    if (result.kind !== 'cue') return

    expect(result.data.lightingCue).toBe(EXPECTED_FRENZY_CUE)
    expect(result.data.platform).toBe('Mac')
    expect(result.data.currentScene).toBe('Practice')
    expect(result.data.beatsPerMinute).toBe(137.5)
    expect(result.data.strobeState).toBe('Strobe_Medium')
    expect(result.data.beat).toBe('Strong')
    expect(result.data.keyframe).toBe('Next')
    expect(result.data.trackMode).toBe('autogen')
    expect(result.data.spotlight).toBe(0b10101)
    expect(result.data.singalong).toBe(0b01010)
    expect(result.data.fogRemainingCentiseconds).toBe(0xffff)
    expect(result.data.playerStarPower).toEqual([])
    expect(result.data.postProcessing).toBe('Scanlines_Blue')
  })

  it('reports an unmapped post-processing byte as Unknown', () => {
    const buf = buildYargPacket({ datagramVersion: 5, postProcessing: 200, playerStarPower: [] })
    const result = parseYargPacket(buf, minVersion)
    expect(result.kind).toBe('cue')
    if (result.kind !== 'cue') return

    expect(result.data.postProcessing).toBe('Unknown')
  })

  it('round-trips v4 packet with star power tail', () => {
    const fields = buildCrossVersionLogicalFields()
    const buf = buildYargPacket({ datagramVersion: 4, ...fields })
    const result = parseYargPacket(buf, minVersion)
    expect(result.kind).toBe('cue')
    if (result.kind !== 'cue') return

    const offsets = fixtureTailOffsets(4)
    expect(offsets.beat).toBe(38)
    expect(offsets.strobeState).toBe(37)
    expect(result.data.beat).toBe('Strong')
    expect(result.data.strobeState).toBe('Strobe_Medium')
    expect(result.data.playerStarPower).toEqual([{ amount: 200, isActive: true }])
    expect(result.data.starPowerActiveCount).toBe(1)
    expect(result.data.starPowerMaxPercent).toBe(78)
  })

  it('round-trips v5 packet with fog duration and camera-cut fields at shifted offsets', () => {
    const fields = buildCrossVersionLogicalFields()
    const buf = buildYargPacket({ datagramVersion: 5, ...fields })
    const result = parseYargPacket(buf, minVersion)
    expect(result.kind).toBe('cue')
    if (result.kind !== 'cue') return

    const offsets = fixtureTailOffsets(5)
    expect(offsets.beat).toBe(40)
    expect(offsets.strobeState).toBe(39)
    expect(buf.readUInt8(offsets.beat)).toBe(BeatByte.Strong)
    expect(buf.readUInt8(offsets.strobeState)).toBe(StrobeByte.Strobe_Medium)
    expect(buf.readUInt8(offsets.keyframe)).toBe(KeyFrameByte.KeyframeNext)
    expect(buf.readUInt8(offsets.cameraCutConstraint)).toBe(4)
    expect(buf.readUInt8(offsets.cameraCutPriority)).toBe(1)

    expect(result.data.beat).toBe('Strong')
    expect(result.data.strobeState).toBe('Strobe_Medium')
    expect(result.data.keyframe).toBe('Next')
    expect(result.data.fogRemainingCentiseconds).toBe(0x1234)
    expect(result.data.cameraCutConstraint).toBe(4)
    expect(result.data.cameraCutPriority).toBe(1)
  })

  it('cross-version logical fields match modulo version-specific tail', () => {
    const fields = buildCrossVersionLogicalFields()
    const v3 = parseYargPacket(
      buildYargPacket({ datagramVersion: 3, ...fields, playerStarPower: [] }),
      minVersion,
    )
    const v5 = parseYargPacket(buildYargPacket({ datagramVersion: 5, ...fields }), minVersion)
    expect(v3.kind).toBe('cue')
    expect(v5.kind).toBe('cue')
    if (v3.kind !== 'cue' || v5.kind !== 'cue') return

    expect(v3.data.platform).toBe(v5.data.platform)
    expect(v3.data.lightingCue).toBe(v5.data.lightingCue)
    expect(v3.data.beat).toBe(v5.data.beat)
    expect(v3.data.strobeState).toBe(v5.data.strobeState)
    expect(v3.data.keyframe).toBe(v5.data.keyframe)
    expect(v3.data.trackMode).toBe(v5.data.trackMode)
  })

  it('rejects v5 packet with wrong exact size', () => {
    const buf = buildYargPacket({ datagramVersion: 5, ...buildCrossVersionLogicalFields() })
    const bad = Buffer.concat([buf, Buffer.from([0])])
    const result = parseYargPacket(bad, minVersion)
    expect(result.kind).toBe('reject')
    if (result.kind === 'reject') {
      expect(result.reason).toBe('size-mismatch')
    }
  })

  it('rejects v5 packet with inserted byte at fog duration offset', () => {
    const buf = buildYargPacket({ datagramVersion: 5, ...buildCrossVersionLogicalFields() })
    const inserted = Buffer.concat([buf.subarray(0, 37), Buffer.from([0xff]), buf.subarray(37)])
    const result = parseYargPacket(inserted, minVersion)
    expect(result.kind).toBe('reject')
  })

  it('rejects v4 packet when player tail count does not match length', () => {
    const buf = buildYargPacket({ datagramVersion: 4, ...buildCrossVersionLogicalFields() })
    const truncated = buf.subarray(0, buf.length - 1)
    const result = parseYargPacket(truncated, minVersion)
    expect(result.kind).toBe('reject')
  })

  it('decodes unknown v6 at valid v5 size with warning flag', () => {
    const buf = buildYargPacket({ datagramVersion: 6, ...buildCrossVersionLogicalFields() })
    expect(buf.length).toBe(getExpectedPacketSize(5, 1))
    const result = parseYargPacket(buf, minVersion)
    expect(result.kind).toBe('cue')
    if (result.kind !== 'cue') return
    expect(result.newerVersionWarning).toBe(true)
    expect(result.data.beat).toBe('Strong')
    expect(result.data.datagramVersion).toBe(6)
  })

  it('prefix-only decodes unknown v6 with mismatched size', () => {
    const buf = buildYargPacket({ datagramVersion: 6, ...buildCrossVersionLogicalFields() })
    const truncated = buf.subarray(0, FIXTURE_V5_FIXED_PACKET_SIZE - 1)
    const result = parseYargPacket(truncated, minVersion)
    expect(result.kind).toBe('cue')
    if (result.kind !== 'cue') return
    expect(result.newerVersionWarning).toBe(true)
    expect(result.data.lightingCue).toBe(CueType.Frenzy)
    expect(result.data.beat).toBe('Off')
    expect(result.data.strobeState).toBe('Strobe_Off')
    expect(result.data.keyframe).toBe('Off')
  })
})
