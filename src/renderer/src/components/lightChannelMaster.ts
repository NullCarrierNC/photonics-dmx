/**
 * Moving a light's master dimmer, which re-derives every other channel from the template's own
 * offsets.
 *
 * A master below 1 is raised, since DMX channels are 1 based. A master that would push the fixture
 * past the end of the universe is held at the highest one that still fits, and the caller is given
 * the reason to show rather than the value changing without explanation.
 */
import {
  deriveChannelLayoutForMaster,
  deriveExtraChannelsForMaster,
  maxMasterDimmerForTemplate,
  templateChannelSpan,
} from '../../../photonics-dmx/helpers/rigTemplateSync'
import {
  DMX_CHANNEL_MAX,
  type DmxFixture,
  type ExtraChannel,
  type FixtureChannelLayout,
} from '../../../photonics-dmx/types'

export interface MasterDimmerResolution {
  /** The master actually used, which may not be the one asked for. */
  master: number
  /** Why the master differs from the one asked for, or null when it does not. */
  cappedMessage: string | null
  /** The template's fixture type with every channel derived from `master`. */
  layout: FixtureChannelLayout
  /** Null when the template carries no extra channels, so the light drops the key. */
  extraChannels: ExtraChannel[] | null
}

export function resolveMasterDimmer(template: DmxFixture, asked: number): MasterDimmerResolution {
  let master = Number(asked)
  if (!Number.isFinite(master) || master < 1) {
    master = 1
  }

  const maxMaster = maxMasterDimmerForTemplate(template)
  let cappedMessage: string | null = null
  if (master > maxMaster) {
    master = maxMaster
    cappedMessage = `Capped at ${maxMaster} so all ${templateChannelSpan(template) + 1} channels fit within the ${DMX_CHANNEL_MAX}-channel universe.`
  }

  return {
    master,
    cappedMessage,
    layout: deriveChannelLayoutForMaster(template, master),
    extraChannels:
      deriveExtraChannelsForMaster(
        template.extraChannels,
        template.channels.masterDimmer,
        master,
      ) ?? null,
  }
}
