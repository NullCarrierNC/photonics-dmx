import { useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { dmxValuesByUniverseAtom, previewRigIdAtom } from '@renderer/atoms'
import { registerIpcListener } from '../utils/ipcHelpers'
import { CONFIG, LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import type { DmxRig, LightingConfiguration } from '../../../photonics-dmx/types'

/**
 * Shared hook for DMX preview: rig loading, IPC sender lifecycle, and DMX value listening.
 * Enables the IPC sender when a rig is loaded; does not disable on unmount to avoid data-flow
 * gaps during page transitions and Strict Mode remounts. Backend treats SENDER_ENABLE as idempotent.
 */
export function useDmxPreview(): {
  selectedRig: DmxRig | null
  rigConfig: LightingConfiguration | null
  dmxValues: Record<number, number>
} {
  const selectedRigId = useAtomValue(previewRigIdAtom)
  const [selectedRig, setSelectedRig] = useState<DmxRig | null>(null)
  const [rigConfig, setRigConfig] = useState<LightingConfiguration | null>(null)
  const [dmxValuesByUniverse, setDmxValuesByUniverse] = useAtom(dmxValuesByUniverseAtom)

  // Load rig and manage IPC sender: enable when rig loads (cleanup only cancels async work)
  useEffect(() => {
    let cancelled = false
    const loadRigConfig = async () => {
      if (!selectedRigId) {
        setSelectedRig(null)
        setRigConfig(null)
        return
      }

      try {
        const rig: DmxRig = await window.electron.ipcRenderer.invoke(
          CONFIG.GET_DMX_RIG,
          selectedRigId,
        )

        if (cancelled) return
        if (rig) {
          setSelectedRig(rig)
          setRigConfig(rig.config)
          window.electron.ipcRenderer.send(LIGHT.SENDER_ENABLE, { sender: 'ipc' })
        }
      } catch (error) {
        console.error('Failed to load rig configuration:', error)
        if (!cancelled) {
          setSelectedRig(null)
          setRigConfig(null)
        }
      }
    }

    loadRigConfig()
    return () => {
      cancelled = true
    }
  }, [selectedRigId])

  // Listen for DMX values (one native listener per channel; subscribers fan out)
  useEffect(() => {
    const handleDmxValues = (
      _: unknown,
      data: { universeBuffer: Record<number, number>; universe: number } | Record<number, number>,
    ) => {
      let universeBuffer: Record<number, number>
      let universe: number

      if (
        'universeBuffer' in data &&
        'universe' in data &&
        typeof data === 'object' &&
        data !== null
      ) {
        universeBuffer = data.universeBuffer || {}
        universe = data.universe
      } else {
        universeBuffer = data as Record<number, number>
        universe = 1
      }

      setDmxValuesByUniverse((prev) => {
        const newMap = new Map(prev)
        newMap.set(universe, universeBuffer)
        return newMap
      })
    }

    type DmxPayload =
      | { universeBuffer: Record<number, number>; universe: number }
      | Record<number, number>
    return registerIpcListener<DmxPayload>(RENDERER_RECEIVE.DMX_VALUES, handleDmxValues)
  }, [])

  const rigUniverse =
    selectedRig?.universe !== undefined && selectedRig?.universe !== null ? selectedRig.universe : 1
  const dmxValues = selectedRig !== null ? dmxValuesByUniverse.get(rigUniverse) || {} : {}

  return { selectedRig, rigConfig, dmxValues }
}
