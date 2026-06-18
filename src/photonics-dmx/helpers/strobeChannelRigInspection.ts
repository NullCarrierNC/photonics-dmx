import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxLight,
  type LightingConfiguration,
  type RgbDmxChannels,
} from '../types'

/**
 * Predicate matching the same lights that {@link DmxPublisher} treats as RGB-family fixtures with
 * a hardware strobe-speed channel — i.e. lights where the runtime engages the latch-and-write
 * path. Excludes dedicated {@link FixtureTypes.STROBE} fixtures (separate device class).
 */
export function isRgbFamilyWithStrobeChannel(light: DmxLight): boolean {
  if (light.fixture === FixtureTypes.STROBE) {
    return false
  }
  const channels = light.channels as RgbDmxChannels
  return typeof channels.strobeChannel === 'number'
}

/**
 * Returns every rig light using the new "Strobe Channel?" feature. Honours the rig's
 * `strobeType` so dedicated-strobe-array entries aren't double-counted when the rig is in
 * `AllCapable` mode (in which case `strobeLights` is a snapshot, not authoritative).
 */
export function getStrobeChannelLightsInConfig(config: LightingConfiguration): DmxLight[] {
  const out: DmxLight[] = []
  for (const light of config.frontLights) {
    if (isRgbFamilyWithStrobeChannel(light)) out.push(light)
  }
  for (const light of config.backLights) {
    if (isRgbFamilyWithStrobeChannel(light)) out.push(light)
  }
  if (config.strobeType === ConfigStrobeType.Dedicated) {
    for (const light of config.strobeLights) {
      if (isRgbFamilyWithStrobeChannel(light)) out.push(light)
    }
  }
  return out
}

/** True when at least one light in the rig drives a hardware strobe channel. */
export function configHasStrobeChannelLights(config: LightingConfiguration): boolean {
  return getStrobeChannelLightsInConfig(config).length > 0
}
