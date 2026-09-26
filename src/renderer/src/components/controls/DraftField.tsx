import React, { useState } from 'react'
import { useUncommittedDraft } from '../../hooks/useUnloadGuard'

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

/**
 * What a commit handler answers. False, now or once its promise settles, means the value was
 * refused, so the field shows the committed value again. A rejected promise counts as a refusal.
 */
export type CommitOutcome = boolean | void | Promise<boolean | void>

/**
 * Puts `committed` back in the field when the commit is refused, unless the user has typed
 * something else since.
 */
function revertIfRefused(
  outcome: CommitOutcome,
  shown: string,
  committed: string,
  setDraft: (update: (current: string) => string) => void,
): void {
  const revert = () => setDraft((current) => (current === shown ? committed : current))
  if (outcome === false) {
    revert()
  } else if (outcome instanceof Promise) {
    outcome.then((accepted) => {
      if (accepted === false) revert()
    }, revert)
  }
}

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
  onCommit: (value: string) => CommitOutcome
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
  // Whether the user has typed since the last commit, which decides if an external change may
  // replace the draft. A focused field left untyped follows it. It is state, since the render
  // below reads it.
  const [typed, setTyped] = useState(false)

  // Follow the committed value while the user is elsewhere, so an external change still shows.
  // Adjusted during render rather than in an effect, which is what keeps it to one pass.
  if (value !== seen) {
    setSeen(value)
    if (!typed) {
      setDraft(value)
    }
  }

  useUncommittedDraft(typed && draft !== value)

  const commit = (): void => {
    setTyped(false)
    if (draft !== value) {
      revertIfRefused(onCommit(draft), draft, value, setDraft)
    }
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => {
        setTyped(true)
        setDraft(e.target.value)
      }}
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

interface NumberEntryProps extends DraftFieldBaseProps {
  min?: number
  max?: number
  step?: number
  /** Decimal places to keep. Whole numbers by default, since most of these are counts or channels. */
  decimals?: number
  /**
   * Report a value the field already held when the user typed it. Wanted where committing does
   * something beyond storing a number, e.g. restarting the controllers, so the user can ask for
   * that again. A field only focused and left reports nothing.
   */
  commitWhenUnchanged?: boolean
}

interface DraftNumberFieldProps extends NumberEntryProps {
  value: number
  /** Given the typed number, held inside min and max. */
  onCommit: (value: number) => CommitOutcome
}

interface DraftOptionalNumberFieldProps extends NumberEntryProps {
  /** Undefined shows an empty field, and the setting it stands for is off. */
  value: number | undefined
  /** Given the typed number, held inside min and max, or undefined when the user empties it. */
  onCommit: (value: number | undefined) => CommitOutcome
}

/** Whole numbers unless the field asks for decimals, which the fractional audio fields do. */
function roundTo(value: number, decimals: number | undefined): number {
  if (decimals === undefined) {
    return Math.round(value)
  }
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const shownText = (value: number | undefined): string => (value === undefined ? '' : String(value))

/**
 * The entry both number fields share. `onEmpty` is what emptying the field commits, and without
 * one an empty field goes back to the committed value.
 */
const NumberDraftInput: React.FC<
  NumberEntryProps & {
    value: number | undefined
    onNumber: (value: number) => CommitOutcome
    onEmpty?: () => CommitOutcome
  }
> = ({
  value,
  min,
  max,
  step,
  decimals,
  commitWhenUnchanged = false,
  onNumber,
  onEmpty,
  className,
  ...rest
}) => {
  const [draft, setDraft] = useState(shownText(value))
  const [seen, setSeen] = useState(value)
  // Whether the user has typed since the last commit, which decides if an external change may
  // replace the draft. A focused field left untyped follows it. It is state, since the render
  // below reads it.
  const [typed, setTyped] = useState(false)

  if (value !== seen) {
    setSeen(value)
    if (!typed) {
      setDraft(shownText(value))
    }
  }

  // The number the draft commits as, or null for an entry that leaves the committed value standing.
  const resolveDraft = (): number | null => {
    const parsed = Number(draft)
    // An unreadable or empty entry means the user cleared it and chose nothing.
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      return null
    }
    return Math.max(min ?? -Infinity, Math.min(max ?? Infinity, roundTo(parsed, decimals)))
  }
  const pending = typed ? resolveDraft() : null
  // An emptied optional field commits as off, so it is unsaved while the setting is on.
  const clearing = typed && onEmpty !== undefined && draft.trim() === '' && value !== undefined
  useUncommittedDraft(clearing || (pending !== null && pending !== value))

  const commit = (): void => {
    const typedSinceCommit = typed
    setTyped(false)
    if (draft.trim() === '' && onEmpty) {
      if (value !== undefined) revertIfRefused(onEmpty(), '', shownText(value), setDraft)
      return
    }
    const clamped = resolveDraft()
    if (clamped === null) {
      setDraft(shownText(value))
      return
    }
    setDraft(String(clamped))
    if (clamped !== value || (commitWhenUnchanged && typedSinceCommit)) {
      revertIfRefused(onNumber(clamped), String(clamped), shownText(value), setDraft)
    }
  }

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        setTyped(true)
        setDraft(e.target.value)
      }}
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

/** A number entry that clamps and reports when the user has finished, not as they type. */
export const DraftNumberField: React.FC<DraftNumberFieldProps> = ({ onCommit, ...props }) => (
  <NumberDraftInput {...props} onNumber={onCommit} />
)

/** A {@link DraftNumberField} for a setting that is off when empty. */
export const DraftOptionalNumberField: React.FC<DraftOptionalNumberFieldProps> = ({
  onCommit,
  ...props
}) => <NumberDraftInput {...props} onNumber={onCommit} onEmpty={() => onCommit(undefined)} />
