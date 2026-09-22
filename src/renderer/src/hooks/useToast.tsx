import { useCallback } from 'react'
import { atom, useSetAtom } from 'jotai'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

/** Every toast a window is showing, in arrival order. The window's one ToastStack renders them. */
export const toastsAtom = atom<Toast[]>([])

/** Shows and hides toasts in the window's one stack. */
export const useToast = () => {
  const setToasts = useSetAtom(toastsAtom)

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3000) => {
      const id = `toast-${Date.now()}-${Math.random()}`
      setToasts((prev) => [...prev, { id, message, type, duration }])
    },
    [setToasts],
  )

  const hideToast = useCallback(
    (id: string) => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    },
    [setToasts],
  )

  return { showToast, hideToast }
}
