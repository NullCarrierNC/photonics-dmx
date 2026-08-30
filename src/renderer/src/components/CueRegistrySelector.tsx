import React, { useEffect, useState, useCallback, useRef } from 'react'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  getEnabledCueGroups,
  getCueGroups,
  getEnabledRb3CueGroups,
  getRb3CueGroups,
} from '../ipcApi'
import { createLogger } from '../../../shared/logger'
const log = createLogger('CueRegistrySelector')

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
  /** Which registry's cue groups to list (YARG lighting vs RB3 cue-mode groups). */
  selectedRegistryType: CueRegistryType

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
  selectedRegistryType,
}) => {
  const [groups, setGroups] = useState<CueGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const isInitialMount = useRef(true)
  // Always holds the latest selected registry so an in-flight fetch can detect that the registry
  // changed (YARG <-> RB3E) before its awaits resolved and discard its now-stale results. Updated
  // in an effect (not during render) so it commits before any fetch's awaits resolve.
  const registryRef = useRef(selectedRegistryType)
  useEffect(() => {
    registryRef.current = selectedRegistryType
  }, [selectedRegistryType])

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
      log.info('Fetching enabled cue groups...')

      const isRb3 = selectedRegistryType === 'RB3E'
      const enabledGroupIds = isRb3 ? await getEnabledRb3CueGroups() : await getEnabledCueGroups()
      const allGroups = isRb3 ? await getRb3CueGroups() : await getCueGroups()

      // A registry switch since this fetch started makes these results stale; discard them so a
      // late YARG fetch can't clobber the RB3E selection (or vice versa).
      if (registryRef.current !== selectedRegistryType) {
        return
      }

      // Motion-only groups (no lighting cue types) are chosen under Motion Cue Simulation.
      const enabledGroups = allGroups.filter(
        (g: CueGroup) => enabledGroupIds.includes(g.id) && g.cueTypes.length > 0,
      )

      const sortedGroups = [...enabledGroups].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      )

      log.info(`Enabled groups:`, sortedGroups)
      setGroups(sortedGroups)

      const selectionValid =
        selectedGroup !== '' && sortedGroups.some((g) => g.id === selectedGroup)
      if (!selectionValid) {
        // No valid current selection — initial load, a registry switch (YARG <-> RB3E), or the
        // selected group was removed. Auto-select the first group and notify the parent so the
        // downstream venue/bpm/effect controls enable even when there is only one group (which
        // can't be picked via the dropdown's onChange).
        if (sortedGroups.length > 0) {
          const firstGroup = sortedGroups[0]
          setSelectedGroup(firstGroup.id)
          handleGroupChangeCallback(firstGroup.id)
        }
      } else if (isInitialMount.current) {
        // Valid restored selection on first load: re-notify the parent to sync.
        handleGroupChangeCallback(selectedGroup)
      }
      isInitialMount.current = false
    } catch (error) {
      log.error('Error fetching cue groups:', error)
    }
  }, [handleGroupChangeCallback, selectedGroup, selectedRegistryType])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchGroups sets state in async callback
    fetchGroups()
  }, [fetchGroups])

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
