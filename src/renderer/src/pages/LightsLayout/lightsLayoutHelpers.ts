import equal from 'fast-deep-equal'
import {
  ConfigLightLayoutType,
  ConfigStrobeType,
  DmxFixture,
  DmxLight,
  DmxRig,
  LightingConfiguration,
} from '../../../../photonics-dmx/types'
import { castToChannelType } from '../../../../photonics-dmx/helpers/dmxHelpers'
import {
  deriveBaseChannelsForMaster,
  deriveExtraChannelsForMaster,
  maxMasterDimmerForTemplate,
} from '../../../../photonics-dmx/helpers/rigTemplateSync'

export const LIGHT_LAYOUTS: ConfigLightLayoutType[] = [
  { id: 'front', label: 'Front only' },
  { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
  { id: 'stacked', label: 'Stacked (one on top of the other)' },
  { id: 'front-back', label: 'Front and Back (back lights behind audience)' },
]

export function isTwoRowPrimaryLayout(layoutId: string): boolean {
  return layoutId === 'two-rows' || layoutId === 'front-back' || layoutId === 'stacked'
}

export function splitLights(count: number, assignedBack: number | 'None') {
  if (assignedBack === 'None' || assignedBack === 0) {
    return { frontCount: count, backCount: 0 }
  }
  const frontCount = count - assignedBack
  const backCount = assignedBack
  return { frontCount, backCount }
}

/**
 * Build the working `allPrimaryLights` list from a saved `LightingConfiguration`.
 * Only include dedicated strobe entries when the strobe mode is `Dedicated` (avoids AllCapable duplicates).
 */
export function buildMergedPrimaryLightsFromConfig(
  config: Pick<LightingConfiguration, 'frontLights' | 'backLights' | 'strobeLights' | 'strobeType'>,
): (DmxLight & { group: 'front' | 'back' | 'strobe' })[] {
  const front = config.frontLights || []
  const back = config.backLights || []
  const strobe = config.strobeLights || []
  const strobeForMerge =
    config.strobeType === ConfigStrobeType.Dedicated
      ? strobe.map((l) => ({ ...l, group: 'strobe' as const }))
      : []
  return [
    ...front.map((l) => ({ ...l, group: 'front' as const })),
    ...back.map((l) => ({ ...l, group: 'back' as const })),
    ...strobeForMerge,
  ]
}

/**
 * Create one new `DmxLight` row for the layout editor from the user's fixture list.
 */
export function createDmxLightInstance(
  group: 'front' | 'back' | 'strobe',
  totalExisting: number,
  myFixtures: DmxFixture[],
): DmxLight & { group: 'front' | 'back' | 'strobe' } {
  if (myFixtures.length === 0) {
    throw new Error('myFixtures must be non-empty to create a light instance')
  }
  const templateIndex = totalExisting % myFixtures.length
  const selectedFixture = myFixtures[templateIndex]
  // Auto-addressing walks up the universe 10 channels at a time, so a large rig eventually runs off
  // the end. Cap at the highest address that still fits this template; the user re-addresses from
  // there rather than getting a light whose channels the validators reject on save.
  const newMasterDimmer = Math.min(
    1 + totalExisting * 10,
    maxMasterDimmerForTemplate(selectedFixture),
  )
  const templateChannels = selectedFixture.channels
  const recalculatedChannels = deriveBaseChannelsForMaster(selectedFixture, newMasterDimmer)
  const castChannels = castToChannelType(selectedFixture.fixture, recalculatedChannels)
  const extraChannels = deriveExtraChannelsForMaster(
    selectedFixture.extraChannels,
    templateChannels.masterDimmer,
    newMasterDimmer,
  )

  return {
    id: crypto.randomUUID(),
    fixtureId: selectedFixture.id!,
    position: totalExisting + 1,
    fixture: selectedFixture.fixture,
    label: selectedFixture.label,
    name: selectedFixture.name,
    isStrobeEnabled: selectedFixture.isStrobeEnabled,
    group,
    channels: castChannels,
    config: selectedFixture.config || undefined,
    universe: selectedFixture.universe,
    mount: 'floor' as const,
    ...(extraChannels ? { extraChannels } : {}),
  }
}

export function createDefaultDmxRig(): DmxRig {
  return {
    id: crypto.randomUUID(),
    name: 'Default Rig',
    active: true,
    config: {
      numLights: 0,
      lightLayout: { id: 'front', label: 'Front only' },
      strobeType: ConfigStrobeType.None,
      frontLights: [],
      backLights: [],
      strobeLights: [],
    },
  }
}

/**
 * Re-exported from the shared rig import/export core (its canonical home) so existing callers here
 * keep importing it from `lightsLayoutHelpers`.
 */
export { mapLightsToNewIdsForSave } from '../../../../photonics-dmx/helpers/rigImportExport'

export function lightingConfigsEqual(a: LightingConfiguration, b: LightingConfiguration): boolean {
  return equal(a, b)
}
