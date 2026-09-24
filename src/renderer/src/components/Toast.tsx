import React, { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { toastsAtom, useToast, type Toast } from '../hooks/useToast'

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto
            px-4 py-3 rounded-lg shadow-lg
            flex items-center gap-2
            animate-slideIn
            ${toast.type === 'success' ? 'bg-green-500 text-white' : ''}
            ${toast.type === 'error' ? 'bg-red-500 text-white' : ''}
            ${toast.type === 'warning' ? 'bg-amber-500 text-white' : ''}
            ${toast.type === 'info' ? 'bg-blue-500 text-white' : ''}
          `}>
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="ml-2 text-white/80 hover:text-white"
            aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

/** Hides one toast once its time is up, counted from when it arrived. */
const ToastExpiry: React.FC<{ toast: Toast; onExpire: (id: string) => void }> = ({
  toast,
  onExpire,
}) => {
  const { id, duration = 0 } = toast
  useEffect(() => {
    if (duration <= 0) return
    const timer = setTimeout(() => onExpire(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, onExpire])
  return null
}

/**
 * The one toast stack a window shows, fed by every useToast in that window. Rendered once, by
 * WindowShell, so toasts from two places stack in one live region.
 */
export const ToastStack: React.FC = () => {
  const toasts = useAtomValue(toastsAtom)
  const { hideToast } = useToast()
  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={hideToast} />
      {toasts.map((toast) => (
        <ToastExpiry key={toast.id} toast={toast} onExpire={hideToast} />
      ))}
    </>
  )
}

export default ToastContainer
