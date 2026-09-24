import React from 'react'
import { DmxRig } from '../../../photonics-dmx/types'
import { DmxRigSelectField } from './DmxRigSelectField'

interface DmxRigSelectorProps {
  /** The active rigs to choose from, as useActivePreviewRigs loads them. */
  rigs: DmxRig[]
  selectedRigId: string | null
  onRigChange: (rigId: string | null) => void
}

/**
 * Component for selecting a DMX rig to preview.
 */
const DmxRigSelector: React.FC<DmxRigSelectorProps> = ({ rigs, selectedRigId, onRigChange }) => {
  if (rigs.length === 0) {
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
        rigs={rigs}
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
