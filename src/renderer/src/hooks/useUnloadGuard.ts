import { useEffect } from 'react'
import { reportUnsavedChanges } from '../ipcApi'

/** How many guards on this page hold unsaved changes, so the page reports one answer for all. */
let dirtyGuards = 0

/**
 * While `dirty`, the page refuses to unload, so closing or reloading its window brings up main's
 * Leave or Stay prompt, and main knows to ask about the page before a Quit closes any window.
 */
export function useUnloadGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
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
  }, [dirty])
}
