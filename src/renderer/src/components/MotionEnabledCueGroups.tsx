import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react'
import { FaChevronDown, FaChevronRight } from 'react-icons/fa'
import {
  getYargMotionCueGroups,
  getAudioMotionCueGroups,
  getEnabledYargMotionCueGroups,
  setEnabledYargMotionCueGroups,
  getAvailableYargMotionCues,
  getDisabledYargMotionCues,
  setDisabledYargMotionCues,
  getEnabledAudioMotionCueGroups,
  setEnabledAudioMotionCueGroups,
  getAvailableAudioMotionCues,
  getDisabledAudioMotionCues,
  setDisabledAudioMotionCues,
} from '../ipcApi'

interface MotionCueInfo {
  id: string
  name: string
  description: string
}

interface MotionCueGroupDetails {
  id: string
  name: string
  description?: string
  cueCount: number
  cues: MotionCueInfo[]
  isExpanded: boolean
}

function GroupEnableCheckbox(props: {
  checked: boolean
  indeterminate: boolean
  onChange: (next: boolean) => void
}): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = props.indeterminate
    }
  }, [props.indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      className="form-checkbox h-5 w-5 text-blue-600 rounded"
      checked={props.checked && !props.indeterminate}
      onChange={(e) => props.onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

export interface MotionEnabledCueGroupsProps {
  /** YARG motion runs with YARG lighting; audio motion runs alongside audio-reactive lighting. */
  platform: 'yarg' | 'audio'
}

const MotionEnabledCueGroups: React.FC<MotionEnabledCueGroupsProps> = ({ platform }) => {
  const [allGroups, setAllGroups] = useState<MotionCueGroupDetails[]>([])
  const [enabledGroupIds, setEnabledGroupIds] = useState<string[]>([])
  const [disabledByGroup, setDisabledByGroup] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true)
      const [groups, enabled, disabled] = await Promise.all(
        platform === 'yarg'
          ? [getYargMotionCueGroups(), getEnabledYargMotionCueGroups(), getDisabledYargMotionCues()]
          : [
              getAudioMotionCueGroups(),
              getEnabledAudioMotionCueGroups(),
              getDisabledAudioMotionCues(),
            ],
      )

      const mappedGroups: MotionCueGroupDetails[] = (
        groups as Array<{
          id: string
          name: string
          description?: string
          cueCount: number
        }>
      ).map((group) => ({
        ...group,
        cues: [],
        isExpanded: false,
      }))

      setAllGroups(mappedGroups)
      setEnabledGroupIds(enabled)
      setDisabledByGroup(disabled)
    } catch (error) {
      console.error('Failed to fetch motion cue groups:', error)
    } finally {
      setLoading(false)
    }
  }, [platform])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const persistEnabledAndDisabled = async (
    nextEnabled: string[],
    nextDisabled: Record<string, string[]>,
  ) => {
    const enabledResult =
      platform === 'yarg'
        ? await setEnabledYargMotionCueGroups(nextEnabled)
        : await setEnabledAudioMotionCueGroups(nextEnabled)
    if (enabledResult && 'success' in enabledResult && enabledResult.success === false) {
      console.error('Failed to save enabled motion cue groups')
      return
    }
    const disabledResult =
      platform === 'yarg'
        ? await setDisabledYargMotionCues(nextDisabled)
        : await setDisabledAudioMotionCues(nextDisabled)
    if (disabledResult && 'success' in disabledResult && disabledResult.success === false) {
      console.error('Failed to save disabled motion cues')
      return
    }
    setEnabledGroupIds(nextEnabled)
    setDisabledByGroup(nextDisabled)
  }

  const getGroupCheckboxState = (
    group: MotionCueGroupDetails,
  ): { checked: boolean; indeterminate: boolean } => {
    if (!enabledGroupIds.includes(group.id)) {
      return { checked: false, indeterminate: false }
    }
    if (group.cues.length === 0) {
      return { checked: true, indeterminate: false }
    }
    const disabled = new Set(disabledByGroup[group.id] ?? [])
    const total = group.cues.length
    let disabledCount = 0
    for (const c of group.cues) {
      if (disabled.has(c.id)) disabledCount++
    }
    if (disabledCount === 0) {
      return { checked: true, indeterminate: false }
    }
    if (disabledCount === total) {
      return { checked: false, indeterminate: false }
    }
    return { checked: false, indeterminate: true }
  }

  const handleGroupToggle = (groupId: string, turnOn: boolean) => {
    const group = allGroups.find((g) => g.id === groupId)
    if (!group) return

    let nextEnabled = [...enabledGroupIds]
    const nextDisabled = { ...disabledByGroup }

    if (turnOn) {
      if (!nextEnabled.includes(groupId)) {
        nextEnabled.push(groupId)
      }
      delete nextDisabled[groupId]
    } else {
      nextEnabled = nextEnabled.filter((id) => id !== groupId)
    }

    void persistEnabledAndDisabled(nextEnabled, nextDisabled)
  }

  const handleAccordionToggle = async (groupId: string) => {
    const group = allGroups.find((g) => g.id === groupId)
    if (!group) return

    if (!group.isExpanded && group.cues.length === 0) {
      try {
        const cueDetails = (
          platform === 'yarg'
            ? await getAvailableYargMotionCues(groupId)
            : await getAvailableAudioMotionCues(groupId)
        ) as MotionCueInfo[]

        setAllGroups((prevGroups) =>
          prevGroups.map((g) =>
            g.id === groupId ? { ...g, cues: cueDetails, isExpanded: true } : g,
          ),
        )
        return
      } catch (error) {
        console.error('Error fetching motion cue details:', error)
      }
    }

    setAllGroups((prevGroups) =>
      prevGroups.map((g) => (g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g)),
    )
  }

  const handleCueToggle = async (groupId: string, cueId: string, turnOn: boolean) => {
    let cues = allGroups.find((g) => g.id === groupId)?.cues ?? []
    if (cues.length === 0) {
      try {
        cues = (
          platform === 'yarg'
            ? await getAvailableYargMotionCues(groupId)
            : await getAvailableAudioMotionCues(groupId)
        ) as MotionCueInfo[]
        setAllGroups((prev) =>
          prev.map((g) => (g.id === groupId ? { ...g, cues, isExpanded: true } : g)),
        )
      } catch (e) {
        console.error('Failed to load motion cues for toggle:', e)
        return
      }
    }

    const nextDisabled = { ...disabledByGroup }
    const set = new Set(nextDisabled[groupId] ?? [])
    if (turnOn) {
      set.delete(cueId)
    } else {
      set.add(cueId)
    }
    if (set.size === 0) {
      delete nextDisabled[groupId]
    } else {
      nextDisabled[groupId] = Array.from(set)
    }

    let nextEnabled = [...enabledGroupIds]
    const allIds = cues.map((c) => c.id)
    const disabledSet = new Set(nextDisabled[groupId] ?? [])
    const allDisabled = allIds.length > 0 && allIds.every((id) => disabledSet.has(id))

    if (allDisabled) {
      nextEnabled = nextEnabled.filter((id) => id !== groupId)
    } else {
      if (!nextEnabled.includes(groupId)) {
        nextEnabled = [...nextEnabled, groupId]
      }
    }

    await persistEnabledAndDisabled(nextEnabled, nextDisabled)
  }

  const title = platform === 'yarg' ? 'YARG Motion Cue Groups' : 'Audio Motion Cue Groups'
  const description =
    platform === 'yarg'
      ? 'YARG motion programs run in parallel with YARG lighting cues and control pan/tilt on moving heads. Enable the groups you want in the random pool. You can disable individual motion programs within an enabled group; the group stays enabled if at least one program remains on.'
      : 'Audio motion programs run alongside audio-reactive lighting cues (same timing as your primary/secondary/strobe layers) and control pan/tilt on moving heads. Enable the groups you want in the random pool. You can disable individual motion programs within an enabled group; the group stays enabled if at least one program remains on.'

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">{title}</h2>
        <p>Loading motion cue groups...</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        {title}
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{description}</p>
      <div className="space-y-4">
        {allGroups.map((group) => {
          const { checked, indeterminate } = getGroupCheckboxState(group)
          const disabledSet = new Set(disabledByGroup[group.id] ?? [])
          return (
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
                <GroupEnableCheckbox
                  checked={checked}
                  indeterminate={indeterminate}
                  onChange={(on) => handleGroupToggle(group.id, on)}
                />
              </div>

              {group.isExpanded && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                  {group.cues.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      No motion programs found in this group.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                        Motion programs in this group ({group.cues.length}):
                      </h4>
                      {group.cues
                        .sort((a, b) => a.id.localeCompare(b.id))
                        .map((cue) => {
                          const isOn =
                            enabledGroupIds.includes(group.id) && !disabledSet.has(cue.id)
                          return (
                            <div key={cue.id} className="flex items-start gap-2 pl-4">
                              <input
                                type="checkbox"
                                className="form-checkbox mt-0.5 h-4 w-4 text-blue-600 rounded shrink-0"
                                checked={isOn}
                                onChange={(e) =>
                                  handleCueToggle(group.id, cue.id, e.target.checked)
                                }
                              />
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                  {cue.name}
                                </span>
                                <span className="text-gray-500 dark:text-gray-500">
                                  {' '}
                                  ({cue.id})
                                </span>
                                {cue.description ? <> — {cue.description}</> : null}
                              </p>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MotionEnabledCueGroups
