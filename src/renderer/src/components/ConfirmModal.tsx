import { useId, type FC, type ReactNode } from 'react'
import Modal from './Modal'

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

/** A yes or no question that interrupts the user, most often before something is deleted or discarded. */
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
  const titleId = useId()

  if (!isOpen) return null

  return (
    <Modal
      role="alertdialog"
      labelledBy={titleId}
      onClose={onCancel}
      panelClassName="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl text-center max-w-md mx-4">
      <h2 id={titleId} className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
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
    </Modal>
  )
}

export default ConfirmModal
