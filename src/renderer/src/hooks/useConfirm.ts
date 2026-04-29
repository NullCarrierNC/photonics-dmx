import { useCallback } from 'react'
import { getDefaultStore } from 'jotai'
import { confirmRequestAtom, type ConfirmRequest } from '../atoms'

export type ConfirmOptions = Omit<ConfirmRequest, 'resolve'>

/**
 * Programmatic confirm dialog (single global instance via `confirmRequestAtom`).
 * Returns `false` if another confirm is already open.
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  return useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const store = getDefaultStore()
      if (store.get(confirmRequestAtom) !== null) {
        resolve(false)
        return
      }
      store.set(confirmRequestAtom, {
        ...options,
        resolve,
      })
    })
  }, [])
}
