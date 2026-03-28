import { useState, useCallback, useRef, useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

export const useToast = () => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach(clearTimeout)
      timeoutIdsRef.current = []
    }
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const newToast: Toast = { id, message, type, duration }

    setToasts((prev) => [...prev, newToast])

    if (duration > 0) {
      const timeoutId = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
        timeoutIdsRef.current = timeoutIdsRef.current.filter((tid) => tid !== timeoutId)
      }, duration)
      timeoutIdsRef.current.push(timeoutId)
    }
  }, [])

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, showToast, hideToast }
}
