/**
 * The enable/disable panel for one domain's cue groups.
 *
 * YARG, RB3, audio and the three motion platforms present the same panel over their own IPC
 * surface, so the domain arrives as a descriptor rather than the component being written per
 * domain.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createLogger } from '../../../../shared/logger'
import type { IpcEventChannel } from '../../../../shared/ipcTypes'
import { addIpcListener, removeIpcListener } from '../../utils/ipcHelpers'
import { CueGroupEnableList } from './CueGroupEnableList'
import { CueGroupRow } from './CueGroupRow'
import { useCueGroupRovingTabIndex } from './useCueGroupRovingTabIndex'
import { useWriteQueue } from '../../hooks/useWriteQueue'

/** The least a group row needs. Each domain's own group type carries more. */
export interface CueGroupRowData {
  id: string
  name: string
  description?: string
}

/** The least a cue row needs. Each domain's own cue type carries its own wording. */
export interface CueRowData {
  id: string
}

type SaveResult = { success?: boolean; error?: string } | void | undefined

/** Everything that differs between one domain's panel and another's. */
export interface CueGroupsDomain<G extends CueGroupRowData, C extends CueRowData> {
  /** Logger scope, and the prefix for per-cue row label ids. */
  key: string
  title: string
  description: string
  /** Names the domain in error copy, e.g. YARG. */
  label: string
  getGroups: () => Promise<G[]>
  getEnabled: () => Promise<string[]>
  setEnabled: (groupIds: string[]) => Promise<SaveResult>
  getDisabled: () => Promise<Record<string, string[]>>
  setDisabled: (disabled: Record<string, string[]>) => Promise<SaveResult>
  getCues: (groupId: string) => Promise<C[]>
  /** Broadcast when the enabled groups or disabled cues change outside this panel. */
  changedEvent?: IpcEventChannel
  /** What one cue's row reads, since a motion program is named differently to a lighting cue. */
  renderCueLabel: (cue: C) => React.ReactNode
  /** Shown in place of the cue list when an expanded group holds none. */
  emptyLabel: string
  /** The heading above the cue list, given how many there are. */
  cuesHeading: (count: number) => string
}

type GroupCueDetails<G extends CueGroupRowData, C extends CueRowData> = G & {
  cues: C[]
  isExpanded: boolean
}

type RowError = { message: string; onRetry: () => void }

/** The enabled groups and the cues disabled within each, as the domain holds them. */
type Selection = { enabled: string[]; disabled: Record<string, string[]> }

export function CueGroupsPanel<G extends CueGroupRowData, C extends CueRowData>({
  domain,
}: {
  domain: CueGroupsDomain<G, C>
}): JSX.Element {
  type Row = GroupCueDetails<G, C>
  const log = useMemo(() => createLogger(domain.key), [domain.key])
  const [allGroups, setAllGroups] = useState<Row[]>([])
  const [enabledGroupIds, setEnabledGroupIds] = useState<string[]>([])
  const [disabledByGroup, setDisabledByGroup] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expandErrorByGroup, setExpandErrorByGroup] = useState<Record<string, RowError>>({})
  const [persistErrorByGroup, setPersistErrorByGroup] = useState<Record<string, RowError>>({})
  // What the domain last accepted. Writes run one at a time, each built from this once the one
  // before it has landed, so a second tick carries the first.
  const saved = useRef<Selection>({ enabled: [], disabled: {} })
  const { enqueue: queueWrite } = useWriteQueue()
  const roving = useCueGroupRovingTabIndex(allGroups.map((g) => g.id))

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const [all, enabled, disabled] = await Promise.all([
        domain.getGroups(),
        domain.getEnabled(),
        domain.getDisabled(),
      ])

      const groupsWithDetails: Row[] = all
        .map((group) => ({
          ...group,
          cues: [] as C[],
          isExpanded: false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

      setAllGroups(groupsWithDetails)
      saved.current = { enabled, disabled }
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
  }, [domain, log])

  useEffect(() => {
    void fetchGroups()
  }, [fetchGroups])

  // Another window, or a cue saved in the Cue Editor, can change the selection. It is read again
  // behind any write in flight, so the next write builds on what the domain holds.
  const refreshQueued = useRef(false)
  const refreshSelection = useCallback(async () => {
    refreshQueued.current = false
    const [all, enabled, disabled] = await Promise.all([
      domain.getGroups(),
      domain.getEnabled(),
      domain.getDisabled(),
    ])
    saved.current = { enabled, disabled }
    setEnabledGroupIds(enabled)
    setDisabledByGroup(disabled)
    setAllGroups((prev) =>
      all
        .map((group) => {
          const shown = prev.find((g) => g.id === group.id)
          return { ...group, cues: shown?.cues ?? [], isExpanded: shown?.isExpanded ?? false }
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    )
  }, [domain])

  useEffect(() => {
    const event = domain.changedEvent
    if (!event) return
    const onChanged = () => {
      if (refreshQueued.current) return
      refreshQueued.current = true
      void queueWrite(refreshSelection).catch((error: unknown) => {
        refreshQueued.current = false
        log.error(`Could not read the ${domain.label} cue groups again:`, error)
      })
    }
    addIpcListener(event, onChanged)
    return () => removeIpcListener(event, onChanged)
  }, [domain, log, refreshSelection, queueWrite])

  const clearPersistError = useCallback((groupId: string) => {
    setPersistErrorByGroup((prev) => {
      if (!prev[groupId]) return prev
      const next = { ...prev }
      delete next[groupId]
      return next
    })
  }, [])

  /** Undo an accepted enabled-groups write after the disabled-cues write that followed it failed. */
  const restoreEnabled = async (previous: string[]): Promise<void> => {
    try {
      await domain.setEnabled(previous)
    } catch (error) {
      log.error(`Could not put the enabled ${domain.label} cue groups back:`, error)
    }
  }

  const writeSelection = async (
    next: Selection,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const enabledResult = await domain.setEnabled(next.enabled)
      if (enabledResult && 'success' in enabledResult && enabledResult.success === false) {
        log.error('Failed to save enabled cue groups')
        return { ok: false, error: enabledResult.error || 'Failed to save enabled cue groups' }
      }
      const disabledResult = await domain.setDisabled(next.disabled)
      if (disabledResult && 'success' in disabledResult && disabledResult.success === false) {
        log.error(`Failed to save disabled ${domain.label} cues`)
        // The enabled list is already on disk. Putting it back keeps what is stored matching what
        // the panel shows, rather than leaving the next launch on a state nobody chose.
        await restoreEnabled(saved.current.enabled)
        return {
          ok: false,
          error: disabledResult.error || `Failed to save disabled ${domain.label} cues`,
        }
      }
      saved.current = next
      setEnabledGroupIds(next.enabled)
      setDisabledByGroup(next.disabled)
      return { ok: true }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Failed to save ${domain.label} cue group settings`
      log.error(`Persistence error for ${domain.label} cue groups:`, error)
      return { ok: false, error: message }
    }
  }

  /** Queues a write behind any still in flight, building it from what those saved. */
  const persistEnabledAndDisabled = (
    build: (current: Selection) => Selection,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    return queueWrite(() => writeSelection(build(saved.current)))
  }

  const getGroupCheckboxState = (group: Row): { checked: boolean; indeterminate: boolean } => {
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

    const build = (current: Selection): Selection => {
      let nextEnabled = [...current.enabled]
      const nextDisabled = { ...current.disabled }

      if (turnOn) {
        if (!nextEnabled.includes(groupId)) {
          nextEnabled.push(groupId)
        }
        delete nextDisabled[groupId]
      } else {
        nextEnabled = nextEnabled.filter((id) => id !== groupId)
      }
      return { enabled: nextEnabled, disabled: nextDisabled }
    }

    void (async () => {
      const result = await persistEnabledAndDisabled(build)
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

  const expandRow = useCallback((groupId: string, cues: C[]) => {
    setAllGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, cues, isExpanded: true } : g)),
    )
  }, [])

  const handleAccordionToggle = async (groupId: string) => {
    const group = allGroups.find((g) => g.id === groupId)
    if (!group) return

    if (!group.isExpanded && group.cues.length === 0) {
      try {
        const cueDetails = await domain.getCues(group.id)
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
    let cues: C[] = allGroups.find((g) => g.id === groupId)?.cues ?? []
    if (cues.length === 0) {
      try {
        cues = await domain.getCues(groupId)
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

    const build = (current: Selection): Selection => {
      const nextDisabled = { ...current.disabled }
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

      let nextEnabled = [...current.enabled]
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
      return { enabled: nextEnabled, disabled: nextDisabled }
    }

    const result = await persistEnabledAndDisabled(build)
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
      title={domain.title}
      description={domain.description}
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
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">{domain.emptyLabel}</p>
            ) : (
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 ">
                  {domain.cuesHeading(group.cues.length)}
                </h4>
                {[...group.cues]
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map((cue) => {
                    const isOn = enabledGroupIds.includes(group.id) && !disabledSet.has(cue.id)
                    const rowLabelId = `${domain.key}-cue-${group.id}-${cue.id}-label`
                    return (
                      <div key={cue.id} className="flex items-start gap-2 pl-4">
                        <input
                          type="checkbox"
                          className="form-checkbox mt-0.5 h-4 w-4 text-blue-600 rounded shrink-0"
                          checked={isOn}
                          onChange={(e) => void handleCueToggle(group.id, cue.id, e.target.checked)}
                          aria-labelledby={rowLabelId}
                        />
                        <p id={rowLabelId} className="text-xs text-gray-600 dark:text-gray-400">
                          {domain.renderCueLabel(cue)}
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
