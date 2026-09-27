/**
 * Which channels a rig light shows in the console, what numbers they carry, and the pinned
 * channels the manual buffer seeds.
 *
 * The channel set comes from the live fixture template, so a channel added to a template appears
 * here without the light being re-picked. The numbers come from the derivation template sync uses.
 */
import {
  FixtureTypes,
  type ChannelView,
  type DmxFixture,
  type DmxLight,
  type ExtraChannel,
  type LightingConfiguration,
} from '../../../photonics-dmx/types'
import {
  deriveChannelLayoutForMaster,
  deriveExtraChannelsForMaster,
  templatePlacesRigLights,
} from '../../../photonics-dmx/helpers/rigTemplateSync'

export function channelSortKey(name: string): number {
  const order = ['masterDimmer', 'red', 'green', 'blue', 'white', 'strobeChannel', 'pan', 'tilt']
  if (name === 'md') {
    return 0
  }
  const i = order.indexOf(name)
  return i === -1 ? order.length : i
}

/** The numbered channels of a view, skipping any the fixture type leaves out. */
function numberedChannels(view: ChannelView): Record<string, number> {
  return Object.fromEntries(
    Object.entries(view).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  )
}

/**
 * The master a light whose template is gone places its stored layout from: its own, or 0 when it is
 * unplaced and drives nothing.
 */
function orphanMaster(light: DmxLight): number {
  return light.unplaced === true ? 0 : light.channels.masterDimmer
}

/**
 * Resolves the channel set to display for a rig light. The shape (which channels exist) comes from
 * the live fixture template, so enabling "Strobe Channel?" on a template in MyLights surfaces the
 * new channel here immediately, without needing to re-pick the fixture in LightsLayout. The
 * channel numbers come from {@link deriveChannelLayoutForMaster}, the derivation template sync
 * writes to the rig, applied to the light's master dimmer. A light whose template has no master is
 * unplaced and drives nothing, so every channel, its master included, reads 0.
 *
 * A light whose template is gone keeps its persisted channels, and has every channel at 0 when it
 * has no master or is unplaced, matching what the publisher writes for it.
 */
export function getTemplateAlignedChannels(
  light: DmxLight,
  templates: DmxFixture[],
): Record<string, number> {
  const template = templates.find((t) => t.id === light.fixtureId)
  if (!template) {
    return numberedChannels(deriveChannelLayoutForMaster(light, orphanMaster(light)).channels)
  }
  const master = templatePlacesRigLights(template) ? light.channels.masterDimmer : 0
  return numberedChannels(deriveChannelLayoutForMaster(template, master).channels)
}

/**
 * Offset-aligned extra channels for a console light, derived from its live template the same way
 * {@link getTemplateAlignedChannels} derives the base channels. A light whose template is gone
 * keeps its persisted extras, at 0 when it has no master or is unplaced.
 */
export function getTemplateAlignedExtraChannels(
  light: DmxLight,
  templates: DmxFixture[],
): ExtraChannel[] {
  const template = templates.find((t) => t.id === light.fixtureId)
  if (!template) {
    return (
      deriveExtraChannelsForMaster(
        light.extraChannels,
        light.channels.masterDimmer,
        orphanMaster(light),
      ) ?? []
    )
  }
  return (
    deriveExtraChannelsForMaster(
      template.extraChannels,
      template.channels.masterDimmer,
      light.channels.masterDimmer,
    ) ?? []
  )
}

/**
 * DMX buffer seeding pinned "fixed" channels for every light in a rig. Console manual mode bypasses
 * the publisher's per-frame fixed writes, so without this a fixture whose mode/macro channel must be
 * held at a constant would go dark for the whole console session.
 */
export function buildConsoleFixedSeed(
  config: LightingConfiguration,
  templates: DmxFixture[],
): Record<number, number> {
  const seed: Record<number, number> = {}
  const allLights = [...config.frontLights, ...config.backLights, ...config.strobeLights]
  for (const light of allLights) {
    for (const extra of getTemplateAlignedExtraChannels(light, templates)) {
      if (extra.type === 'fixed' && extra.channel >= 1 && extra.channel <= 512) {
        seed[extra.channel] = Math.max(0, Math.min(255, extra.value ?? 0))
      }
    }
  }
  return seed
}

export function getEffectiveChannelEntries(
  light: DmxLight,
  templates: DmxFixture[],
  overrides?: Record<string, number>,
): Array<[string, number]> {
  const channels = getTemplateAlignedChannels(light, templates)
  const effective = overrides ? { ...channels, ...overrides } : channels
  return (Object.entries(effective) as Array<[string, number]>).sort(
    (a, b) => channelSortKey(a[0]) - channelSortKey(b[0]),
  )
}

/**
 * The light driving `channel` through a channel other than the one being moved, or null when
 * nothing else is on it. `overrides` holds the console's session remaps by light id, so a channel
 * already moved counts where it is now.
 */
export function lightOnChannel(
  config: LightingConfiguration,
  templates: DmxFixture[],
  overrides: Record<string, Record<string, number>>,
  channel: number,
  moving: { lightId: string; channelName: string },
): DmxLight | null {
  const allLights = [...config.frontLights, ...config.backLights, ...config.strobeLights]
  for (const light of allLights) {
    const lightOverrides = light.id ? overrides[light.id] : undefined
    const onChannel = getEffectiveChannelEntries(light, templates, lightOverrides).some(
      ([name, number]) =>
        number === channel && !(light.id === moving.lightId && name === moving.channelName),
    )
    if (
      onChannel ||
      getTemplateAlignedExtraChannels(light, templates).some((extra) => extra.channel === channel)
    ) {
      return light
    }
  }
  return null
}

export function isLightModified(
  light: DmxLight,
  templates: DmxFixture[],
  overrides?: Record<string, number>,
): boolean {
  if (!overrides) {
    return false
  }
  const baseline = getTemplateAlignedChannels(light, templates)
  return Object.entries(overrides).some(([name, num]) => baseline[name] !== num)
}

export function channelLabel(name: string): string {
  if (name === 'md' || name === 'masterDimmer') {
    return 'MasterDimmer'
  }
  if (name === 'strobeChannel') {
    return 'Strobe Speed'
  }
  return name
}

export function isPanTiltChannelName(name: string): boolean {
  return name === 'pan' || name === 'tilt'
}

export function isMovingHeadFixture(fixture: FixtureTypes): boolean {
  return fixture === FixtureTypes.RGBMH
}
