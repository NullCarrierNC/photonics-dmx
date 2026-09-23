import { useEffect } from 'react'

/**
 * While `dirty`, the page refuses to unload, so closing or reloading its window brings up main's
 * Leave or Stay prompt.
 */
export function useUnloadGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}
