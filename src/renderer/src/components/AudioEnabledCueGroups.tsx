import React, { useState, useEffect, useCallback } from 'react'
import { FaChevronDown, FaChevronRight } from 'react-icons/fa'
import {
  getAudioCueGroups,
  getEnabledAudioCueGroups,
  setEnabledAudioCueGroups,
  getAvailableAudioCues,
} from '../ipcApi'

interface AudioCueInfo {
  id: string
  description: string
  groupName?: string
}

interface AudioCueGroupDetails {
  id: string
  name: string
  description: string
  cues: AudioCueInfo[]
  isExpanded: boolean
}

const AudioEnabledCueGroups: React.FC = () => {
  const [allGroups, setAllGroups] = useState<AudioCueGroupDetails[]>([])
  const [enabledGroupIds, setEnabledGroupIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true)
      const [groups, enabled] = await Promise.all([getAudioCueGroups(), getEnabledAudioCueGroups()])

      const mappedGroups: AudioCueGroupDetails[] = groups.map(
        (group: { id: string; name: string; description: string }) => ({
          ...group,
          cues: [],
          isExpanded: false,
        }),
      )

      setAllGroups(mappedGroups)
      setEnabledGroupIds(enabled)
    } catch (error) {
      console.error('Failed to fetch audio cue groups:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const handleGroupToggle = (groupId: string, isEnabled: boolean) => {
    let updatedEnabledIds: string[]

    if (isEnabled) {
      updatedEnabledIds = [...new Set([...enabledGroupIds, groupId])]
    } else {
      updatedEnabledIds = enabledGroupIds.filter((id) => id !== groupId)
    }

    setEnabledGroupIds(updatedEnabledIds)
    setEnabledAudioCueGroups(updatedEnabledIds)
  }

  const handleAccordionToggle = async (groupId: string) => {
    const group = allGroups.find((g) => g.id === groupId)
    if (!group) return

    if (!group.isExpanded && group.cues.length === 0) {
      try {
        const cueDetails = await getAvailableAudioCues(groupId)
        setAllGroups((prev) =>
          prev.map((g) => (g.id === groupId ? { ...g, cues: cueDetails, isExpanded: true } : g)),
        )
        return
      } catch (error) {
        console.error('Error fetching audio cue details:', error)
      }
    }

    setAllGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g)),
    )
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Audio Cue Groups</h2>
        <p>Loading audio cue groups...</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Audio Cue Groups
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Audio cue groups contain different implementations of the audio-reactive effects. Enable the
        groups you want available when Audio Reactive mode is running.
      </p>
      <div className="space-y-4">
        {allGroups.map((group) => (
          <div key={group.id} className="border rounded-lg border-gray-200 dark:border-gray-600">
            <div
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-t-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              onClick={() => handleAccordionToggle(group.id)}>
              <div className="flex items-center flex-1">
                <div className="mr-3 text-gray-600 dark:text-gray-400">
                  {group.isExpanded ? (
                    <FaChevronDown className="w-4 h-4" />
                  ) : (
                    <FaChevronRight className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold">{group.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{group.description}</p>
                </div>
              </div>
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 text-blue-600 rounded"
                checked={enabledGroupIds.includes(group.id)}
                onChange={(e) => handleGroupToggle(group.id, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {group.isExpanded && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                {group.cues.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No cues found in this group.
                  </p>
                ) : (
                  <div className="space-y-1">
                    <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                      Cues in this group ({group.cues.length}):
                    </h4>
                    {group.cues
                      .sort((a, b) => a.id.localeCompare(b.id))
                      .map((cue) => (
                        <div key={cue.id} className="pl-4">
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            <span className="font-medium text-gray-800 dark:text-gray-200">
                              {cue.id}:
                            </span>{' '}
                            {cue.description}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AudioEnabledCueGroups
