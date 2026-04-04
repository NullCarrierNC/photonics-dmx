import React, { useEffect, useRef, useState } from 'react'
import { DmxRig } from '../../../photonics-dmx/types'
import { resolveLastUsedRigId } from '../atoms'
import { getActiveRigs } from '../ipcApi'
import { DmxRigSelectField } from './DmxRigSelectField'

interface DmxRigSelectorProps {
  selectedRigId: string | null
  onRigChange: (rigId: string | null) => void
}

/**
 * Component for selecting a DMX rig to preview.
 */
const DmxRigSelector: React.FC<DmxRigSelectorProps> = ({ selectedRigId, onRigChange }) => {
  const [availableRigs, setAvailableRigs] = useState<DmxRig[]>([])
  const selectedRigIdRef = useRef(selectedRigId)
  selectedRigIdRef.current = selectedRigId

  useEffect(() => {
    let cancelled = false
    const loadActiveRigs = async () => {
      try {
        const activeRigs: DmxRig[] = await getActiveRigs()
        if (cancelled) return
        setAvailableRigs(activeRigs)
        const orderedIds = activeRigs.map((r) => r.id)
        const currentId = selectedRigIdRef.current
        const resolved = resolveLastUsedRigId(currentId, orderedIds)
        if (resolved !== currentId) {
          onRigChange(resolved)
        }
      } catch (error) {
        console.error('Failed to load active rigs:', error)
      }
    }

    void loadActiveRigs()
    return () => {
      cancelled = true
    }
    // Load once per mount; selection is owned by the parent after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [])

  if (availableRigs.length === 0) {
    return (
      <div className="mb-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No active rigs configured. Create and activate a rig in Lights Layout to see DMX preview.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-6">
      <DmxRigSelectField
        className=""
        label="Preview DMX Rig:"
        rigs={availableRigs}
        selectedRigId={selectedRigId}
        onChange={(id) => onRigChange(id || null)}
        selectClassName="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[200px]"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        For actual DMX output set the target rig(s) in Preferences.
      </p>
    </div>
  )
}

export default DmxRigSelector
