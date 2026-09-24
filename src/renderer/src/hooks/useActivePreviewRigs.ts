import { useEffect, useState } from 'react'
import { useSetAtom, useStore } from 'jotai'
import { getActiveRigs } from '../ipcApi'
import { previewRigIdAtom, resolveLastUsedRigId } from '../atoms'
import type { DmxRig } from '../../../photonics-dmx/types'
import { createLogger } from '../../../shared/logger'

const log = createLogger('useActivePreviewRigs')

/**
 * The active rigs, loaded once per mount, with the shared preview rig id held to one of them.
 * DMX Preview and Cue Simulation both resolve it here, so they agree on the rig whether or not
 * the picker is showing.
 */
export function useActivePreviewRigs(): DmxRig[] {
  const [rigs, setRigs] = useState<DmxRig[]>([])
  const setPreviewRigId = useSetAtom(previewRigIdAtom)
  const store = useStore()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const activeRigs = await getActiveRigs()
        if (cancelled) return
        setRigs(activeRigs)
        const current = store.get(previewRigIdAtom)
        const resolved = resolveLastUsedRigId(
          current,
          activeRigs.map((r) => r.id),
        )
        if (resolved !== current) {
          setPreviewRigId(resolved)
        }
      } catch (error) {
        log.error('Failed to load the active rigs:', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store, setPreviewRigId])

  return rigs
}
