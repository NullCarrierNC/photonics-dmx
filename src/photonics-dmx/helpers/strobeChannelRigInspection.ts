import {
  ConfigStrobeType,
  FixtureTypes,
  isValidDmxChannel,
  type DmxFixture,
  type DmxLight,
  type LightingConfiguration,
} from '../types'

/**
 * Whether an RGB-family fixture has the "Strobe Channel?" option on, with or without a channel
 * number yet. Such a fixture owns per-speed `strobeValues`. Excludes dedicated
 * {@link FixtureTypes.STROBE} fixtures (separate device class).
 */
export function isRgbFamilyWithStrobeChannel(light: DmxFixture): boolean {
  if (light.fixture === FixtureTypes.STROBE) {
    return false
  }
  return typeof light.channels.strobeChannel === 'number'
}

/**
 * Whether an RGB-family fixture's strobe channel is a DMX address, so its hardware can do the
 * chopping. These are the lights {@link DmxPublisher} latches to a steady colour during a strobe.
 * An unassigned (0) or out-of-range channel reaches no hardware, so its light flashes from the cue
 * colour like any other.
 */
export function hasHardwareStrobeChannel(light: DmxFixture): boolean {
  if (light.fixture === FixtureTypes.STROBE) {
    return false
  }
  const channel = light.channels.strobeChannel
  return channel !== undefined && isValidDmxChannel(channel)
}

/**
 * Returns every rig light with a hardware strobe channel. Honours the rig's `strobeType` so
 * dedicated-strobe-array entries aren't double-counted when the rig is in `AllCapable` mode (in
 * which case `strobeLights` is a snapshot, not authoritative).
 */
export function getStrobeChannelLightsInConfig(config: LightingConfiguration): DmxLight[] {
  const out: DmxLight[] = []
  for (const light of config.frontLights) {
    if (hasHardwareStrobeChannel(light)) out.push(light)
  }
  for (const light of config.backLights) {
    if (hasHardwareStrobeChannel(light)) out.push(light)
  }
  if (config.strobeType === ConfigStrobeType.Dedicated) {
    for (const light of config.strobeLights) {
      if (hasHardwareStrobeChannel(light)) out.push(light)
    }
  }
  return out
}
