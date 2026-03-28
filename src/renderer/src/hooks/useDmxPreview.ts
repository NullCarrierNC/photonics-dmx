import { useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { dmxValuesAtom, previewRigIdAtom } from '@renderer/atoms'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getDmxRig, enableSender } from '../ipcApi'
import type { DmxRig, LightingConfiguration, IpcSenderConfig } from '../../../photonics-dmx/types'

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
        const rig = await getDmxRig(selectedRigId)

        if (cancelled) return
        if (rig) {
          setSelectedRig(rig)
          setRigConfig(rig.config)
          enableSender({ sender: 'ipc' } as IpcSenderConfig)
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
    const handleDmxValues = (data: { universeBuffer: Record<number, number> }) => {
      setDmxValues(
        typeof data.universeBuffer === 'object' && data.universeBuffer !== null
          ? data.universeBuffer
          : {},
      )
    }

    return registerIpcListener(RENDERER_RECEIVE.DMX_VALUES, handleDmxValues)
  }, [setDmxValues])

  const dmxValuesForPreview = selectedRig !== null ? dmxValues : {}

  return { selectedRig, rigConfig, dmxValues: dmxValuesForPreview }
}
