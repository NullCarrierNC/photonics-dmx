import React, { useState } from 'react'

/**
 * Text and number entry that reports a value when the user has finished with it, not per keystroke.
 *
 * Two reasons this is not a plain controlled input.
 *
 * A committed value can reconfigure something expensive. The sender config panel persists the whole
 * preferences file and restarts a running Art-Net or sACN sender on every change it is told about,
 * so reporting once the user has finished makes a thirteen-character address one restart,
 * against the address they meant.
 *
 * A clamped value cannot be typed into. Clamping on the way through and feeding the result back as
 * the input's value means the first digit of a legal number lands outside the range and is replaced
 * before the second arrives, so with a floor of 10 the number 15 becomes 10, then 105, then 44.
 * Holding the raw text until commit is what lets the user type it.
 */

const INPUT_CLASS =
  'border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white'

interface DraftFieldBaseProps {
  'id'?: string
  'className'?: string
  'disabled'?: boolean
  'placeholder'?: string
  'aria-label'?: string
}

interface DraftTextFieldProps extends DraftFieldBaseProps {
  value: string
  onCommit: (value: string) => void
}

/** A text entry that reports on blur, or on Enter. */
export const DraftTextField: React.FC<DraftTextFieldProps> = ({
  value,
  onCommit,
  className,
  ...rest
}) => {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  // Whether the field is the one being typed in, which decides if an external change may replace
  // the draft. State rather than a ref, because the render below reads it.
  const [editing, setEditing] = useState(false)

  // Follow the committed value while the user is elsewhere, so an external change still shows.
  // Adjusted during render rather than in an effect, which is what keeps it to one pass.
  if (value !== seen) {
    setSeen(value)
    if (!editing) {
      setDraft(value)
    }
  }

  const commit = (): void => {
    setEditing(false)
    if (draft !== value) {
      onCommit(draft)
    }
  }

  return (
    <input
      type="text"
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
      className={className ?? INPUT_CLASS}
      {...rest}
    />
  )
}

interface DraftNumberFieldProps extends DraftFieldBaseProps {
  value: number
  min?: number
  max?: number
  step?: number
  /** Decimal places to keep. Whole numbers by default, since most of these are counts or channels. */
  decimals?: number
  /**
   * Report a value the field already held. Wanted where committing does something beyond storing a
   * number, e.g. restarting the controllers, so the user can ask for that again.
   */
  commitWhenUnchanged?: boolean
  /** Given the typed number, held inside min and max. */
  onCommit: (value: number) => void
}

/** Whole numbers unless the field asks for decimals, which the fractional audio fields do. */
function roundTo(value: number, decimals: number | undefined): number {
  if (decimals === undefined) {
    return Math.round(value)
  }
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** A number entry that clamps and reports when the user has finished, not as they type. */
export const DraftNumberField: React.FC<DraftNumberFieldProps> = ({
  value,
  min,
  max,
  step,
  decimals,
  commitWhenUnchanged = false,
  onCommit,
  className,
  ...rest
}) => {
  const [draft, setDraft] = useState(String(value))
  const [seen, setSeen] = useState(value)
  // Whether the field is the one being typed in, which decides if an external change may replace
  // the draft. State rather than a ref, because the render below reads it.
  const [editing, setEditing] = useState(false)

  if (value !== seen) {
    setSeen(value)
    if (!editing) {
      setDraft(String(value))
    }
  }

  const commit = (): void => {
    setEditing(false)
    const parsed = Number(draft)
    // An unreadable or empty entry means the user cleared it rather than chose something, so the
    // committed value stands and the field shows it again.
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const rounded = roundTo(parsed, decimals)
    const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, rounded))
    setDraft(String(clamped))
    if (clamped !== value || commitWhenUnchanged) {
      onCommit(clamped)
    }
  }

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
      className={className ?? INPUT_CLASS}
      {...rest}
    />
  )
}
