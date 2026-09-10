import { useEffect, useRef, type FC, type ReactNode } from 'react'

export interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: ReactNode
  /** @default "Confirm" */
  confirmLabel?: string
  /** @default "Cancel" */
  cancelLabel?: string
  /** Red primary button for destructive actions. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const ConfirmModal: FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    // Where focus was before the dialog took it, so it goes back to the control that opened it.
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      opener?.focus?.()
    }
  }, [isOpen])

  if (!isOpen) return null

  /** The panel's focusable controls, in tab order. */
  const focusable = (): HTMLElement[] =>
    Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])

  /**
   * Escape cancels, and Tab stays inside the dialog.
   *
   * Enter is deliberately not bound. Every caller of this dialog is destructive, and a handler on
   * the panel sees Enter from whichever control has focus, so binding it made Enter on Cancel
   * confirm the deletion instead.
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
      return
    }
    if (e.key !== 'Tab') {
      return
    }
    const controls = focusable()
    if (controls.length === 0) {
      return
    }
    const first = controls[0]
    const last = controls[controls.length - 1]
    const onEdge = e.shiftKey ? document.activeElement === first : document.activeElement === last
    if (!onEdge && document.activeElement !== panelRef.current) {
      return
    }
    e.preventDefault()
    ;(e.shiftKey ? last : first).focus()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onCancel}
      role="presentation">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        tabIndex={-1}
        className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl text-center max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}>
        <h2
          id="confirm-modal-title"
          className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        <div className="mb-6 text-gray-700 dark:text-gray-300 text-sm">{message}</div>
        <div className="flex justify-center space-x-4">
          <button
            type="button"
            onClick={onConfirm}
            className={
              danger
                ? 'px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600'
                : 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600'
            }>
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
