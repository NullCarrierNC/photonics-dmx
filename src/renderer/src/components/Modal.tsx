import { useEffect, useRef, useState, type FC, type KeyboardEvent, type ReactNode } from 'react'

const BACKDROP = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50'

/** The controls Tab can land on. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  /** Escape and, unless turned off, a click on the backdrop. */
  onClose: () => void
  /** Id of the element that titles the dialog. */
  labelledBy?: string
  /** `alertdialog` for a question that interrupts what the user was doing. */
  role?: 'dialog' | 'alertdialog'
  /** The panel's own look: width, padding and scrolling. */
  panelClassName: string
  /** Extra classes for the backdrop, such as padding that keeps a tall panel off the window edge. */
  backdropClassName?: string
  /** Turn off for a form whose typed input a stray click should not throw away. */
  closeOnBackdrop?: boolean
  /** Keys the dialog handles itself. Runs before Escape and Tab, and claims a key with preventDefault. */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  children: ReactNode
}

/**
 * The overlay a dialog sits in. It takes focus as it opens unless a control inside already has it,
 * keeps Tab inside the panel, closes on Escape, and gives focus back to whatever opened it when it
 * goes. Enter is left to the controls, so it activates whichever one has focus.
 */
const Modal: FC<ModalProps> = ({
  onClose,
  labelledBy,
  role = 'dialog',
  panelClassName,
  backdropClassName,
  closeOnBackdrop = true,
  onKeyDown,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null)
  // Read during the first render, before an autoFocus control in the panel can take focus.
  const [opener] = useState(() => document.activeElement as HTMLElement | null)

  useEffect(() => {
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) {
      panel.focus()
    }
    return () => {
      opener?.focus?.()
    }
  }, [opener])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) {
      return
    }
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') {
      return
    }
    const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (controls.length === 0) {
      event.preventDefault()
      return
    }
    const first = controls[0]
    const last = controls[controls.length - 1]
    const active = document.activeElement
    const onEdge = event.shiftKey ? active === first : active === last
    if (!onEdge && active !== panelRef.current) {
      return
    }
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }

  return (
    <div
      className={backdropClassName ? `${BACKDROP} ${backdropClassName}` : BACKDROP}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation">
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={panelClassName}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}>
        {children}
      </div>
    </div>
  )
}

export default Modal
