import { useEffect, useSyncExternalStore } from 'react'
import { reportUnsavedChanges } from '../ipcApi'

/** How many guards on this page hold unsaved changes, so the page reports one answer for all. */
let dirtyGuards = 0

/** How many draft fields on this page hold typed text they have not committed. */
let uncommittedDrafts = 0
const draftListeners = new Set<() => void>()

function subscribeToDrafts(listener: () => void): () => void {
  draftListeners.add(listener)
  return () => {
    draftListeners.delete(listener)
  }
}

function hasUncommittedDrafts(): boolean {
  return uncommittedDrafts > 0
}

function changeUncommittedDrafts(delta: number): void {
  uncommittedDrafts += delta
  draftListeners.forEach((listener) => listener())
}

/**
 * Counts a draft field's typed text as an unsaved change for as long as it stays uncommitted. It
 * weighs only on a page that guards its changes with `useUnloadGuard`.
 */
export function useUncommittedDraft(uncommitted: boolean): void {
  useEffect(() => {
    if (!uncommitted) return
    changeUncommittedDrafts(1)
    return () => changeUncommittedDrafts(-1)
  }, [uncommitted])
}

/**
 * While `dirty`, or while a draft field on the page holds uncommitted text, the page refuses to
 * unload, so closing or reloading its window brings up main's Leave or Stay prompt, and main knows
 * to ask about the page before a Quit closes any window.
 */
export function useUnloadGuard(dirty: boolean): void {
  const drafts = useSyncExternalStore(subscribeToDrafts, hasUncommittedDrafts)
  const unsaved = dirty || drafts
  useEffect(() => {
    if (!unsaved) return
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    dirtyGuards += 1
    if (dirtyGuards === 1) reportUnsavedChanges(true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      dirtyGuards -= 1
      if (dirtyGuards === 0) reportUnsavedChanges(false)
    }
  }, [unsaved])
}
