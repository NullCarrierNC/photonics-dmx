import { useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { dmxValuesAtom, previewRigIdAtom } from '@renderer/atoms'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getDmxRig, enableSender } from '../ipcApi'
import { selectDmxBufferForRig } from '../utils/dmxPreviewBuffer'
import type { DmxRig, LightingConfiguration, IpcSenderConfig } from '../../../photonics-dmx/types'
import type { DmxValuesPayload } from '../../../shared/ipcTypes'
import { createLogger } from '../../../shared/logger'
const log = createLogger('useDmxPreview')

/**
 * Shared hook for DMX preview: rig loading, IPC sender lifecycle, and DMX value listening.
 * Enables the IPC sender when a rig is loaded; does not disable on unmount to avoid data-flow
 * gaps during page transitions and Strict Mode remounts. Backend treats SENDER_ENABLE as idempotent.
 *
 * Refreshes the rig config whenever CONTROLLERS_RESTARTED is received so that fixture params
 * (invertPan, invertTilt, tiltStageDeg, etc.) always match the runtime publisher config.
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

  // Keep a ref so the CONTROLLERS_RESTARTED handler always sees the latest rigId
  const selectedRigIdRef = useRef(selectedRigId)
  useEffect(() => {
    selectedRigIdRef.current = selectedRigId
  }, [selectedRigId])

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
        log.error('Failed to load rig configuration:', error)
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

  // After a controller restart the publisher may use an updated fixture config
  // (new invertTilt, tiltStageDeg, panStageDeg, etc.). Re-fetch so the preview
  // decodes wire DMX with the same parameters the publisher used to produce it.
  useEffect(() => {
    const handleControllersRestarted = () => {
      const rigId = selectedRigIdRef.current
      if (!rigId) return
      getDmxRig(rigId)
        .then((rig) => {
          if (rig) {
            setSelectedRig(rig)
            setRigConfig(rig.config)
          }
        })
        .catch((err) => {
          log.error('useDmxPreview: failed to refresh rig config after restart', err)
        })
    }

    return registerIpcListener(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, handleControllersRestarted)
  }, [])

  // Listen for DMX values (one native listener per channel; subscribers fan out). The payload
  // is a tagged union: `kind: 'rigs'` carries one buffer per active rig (we pick by the current
  // preview rig id, read through the ref so the closure stays correct across rig switches);
  // `kind: 'manual'` is DMX Console / shutdown blackout — we store the flat buffer as-is.
  useEffect(() => {
    const handleDmxValues = (payload: DmxValuesPayload) => {
      setDmxValues(selectDmxBufferForRig(payload, selectedRigIdRef.current))
    }

    return registerIpcListener(RENDERER_RECEIVE.DMX_VALUES, handleDmxValues)
  }, [setDmxValues])

  const dmxValuesForPreview = selectedRig !== null ? dmxValues : {}

  return { selectedRig, rigConfig, dmxValues: dmxValuesForPreview }
}
