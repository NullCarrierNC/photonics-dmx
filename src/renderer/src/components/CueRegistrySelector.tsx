import React, { useEffect, useState, useCallback, useRef } from 'react'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { CONFIG, LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels'

type CueRegistryType = 'YARG' | 'RB3E'

type CueGroup = {
  id: string
  name: string
  description: string
  cueTypes: string[]
}

interface CueRegistrySelectorProps {
  onRegistryChange: (registryType: CueRegistryType) => void
  onGroupChange: (groupIds: string[]) => void
  selectedVenueSize: 'NoVenue' | 'Small' | 'Large'
  onVenueSizeChange: (venueSize: 'NoVenue' | 'Small' | 'Large') => void
  selectedBpm: number
  onBpmChange: (bpm: number) => void
  selectedGroupId: string

  /**
   * When true, the component will initialize with the currently active group selected.
   * Regardless of this setting, all available groups will be shown in the dropdown.
   */
  useActiveGroupsOnly?: boolean
}

const CueRegistrySelector: React.FC<CueRegistrySelectorProps> = ({
  onGroupChange,
  selectedVenueSize,
  onVenueSizeChange,
  selectedBpm,
  onBpmChange,
  selectedGroupId,
}) => {
  const [registryType] = useState<CueRegistryType>('YARG')
  const [groups, setGroups] = useState<CueGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const isInitialMount = useRef(true)

  // Wrap callback to avoid infinite loops
  const handleGroupChangeCallback = useCallback(
    (groupId: string) => {
      // Pass the group ID directly
      onGroupChange([groupId])
    },
    [onGroupChange],
  )

  const fetchGroups = useCallback(async () => {
    try {
      console.log('Fetching enabled cue groups...')

      const enabledGroupIds = await window.electron.ipcRenderer.invoke(
        CONFIG.GET_ENABLED_CUE_GROUPS,
      )
      const allGroups = await window.electron.ipcRenderer.invoke(LIGHT.GET_CUE_GROUPS)

      const enabledGroups = allGroups.filter((g: CueGroup) => enabledGroupIds.includes(g.id))

      console.log(`Enabled groups:`, enabledGroups)
      setGroups(enabledGroups)

      if (selectedGroup === '') {
        if (enabledGroups.length > 0 && isInitialMount.current) {
          const firstGroup = enabledGroups[0]
          setSelectedGroup(firstGroup.id)
          handleGroupChangeCallback(firstGroup.id)
          isInitialMount.current = false
        }
      } else if (isInitialMount.current && enabledGroups.length > 0) {
        handleGroupChangeCallback(selectedGroup)
        isInitialMount.current = false
      }
    } catch (error) {
      console.error('Error fetching cue groups:', error)
    }
  }, [handleGroupChangeCallback, selectedGroup])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchGroups sets state in async callback
    fetchGroups()
  }, [fetchGroups, registryType])

  useEffect(() => {
    const handleNodeCuesChanged = () => {
      fetchGroups()
    }
    addIpcListener(RENDERER_RECEIVE.NODE_CUES_CHANGED, handleNodeCuesChanged)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.NODE_CUES_CHANGED, handleNodeCuesChanged)
    }
  }, [fetchGroups])

  // Separate effect to handle fallback when selected group becomes invalid
  useEffect(() => {
    if (groups.length > 0 && selectedGroup && !groups.some((g) => g.id === selectedGroup)) {
      // If the currently selected group is no longer available, fallback to first group
      const firstGroup = groups[0]
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fallback when selected group removed
      setSelectedGroup(firstGroup.id)
      handleGroupChangeCallback(firstGroup.id)
    }
  }, [groups, selectedGroup, handleGroupChangeCallback])

  const handleGroupChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const groupId = event.target.value
    setSelectedGroup(groupId)
    handleGroupChangeCallback(groupId)
  }

  return (
    <div className="flex items-center gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Venue Size
        </label>
        <select
          value={selectedVenueSize}
          onChange={(e) => onVenueSizeChange(e.target.value as 'NoVenue' | 'Small' | 'Large')}
          className="p-2 pr-8 border rounded dark:bg-gray-700 dark:text-gray-200 h-10"
          style={{ width: '150px' }}
          disabled={!selectedGroupId}>
          <option value="NoVenue">No Venue</option>
          <option value="Small">Small</option>
          <option value="Large">Large</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          BPM
        </label>
        <input
          type="number"
          min="60"
          max="200"
          value={selectedBpm}
          onChange={(e) => onBpmChange(parseInt(e.target.value) || 120)}
          className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200 h-10"
          style={{ width: '80px' }}
          disabled={!selectedGroupId}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Cue Group
        </label>
        <select
          value={selectedGroup}
          onChange={handleGroupChange}
          className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200"
          style={{ width: '200px' }}>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default CueRegistrySelector
