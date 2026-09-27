import { ArtNetSender } from '../../photonics-dmx/senders/ArtNetSender'
import type { BaseSender } from '../../photonics-dmx/senders/BaseSender'
import { SacnSender } from '../../photonics-dmx/senders/SacnSender'
import {
  artNetBaseRefreshIntervalMs,
  dmxOutputRefreshRateHzFromUnknownPayload,
} from '../../shared/dmxOutputRefresh'

/** Where a loopback run sends: a protocol, and a spare port on this machine. */
export interface LoopbackTarget {
  protocol: 'sacn' | 'artnet'
  port: number
  universe?: number
}

const LOOPBACK = '127.0.0.1'

/**
 * A real sACN or Art-Net sender aimed at this machine, at the output rate and resend interval the
 * app gives a sender restored from default prefs. The caller starts and stops it.
 */
export function loopbackSender(target: LoopbackTarget): BaseSender {
  const hz = dmxOutputRefreshRateHzFromUnknownPayload({})
  if (target.protocol === 'sacn') {
    return new SacnSender({
      universe: target.universe ?? 1,
      useUnicast: true,
      unicastDestination: LOOPBACK,
      port: target.port,
      maxOutputRate: hz,
      minRefreshRate: hz,
    })
  }
  return new ArtNetSender(LOOPBACK, {
    universe: target.universe ?? 0,
    net: 0,
    subnet: 0,
    subuni: 0,
    port: target.port,
    base_refresh_interval: artNetBaseRefreshIntervalMs(hz),
    maxOutputRate: hz,
  })
}
