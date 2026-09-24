import React, { useEffect, useState, useCallback, useRef } from 'react'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  getEnabledCueGroups,
  getCueGroups,
  getEnabledRb3CueGroups,
  getRb3CueGroups,
} from '../ipcApi'
import { DraftNumberField } from './controls/DraftField'
import { createLogger } from '../../../shared/logger'
const log = createLogger('CueRegistrySelector')

type CueRegistryType = 'YARG' | 'RB3E'

type CueGroup = {
  id: string
  name: string
  description: string
  cueTypes: string[]
}

const NO_GROUPS: CueGroup[] = []

interface CueRegistrySelectorProps {
  onRegistryChange: (registryType: CueRegistryType) => void
  /**
   * A group was chosen, by the user or by the selector itself: the preferred group once listed,
   * otherwise the first group standing in for a selection the list does not offer.
   */
  onGroupChange: (groupIds: string[], origin: 'user' | 'default') => void
  selectedVenueSize: 'NoVenue' | 'Small' | 'Large'
  onVenueSizeChange: (venueSize: 'NoVenue' | 'Small' | 'Large') => void
  selectedBpm: number
  onBpmChange: (bpm: number) => void
  /** The selected group. The selector shows it and reports changes, the parent owns it. */
  selectedGroupId: string
  /** A group the parent is waiting for. It is chosen as soon as the list offers it. */
  preferredGroupId?: string
  /** Which registry's cue groups to list (YARG lighting vs RB3 cue-mode groups). */
  selectedRegistryType: CueRegistryType
  /**
   * Whether the parent has settled the selection it restores. Until then an empty or unknown
   * selection is left alone. After that it is replaced with the first group, which is also how a
   * registry with one group gets its only choice picked.
   */
  ready?: boolean

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
  preferredGroupId = '',
  selectedRegistryType,
  ready = true,
}) => {
  // Tagged with the registry they were fetched for, so a list from the previous registry is never
  // used to pick a group in the new one.
  const [fetched, setFetched] = useState<{ registry: CueRegistryType; groups: CueGroup[] }>({
    registry: selectedRegistryType,
    groups: [],
  })
  const groups = fetched.registry === selectedRegistryType ? fetched.groups : NO_GROUPS
  // Always holds the latest selected registry so an in-flight fetch can detect that the registry
  // changed (YARG <-> RB3E) before its awaits resolved and discard its now-stale results. Updated
  // in an effect (not during render) so it commits before any fetch's awaits resolve.
  const registryRef = useRef(selectedRegistryType)
  useEffect(() => {
    registryRef.current = selectedRegistryType
  }, [selectedRegistryType])

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
      setFetched({ registry: selectedRegistryType, groups: sortedGroups })
    } catch (error) {
      log.error('Error fetching cue groups:', error)
    }
  }, [selectedRegistryType])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchGroups sets state in async callback
    void fetchGroups()
  }, [fetchGroups])

  useEffect(() => {
    const handleNodeCuesChanged = () => {
      void fetchGroups()
    }
    addIpcListener(RENDERER_RECEIVE.NODE_CUES_CHANGED, handleNodeCuesChanged)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.NODE_CUES_CHANGED, handleNodeCuesChanged)
    }
  }, [fetchGroups])

  // The preferred group is chosen once listed. Otherwise an empty selection, one from another
  // registry or one whose group went away falls back to the first group, and the parent hears it
  // so the venue, BPM and effect controls enable.
  useEffect(() => {
    if (!ready || groups.length === 0) {
      return
    }
    const listed = (groupId: string) => groups.some((g) => g.id === groupId)
    if (preferredGroupId && preferredGroupId !== selectedGroupId && listed(preferredGroupId)) {
      onGroupChange([preferredGroupId], 'default')
    } else if (!listed(selectedGroupId)) {
      onGroupChange([groups[0].id], 'default')
    }
  }, [ready, groups, selectedGroupId, preferredGroupId, onGroupChange])

  const handleGroupChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onGroupChange([event.target.value], 'user')
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
        <DraftNumberField
          aria-label="BPM"
          min={60}
          max={200}
          value={selectedBpm}
          onCommit={onBpmChange}
          className="p-2 border rounded dark:bg-gray-700 dark:text-gray-200 h-10 w-20"
          disabled={!selectedGroupId}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Cue Group
        </label>
        <select
          aria-label="Cue Group"
          value={groups.some((g) => g.id === selectedGroupId) ? selectedGroupId : ''}
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
