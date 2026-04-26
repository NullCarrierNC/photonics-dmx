import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ConfigStrobeType } from '../../../../photonics-dmx/types'
import type { DmxLight, LightingConfiguration } from '../../../../photonics-dmx/types'
import { buildMergedPrimaryLightsFromConfig, isTwoRowPrimaryLayout } from './lightsLayoutHelpers'

/**
 * When the active rig config changes (e.g. switching rigs), keep form state and the working
 * `allPrimaryLights` array in sync.
 */
export function useLightsLayoutActiveConfigSync(
  activeConfig: LightingConfiguration | null | undefined,
  setSelectedCount: Dispatch<SetStateAction<number | null>>,
  setSelectedLayout: Dispatch<SetStateAction<string>>,
  setAssignedToBack: Dispatch<SetStateAction<number | 'None'>>,
  setSelectedStrobe: Dispatch<SetStateAction<ConfigStrobeType>>,
  setDedicatedStrobeCount: Dispatch<SetStateAction<number>>,
  setAllPrimaryLights: Dispatch<SetStateAction<DmxLight[]>>,
): void {
  useEffect(() => {
    if (!activeConfig) return

    setSelectedCount(activeConfig.numLights > 0 ? activeConfig.numLights : null)
    setSelectedLayout(activeConfig.lightLayout.id)
    setSelectedStrobe(activeConfig.strobeType)

    if (isTwoRowPrimaryLayout(activeConfig.lightLayout.id)) {
      setAssignedToBack(
        activeConfig.backLights.length > 0 ? activeConfig.backLights.length : 'None',
      )
    } else {
      setAssignedToBack('None')
    }

    setAllPrimaryLights(buildMergedPrimaryLightsFromConfig(activeConfig))

    const strobe = activeConfig.strobeLights || []
    if (activeConfig.strobeType === ConfigStrobeType.Dedicated) {
      setDedicatedStrobeCount(strobe.length > 0 ? strobe.length : 0)
    } else {
      setDedicatedStrobeCount(0)
    }
  }, [
    activeConfig,
    setAllPrimaryLights,
    setAssignedToBack,
    setDedicatedStrobeCount,
    setSelectedCount,
    setSelectedLayout,
    setSelectedStrobe,
  ])
}
