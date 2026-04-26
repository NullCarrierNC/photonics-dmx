import { useEffect, useState } from 'react'
import type { LightingConfiguration } from '../../../../photonics-dmx/types'
import type { DmxRig } from '../../../../photonics-dmx/types'
import { getDmxRig, getDmxRigs, saveDmxRig } from '../../ipcApi'
import { createDefaultDmxRig } from './lightsLayoutHelpers'
import type { Dispatch, SetStateAction } from 'react'

type SetRigs = Dispatch<SetStateAction<DmxRig[]>>
type SetRigId = (id: string) => void

/**
 * Mount-time rig list + default rig creation, and load selected rig when `activeRigId` changes.
 */
export function useLightsLayoutRig(
  activeRigId: string | null,
  setRigs: SetRigs,
  setActiveRigId: SetRigId,
  setActiveLightsConfig: (config: LightingConfiguration) => void,
): { rigName: string; setRigName: (name: string) => void } {
  const [rigName, setRigName] = useState('')

  useEffect(() => {
    const loadRigs = async () => {
      try {
        const loadedRigs = await getDmxRigs()
        setRigs(loadedRigs || [])

        if (!activeRigId && loadedRigs.length > 0) {
          setActiveRigId(loadedRigs[0].id)
        } else if (loadedRigs.length === 0) {
          const defaultRig = createDefaultDmxRig()
          await saveDmxRig(defaultRig)
          setRigs([defaultRig])
          setActiveRigId(defaultRig.id)
        }
      } catch (error) {
        console.error('Failed to load DMX rigs:', error)
      }
    }

    void loadRigs()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: load rigs once
  }, [setActiveRigId, setRigs])

  useEffect(() => {
    const loadRigConfig = async () => {
      if (!activeRigId) return

      try {
        const rig = await getDmxRig(activeRigId)
        if (rig) {
          setRigName(rig.name)
          setActiveLightsConfig(rig.config)
        }
      } catch (error) {
        console.error('Failed to load rig configuration:', error)
      }
    }

    if (activeRigId) {
      void loadRigConfig()
    }
  }, [activeRigId, setActiveLightsConfig])

  return { rigName, setRigName }
}
