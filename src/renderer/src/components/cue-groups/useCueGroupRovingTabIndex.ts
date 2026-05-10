import { useCallback, useMemo, useRef, useState } from 'react'

export interface CueGroupRovingTabIndex {
  /** Returns 0 for the row that owns focus, -1 for siblings (single-tab-stop pattern). */
  tabIndexFor: (groupId: string) => number
  /** Stores the expand button ref so Arrow Up/Down/Home/End can move focus. */
  setRef: (groupId: string, el: HTMLButtonElement | null) => void
  /** Wire to the expand button's onKeyDown to move focus between rows. */
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, groupId: string) => void
  /** Reset the active row when focus enters via Tab (call from button onFocus). */
  onFocus: (groupId: string) => void
}

/**
 * Roving tabindex for an ordered list of cue-group expand buttons.
 *
 * Tab focuses the first/active row; Arrow Up/Down/Home/End move focus between expand buttons
 * within the list (the WAI-ARIA pattern for accordion headers in a single accessibility group).
 * The contained tri-state checkbox keeps its own tab stop.
 */
export function useCueGroupRovingTabIndex(groupIds: string[]): CueGroupRovingTabIndex {
  const [activeId, setActiveId] = useState<string | null>(() => groupIds[0] ?? null)
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map())

  /** When the list changes, keep the roving tab stop on `activeId` if it still exists; otherwise the first row. */
  const effectiveActiveId = useMemo(() => {
    if (groupIds.length === 0) return null
    if (activeId !== null && groupIds.includes(activeId)) return activeId
    return groupIds[0] ?? null
  }, [groupIds, activeId])

  const setRef = useCallback((groupId: string, el: HTMLButtonElement | null) => {
    if (el) {
      refs.current.set(groupId, el)
    } else {
      refs.current.delete(groupId)
    }
  }, [])

  const tabIndexFor = useCallback(
    (groupId: string) => {
      return groupId === effectiveActiveId ? 0 : -1
    },
    [effectiveActiveId],
  )

  const focusAt = useCallback(
    (index: number) => {
      const id = groupIds[index]
      if (!id) return
      setActiveId(id)
      refs.current.get(id)?.focus()
    },
    [groupIds],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, groupId: string) => {
      const idx = groupIds.indexOf(groupId)
      if (idx < 0) return
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          focusAt((idx + 1) % groupIds.length)
          break
        case 'ArrowUp':
          event.preventDefault()
          focusAt((idx - 1 + groupIds.length) % groupIds.length)
          break
        case 'Home':
          event.preventDefault()
          focusAt(0)
          break
        case 'End':
          event.preventDefault()
          focusAt(groupIds.length - 1)
          break
        default:
          break
      }
    },
    [focusAt, groupIds],
  )

  const onFocus = useCallback((groupId: string) => {
    setActiveId(groupId)
  }, [])

  return { tabIndexFor, setRef, onKeyDown, onFocus }
}
