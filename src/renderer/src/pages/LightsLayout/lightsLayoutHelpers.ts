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
  highestChannelUsed,
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

/** Addresses land on 1, 11, 21 … so a rig's numbering stays readable at a glance. */
const ADDRESS_STEP = 10

/**
 * Master dimmer for a light joining `existingLights`: the first address past everything already
 * placed, rounded up to the next step boundary. Deriving it from the lights themselves is what keeps
 * a fixture wider than the step from landing inside its neighbour, and it respects hand-edited
 * addresses that no counter could know about.
 *
 * `capped` means the template does not fit before the end of the universe, so the address was
 * pulled back and overlaps whatever is already there. Callers surface that rather than placing a
 * light that silently shares channels.
 */
export function nextMasterDimmerForNewLight(
  existingLights: DmxLight[],
  template: DmxFixture,
): { master: number; capped: boolean } {
  let highest = 0
  for (const light of existingLights) {
    highest = Math.max(highest, highestChannelUsed(light))
  }
  const stepped = Math.ceil(highest / ADDRESS_STEP) * ADDRESS_STEP + 1
  const max = maxMasterDimmerForTemplate(template)
  return stepped > max ? { master: max, capped: true } : { master: stepped, capped: false }
}

/**
 * Create one new `DmxLight` row for the layout editor from the user's fixture list, addressed clear
 * of `existingLights`. Callers adding several in a pass must include the ones they have just built,
 * or each new light is addressed as though it were the first.
 */
export function createDmxLightInstance(
  group: 'front' | 'back' | 'strobe',
  existingLights: DmxLight[],
  myFixtures: DmxFixture[],
): { light: DmxLight & { group: 'front' | 'back' | 'strobe' }; addressCapped: boolean } {
  if (myFixtures.length === 0) {
    throw new Error('myFixtures must be non-empty to create a light instance')
  }
  const totalExisting = existingLights.length
  const templateIndex = totalExisting % myFixtures.length
  const selectedFixture = myFixtures[templateIndex]
  const { master: newMasterDimmer, capped: addressCapped } = nextMasterDimmerForNewLight(
    existingLights,
    selectedFixture,
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
    light: {
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
    },
    addressCapped,
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
