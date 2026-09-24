import { Rb3RightChannel } from '../listeners/RB3/rb3eTypes'
import type { StageKitData } from '../listeners/RB3/rb3eTypes'

const COLOUR_BANKS: readonly string[] = ['red', 'green', 'blue', 'yellow']

/**
 * A StageKit packet that lights something: a colour bank with LEDs set, a strobe turning on, or fog
 * on. Both RB3 processors leave the menu look on one. End-of-song teardown traffic (DisableAll,
 * strobe or fog off, bank clears) is not gameplay evidence.
 */
export function isActiveGameplayPacket(data: StageKitData): boolean {
  if (COLOUR_BANKS.includes(data.color) && (data.leftChannel & 0xff) !== 0) {
    return true
  }
  if (data.strobeEffect && data.strobeEffect !== 'off') return true
  return data.rightChannel === Rb3RightChannel.FogOn
}
