import { useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { dmxValuesAtom, previewRigIdAtom } from '@renderer/atoms'
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
  const [dmxValues, setDmxValues] = useAtom(dmxValuesAtom)

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
      data: { universeBuffer?: Record<number, number> } | Record<number, number>,
    ) => {
      const universeBuffer =
        data !== null &&
        typeof data === 'object' &&
        'universeBuffer' in data &&
        data.universeBuffer != null
          ? data.universeBuffer
          : (data as Record<number, number>)
      setDmxValues(
        typeof universeBuffer === 'object' && universeBuffer !== null ? universeBuffer : {},
      )
    }

    return registerIpcListener(RENDERER_RECEIVE.DMX_VALUES, handleDmxValues)
  }, [setDmxValues])

  const dmxValuesForPreview = selectedRig !== null ? dmxValues : {}

  return { selectedRig, rigConfig, dmxValues: dmxValuesForPreview }
}
