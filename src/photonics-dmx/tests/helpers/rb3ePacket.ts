import { PROTOCOL_MAGIC } from '../../listeners/RB3/rb3ePacketParser'
import { Rb3ePacketType, Rb3PlatformID, Rb3RightChannel } from '../../listeners/RB3/rb3eTypes'

/** Builds a well-formed RB3E datagram around the given payload. */
export function buildRb3ePacket(
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

/** A StageKit datagram: the left byte is the channel's value, the right byte names the channel. */
export function buildStageKitPacket(left: number, right: Rb3RightChannel | number): Buffer {
  const payload = Buffer.alloc(2)
  payload.writeUInt8(left, 0)
  payload.writeUInt8(right, 1)
  return buildRb3ePacket(Rb3ePacketType.EVENT_STAGEKIT, payload)
}

/** A game-state datagram: 1 in game, 0 in the menus. */
export function buildGameStatePacket(inGame: boolean): Buffer {
  const payload = Buffer.alloc(1)
  payload.writeUInt8(inGame ? 1 : 0, 0)
  return buildRb3ePacket(Rb3ePacketType.EVENT_STATE, payload)
}
