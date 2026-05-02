import React, { useState, useEffect, useCallback } from 'react'
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
import { createLogger } from '../../../shared/logger'
import { CueGroupEnableList } from './cue-groups/CueGroupEnableList'
import { CueGroupRow } from './cue-groups/CueGroupRow'
import { useCueGroupRovingTabIndex } from './cue-groups/useCueGroupRovingTabIndex'
import { useLatestGenerationGate } from './cue-groups/useLatestGenerationGate'

const log = createLogger('MotionEnabledCueGroups')

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

export interface MotionEnabledCueGroupsProps {
  /** YARG motion runs with YARG lighting; audio motion runs alongside audio-reactive lighting. */
  platform: 'yarg' | 'audio'
}

type RowError = { message: string; onRetry: () => void }

const MotionEnabledCueGroups: React.FC<MotionEnabledCueGroupsProps> = ({ platform }) => {
  const [allGroups, setAllGroups] = useState<MotionCueGroupDetails[]>([])
  const [enabledGroupIds, setEnabledGroupIds] = useState<string[]>([])
  const [disabledByGroup, setDisabledByGroup] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expandErrorByGroup, setExpandErrorByGroup] = useState<Record<string, RowError>>({})
  const [persistErrorByGroup, setPersistErrorByGroup] = useState<Record<string, RowError>>({})
  const persistGeneration = useLatestGenerationGate()
  const roving = useCueGroupRovingTabIndex(allGroups.map((g) => g.id))

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const [groups, enabled, disabled] = await Promise.all(
        platform === 'yarg'
          ? [getYargMotionCueGroups(), getEnabledYargMotionCueGroups(), getDisabledYargMotionCues()]
          : [
              getAudioMotionCueGroups(),
              getEnabledAudioMotionCueGroups(),
              getDisabledAudioMotionCues(),
            ],
      )

      const mappedGroups: MotionCueGroupDetails[] = groups.map((group) => ({
        ...group,
        cues: [],
        isExpanded: false,
      }))

      setAllGroups(mappedGroups)
      setEnabledGroupIds(enabled)
      setDisabledByGroup(disabled)
      setExpandErrorByGroup({})
      setPersistErrorByGroup({})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load motion cue groups'
      setLoadError(message)
      log.error('Failed to fetch motion cue groups:', error)
    } finally {
      setLoading(false)
    }
  }, [platform])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const clearPersistError = useCallback((groupId: string) => {
    setPersistErrorByGroup((prev) => {
      if (!prev[groupId]) return prev
      const next = { ...prev }
      delete next[groupId]
      return next
    })
  }, [])

  const persistEnabledAndDisabled = async (
    nextEnabled: string[],
    nextDisabled: Record<string, string[]>,
  ): Promise<{ ok: true } | { ok: false; error: string } | { stale: true }> => {
    const token = persistGeneration.nextGeneration()
    try {
      const enabledResult =
        platform === 'yarg'
          ? await setEnabledYargMotionCueGroups(nextEnabled)
          : await setEnabledAudioMotionCueGroups(nextEnabled)
      if (!persistGeneration.isCurrentGeneration(token)) {
        return { stale: true }
      }
      if (enabledResult && 'success' in enabledResult && enabledResult.success === false) {
        log.error('Failed to save enabled motion cue groups')
        return {
          ok: false,
          error: enabledResult.error || 'Failed to save enabled motion cue groups',
        }
      }
      const disabledResult =
        platform === 'yarg'
          ? await setDisabledYargMotionCues(nextDisabled)
          : await setDisabledAudioMotionCues(nextDisabled)
      if (!persistGeneration.isCurrentGeneration(token)) {
        return { stale: true }
      }
      if (disabledResult && 'success' in disabledResult && disabledResult.success === false) {
        log.error('Failed to save disabled motion cues')
        return { ok: false, error: disabledResult.error || 'Failed to save disabled motion cues' }
      }
      setEnabledGroupIds(nextEnabled)
      setDisabledByGroup(nextDisabled)
      return { ok: true }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save motion cue group settings'
      log.error('Persistence error for motion cue groups:', error)
      return { ok: false, error: message }
    }
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

    void (async () => {
      const result = await persistEnabledAndDisabled(nextEnabled, nextDisabled)
      if ('stale' in result) return
      if (result.ok) {
        clearPersistError(groupId)
      } else {
        setPersistErrorByGroup((prev) => ({
          ...prev,
          [groupId]: { message: result.error, onRetry: () => handleGroupToggle(groupId, turnOn) },
        }))
      }
    })()
  }

  const expandRow = useCallback((groupId: string, cues: MotionCueInfo[]) => {
    setAllGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, cues, isExpanded: true } : g)),
    )
  }, [])

  const fetchCuesForGroup = useCallback(
    async (groupId: string): Promise<MotionCueInfo[]> => {
      return platform === 'yarg'
        ? getAvailableYargMotionCues(groupId)
        : getAvailableAudioMotionCues(groupId)
    },
    [platform],
  )

  const handleAccordionToggle = async (groupId: string) => {
    const group = allGroups.find((g) => g.id === groupId)
    if (!group) return

    if (!group.isExpanded && group.cues.length === 0) {
      try {
        const cueDetails = await fetchCuesForGroup(groupId)
        setExpandErrorByGroup((prev) => {
          if (!prev[groupId]) return prev
          const next = { ...prev }
          delete next[groupId]
          return next
        })
        expandRow(groupId, cueDetails)
        return
      } catch (error) {
        log.error('Error fetching motion cue details:', error)
        const message = error instanceof Error ? error.message : 'Failed to load motion cues'
        setExpandErrorByGroup((prev) => ({
          ...prev,
          [groupId]: { message, onRetry: () => void handleAccordionToggle(groupId) },
        }))
        return
      }
    }

    setAllGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g)),
    )
  }

  const handleCueToggle = async (groupId: string, cueId: string, turnOn: boolean) => {
    let cues = allGroups.find((g) => g.id === groupId)?.cues ?? []
    if (cues.length === 0) {
      try {
        cues = await fetchCuesForGroup(groupId)
        expandRow(groupId, cues)
      } catch (e) {
        log.error('Failed to load motion cues for toggle:', e)
        const message = e instanceof Error ? e.message : 'Failed to load motion cues'
        setExpandErrorByGroup((prev) => ({
          ...prev,
          [groupId]: { message, onRetry: () => void handleCueToggle(groupId, cueId, turnOn) },
        }))
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

    const result = await persistEnabledAndDisabled(nextEnabled, nextDisabled)
    if ('stale' in result) return
    if (result.ok) {
      clearPersistError(groupId)
    } else {
      setPersistErrorByGroup((prev) => ({
        ...prev,
        [groupId]: {
          message: result.error,
          onRetry: () => void handleCueToggle(groupId, cueId, turnOn),
        },
      }))
    }
  }

  const title = platform === 'yarg' ? 'YARG Motion Cue Groups' : 'Audio Motion Cue Groups'
  const description =
    platform === 'yarg'
      ? 'YARG motion programs run in parallel with YARG lighting cues and control pan/tilt on moving heads. Enable the groups you want in the random pool. You can disable individual motion programs within an enabled group; the group stays enabled if at least one program remains on.'
      : 'Audio motion programs run alongside audio-reactive lighting cues (same timing as your primary/secondary/strobe layers) and control pan/tilt on moving heads. Enable the groups you want in the random pool. You can disable individual motion programs within an enabled group; the group stays enabled if at least one program remains on.'

  return (
    <CueGroupEnableList
      title={title}
      description={description}
      loading={loading}
      loadError={loadError}
      onRetryLoad={() => {
        void fetchGroups()
      }}>
      {allGroups.map((group) => {
        const { checked, indeterminate } = getGroupCheckboxState(group)
        const disabledSet = new Set(disabledByGroup[group.id] ?? [])
        return (
          <CueGroupRow
            key={group.id}
            groupId={group.id}
            name={group.name}
            description={group.description}
            isExpanded={group.isExpanded}
            onToggleExpanded={() => void handleAccordionToggle(group.id)}
            checked={checked}
            indeterminate={indeterminate}
            onEnableChange={(on) => handleGroupToggle(group.id, on)}
            tabIndex={roving.tabIndexFor(group.id)}
            expandButtonRef={(el) => roving.setRef(group.id, el)}
            onExpandButtonKeyDown={(e) => roving.onKeyDown(e, group.id)}
            onExpandButtonFocus={() => roving.onFocus(group.id)}
            loadError={expandErrorByGroup[group.id] ?? null}
            persistError={persistErrorByGroup[group.id] ?? null}>
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
                    const isOn = enabledGroupIds.includes(group.id) && !disabledSet.has(cue.id)
                    const rowLabelId = `motion-cue-${platform}-${group.id}-${cue.id}-label`
                    return (
                      <div key={cue.id} className="flex items-start gap-2 pl-4">
                        <input
                          type="checkbox"
                          className="form-checkbox mt-0.5 h-4 w-4 text-blue-600 rounded shrink-0"
                          checked={isOn}
                          onChange={(e) => handleCueToggle(group.id, cue.id, e.target.checked)}
                          aria-labelledby={rowLabelId}
                        />
                        <p id={rowLabelId} className="text-xs text-gray-600 dark:text-gray-400">
                          <span className="font-medium text-gray-800 dark:text-gray-200">
                            {cue.name}
                          </span>
                          <span className="text-gray-500 dark:text-gray-500"> ({cue.id})</span>
                          {cue.description ? <> — {cue.description}</> : null}
                        </p>
                      </div>
                    )
                  })}
              </div>
            )}
          </CueGroupRow>
        )
      })}
    </CueGroupEnableList>
  )
}

export default MotionEnabledCueGroups
