import React, { useEffect, useState } from 'react'
import { DmxRig } from '../../../photonics-dmx/types'
import { CONFIG } from '../../../shared/ipcChannels'

interface DmxUniverseSelectorProps {
  selectedUniverse: number | null
  onUniverseChange: (universe: number | null) => void
  availableUniverses?: number[]
}

/**
 * Component for selecting a DMX universe to preview.
 * Automatically loads available universes from active rigs if not provided.
 */
const DmxUniverseSelector: React.FC<DmxUniverseSelectorProps> = ({
  selectedUniverse,
  onUniverseChange,
  availableUniverses: providedUniverses,
}) => {
  const [availableUniverses, setAvailableUniverses] = useState<number[]>(providedUniverses || [])

  // Load active rigs to get available universes if not provided
  useEffect(() => {
    if (providedUniverses !== undefined) {
      // Use provided universes
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from prop
      setAvailableUniverses(providedUniverses)
      return
    }

    const loadActiveRigs = async () => {
      try {
        const activeRigs: DmxRig[] = await window.electron.ipcRenderer.invoke(
          CONFIG.GET_ACTIVE_RIGS,
        )
        const universes = activeRigs.map((rig) => rig.universe || 1).sort((a, b) => a - b)
        setAvailableUniverses(universes)

        // Set default selected universe to the first available universe if none selected
        if (universes.length > 0 && selectedUniverse === null) {
          onUniverseChange(universes[0])
        }
      } catch (error) {
        console.error('Failed to load active rigs:', error)
      }
    }

    loadActiveRigs()
  }, [providedUniverses, selectedUniverse, onUniverseChange])

  if (availableUniverses.length === 0) {
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
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        DMX Universe:
      </label>
      <select
        value={selectedUniverse ?? ''}
        onChange={(e) => onUniverseChange(parseInt(e.target.value) || null)}
        className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[150px]">
        {availableUniverses.map((universe) => (
          <option key={universe} value={universe}>
            Universe {universe}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Select a universe to preview. Only active rigs are shown.
      </p>
    </div>
  )
}

export default DmxUniverseSelector
