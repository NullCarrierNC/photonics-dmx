import React, { useState, useEffect, useCallback } from 'react'
import { CueGroup } from 'src/photonics-dmx/types'
import {
  getCueGroups,
  getEnabledCueGroups,
  setEnabledCueGroups,
  getAvailableCues,
  getDisabledYargCues,
  setDisabledYargCues,
} from '../ipcApi'
import { createLogger } from '../../../shared/logger'
import { CueGroupEnableList } from './cue-groups/CueGroupEnableList'
import { CueGroupRow } from './cue-groups/CueGroupRow'
import { useCueGroupRovingTabIndex } from './cue-groups/useCueGroupRovingTabIndex'
import { useLatestGenerationGate } from './cue-groups/useLatestGenerationGate'

const log = createLogger('YargEnabledCueGroups')

interface CueInfo {
  id: string
  yargDescription: string
  rb3Description: string
  groupName?: string
}

interface GroupCueDetails extends CueGroup {
  cues: CueInfo[]
  isExpanded: boolean
}

type RowError = { message: string; onRetry: () => void }

const YargEnabledCueGroups: React.FC = () => {
  const [allGroups, setAllGroups] = useState<GroupCueDetails[]>([])
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
      const [all, enabled, disabled] = await Promise.all([
        getCueGroups(),
        getEnabledCueGroups(),
        getDisabledYargCues(),
      ])

      const groupsWithDetails: GroupCueDetails[] = all
        .map((group) => ({
          ...group,
          cues: [],
          isExpanded: false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

      setAllGroups(groupsWithDetails)
      setEnabledGroupIds(enabled)
      setDisabledByGroup(disabled)
      setExpandErrorByGroup({})
      setPersistErrorByGroup({})
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load cue groups'
      setLoadError(message)
      if (e instanceof Error) {
        log.error('Failed to fetch cue groups:', e.message)
      } else {
        log.error('An unknown error occurred:', e)
      }
    } finally {
      setLoading(false)
    }
  }, [])

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
      const enabledResult = await setEnabledCueGroups(nextEnabled)
      if (!persistGeneration.isCurrentGeneration(token)) {
        return { stale: true }
      }
      if (enabledResult && 'success' in enabledResult && enabledResult.success === false) {
        log.error('Failed to save enabled cue groups')
        return { ok: false, error: enabledResult.error || 'Failed to save enabled cue groups' }
      }
      const disabledResult = await setDisabledYargCues(nextDisabled)
      if (!persistGeneration.isCurrentGeneration(token)) {
        return { stale: true }
      }
      if (disabledResult && 'success' in disabledResult && disabledResult.success === false) {
        log.error('Failed to save disabled YARG cues')
        return { ok: false, error: disabledResult.error || 'Failed to save disabled YARG cues' }
      }
      setEnabledGroupIds(nextEnabled)
      setDisabledByGroup(nextDisabled)
      return { ok: true }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save YARG cue group settings'
      log.error('Persistence error for YARG cue groups:', error)
      return { ok: false, error: message }
    }
  }

  const getGroupCheckboxState = (
    group: GroupCueDetails,
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

  const expandRow = useCallback((groupId: string, cues: CueInfo[]) => {
    setAllGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, cues, isExpanded: true } : g)),
    )
  }, [])

  const handleAccordionToggle = async (groupId: string) => {
    const group = allGroups.find((g) => g.id === groupId)
    if (!group) return

    if (!group.isExpanded && group.cues.length === 0) {
      try {
        const cueDetails = await getAvailableCues(group.id)
        setExpandErrorByGroup((prev) => {
          if (!prev[groupId]) return prev
          const next = { ...prev }
          delete next[groupId]
          return next
        })
        expandRow(groupId, cueDetails)
        return
      } catch (error) {
        log.error('Error fetching cue details:', error)
        const message =
          error instanceof Error ? error.message : 'Failed to load cues for this group'
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
        cues = await getAvailableCues(groupId)
        expandRow(groupId, cues)
      } catch (e) {
        log.error('Failed to load cues for toggle:', e)
        const message = e instanceof Error ? e.message : 'Failed to load cues for this group'
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

  return (
    <CueGroupEnableList
      title="YARG Lighting Cue Groups"
      description="Cue groups contain different implementations of the same cue triggered by YARG. Having multiple groups enabled allows for a wider range of visual effects during gameplay. The Stage Kit group is used as a fallback if no other group contains the necessary cue. You can disable individual cues within an enabled group; the group stays enabled if at least one cue remains on."
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
                No cues found in this group.
              </p>
            ) : (
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 ">
                  Cues in this group ({group.cues.length}):
                </h4>
                {group.cues
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map((cue) => {
                    const isOn = enabledGroupIds.includes(group.id) && !disabledSet.has(cue.id)
                    const rowLabelId = `yarg-cue-${group.id}-${cue.id}-label`
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
                            {cue.id}:
                          </span>{' '}
                          {cue.yargDescription}
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

export default YargEnabledCueGroups
