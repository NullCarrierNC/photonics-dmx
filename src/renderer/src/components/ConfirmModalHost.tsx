import { useAtom } from 'jotai'
import { confirmRequestAtom } from '../atoms'
import ConfirmModal from './ConfirmModal'

/**
 * Renders a single app-wide `ConfirmModal` driven by `confirmRequestAtom`.
 */
export function ConfirmModalHost(): JSX.Element | null {
  const [request, setRequest] = useAtom(confirmRequestAtom)

  if (request == null) return null

  const { resolve, title, message, confirmLabel, cancelLabel, danger } = request

  const close = (ok: boolean) => {
    setRequest(null)
    resolve(ok)
  }

  return (
    <ConfirmModal
      isOpen
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      danger={danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  )
}

export default ConfirmModalHost
