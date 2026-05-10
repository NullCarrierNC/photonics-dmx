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
  const newMasterDimmer = 1 + totalExisting * 10
  const templateChannels = selectedFixture.channels
  const offsets: { [key: string]: number } = {}
  Object.entries(templateChannels).forEach(([channelName, value]) => {
    if (channelName !== 'masterDimmer') {
      offsets[channelName] = (value as number) - templateChannels.masterDimmer
    }
  })
  const recalculatedChannels: { [key: string]: number } = {}
  Object.entries(templateChannels).forEach(([channelName, _]) => {
    if (channelName === 'masterDimmer') {
      recalculatedChannels[channelName] = newMasterDimmer
    } else {
      recalculatedChannels[channelName] = newMasterDimmer + (offsets[channelName] || 0)
    }
  })
  const castChannels = castToChannelType(selectedFixture.fixture, recalculatedChannels)

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
 * If the same source light is saved in more than one role (e.g. front + strobe), reuses a single new id.
 */
export function mapLightsToNewIdsForSave(
  lights: DmxLight[],
  idMap: Record<string, string>,
): DmxLight[] {
  return lights.map((light) => {
    const originalId = light.id ?? crypto.randomUUID()
    if (!idMap[originalId]) {
      idMap[originalId] = crypto.randomUUID()
    }
    return {
      ...light,
      id: idMap[originalId],
    }
  })
}

export function lightingConfigsEqual(a: LightingConfiguration, b: LightingConfiguration): boolean {
  return equal(a, b)
}
