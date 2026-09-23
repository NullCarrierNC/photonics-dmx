import { useCallback } from 'react'
import { useStore } from 'jotai'
import { confirmRequestAtom, type ConfirmRequest } from '../atoms'

export type ConfirmOptions = Omit<ConfirmRequest, 'resolve'>

/**
 * Programmatic confirm dialog (single global instance via `confirmRequestAtom`, in the store
 * `ConfirmModalHost` reads).
 * Returns `false` if another confirm is already open.
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const store = useStore()
  return useCallback(
    (options: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        if (store.get(confirmRequestAtom) !== null) {
          resolve(false)
          return
        }
        store.set(confirmRequestAtom, {
          ...options,
          resolve,
        })
      })
    },
    [store],
  )
}
