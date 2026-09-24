/**
 * The DMX buffer the calibration wizard opens with, so the fixture lights up and points at its home
 * position the moment the console takes over.
 *
 * Dimmer and colour go to full so the beam is visible, pan and tilt go to the configured home, and
 * anything else is parked dark. A pinned mode or macro channel keeps its fixed value, since a
 * moving head that needs one stays dark without it.
 */
import {
  mirrorDmxForMovingHeadInvert,
  percentToDmx,
} from '../../../photonics-dmx/helpers/dmxHelpers'
import { normalizeFixtureConfig, type DmxLight } from '../../../photonics-dmx/types'

const FULL_ON_CHANNELS = new Set(['masterDimmer', 'red', 'green', 'blue', 'white'])

const isAddressable = (channel: unknown): channel is number =>
  typeof channel === 'number' && channel >= 1 && channel <= 512

export function buildInitialConsoleBuffer(light: DmxLight): Record<number, number> {
  const config = normalizeFixtureConfig(light.config)
  const buffer: Record<number, number> = {}

  for (const [name, address] of Object.entries(light.channels)) {
    if (!isAddressable(address)) continue
    if (FULL_ON_CHANNELS.has(name)) {
      buffer[address] = 255
    } else if (name === 'pan') {
      const logicalDmx = percentToDmx(config.panHome, config.panMin, config.panMax)
      buffer[address] = config.invertPan
        ? mirrorDmxForMovingHeadInvert(logicalDmx, config.panMin, config.panMax)
        : logicalDmx
    } else if (name === 'tilt') {
      const logicalDmx = percentToDmx(config.tiltHome, config.tiltMin, config.tiltMax)
      buffer[address] = config.invertTilt
        ? mirrorDmxForMovingHeadInvert(logicalDmx, config.tiltMin, config.tiltMax)
        : logicalDmx
    } else {
      buffer[address] = 0
    }
  }

  for (const extra of light.extraChannels ?? []) {
    if (!isAddressable(extra.channel)) continue
    buffer[extra.channel] =
      extra.type === 'fixed' ? Math.max(0, Math.min(255, extra.value ?? 0)) : 0
  }

  return buffer
}
