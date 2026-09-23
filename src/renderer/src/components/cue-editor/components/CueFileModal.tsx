import React, { useId } from 'react'
import Modal from '../../Modal'

const INPUT_CLASS = 'w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-sm'
const INPUT_BORDER = 'border-gray-300 dark:border-gray-600'
const INPUT_BORDER_INVALID = 'border-red-500 dark:border-red-500'

/** Whether `groupId` is already used, compared the way the files store it. */
export function isGroupIdTaken(groupId: string, existingGroupIds: ReadonlySet<string>): boolean {
  const normalized = groupId.trim().toLowerCase()
  return normalized.length > 0 && existingGroupIds.has(normalized)
}

interface CueFileModalProps {
  title: string
  /** The primary button's label. */
  actionLabel: string
  /** Whether the form can be submitted, by the button or by Cmd+Enter. */
  canSubmit: boolean
  onSubmit: () => void
  onCancel: () => void
  children: React.ReactNode
}

/**
 * The frame the cue-file dialogs share: the title, the form, and Cancel beside a primary button
 * that stays disabled, and ignores Cmd+Enter, until the form is complete.
 */
export const CueFileModal: React.FC<CueFileModalProps> = ({
  title,
  actionLabel,
  canSubmit,
  onSubmit,
  onCancel,
  children,
}) => {
  const titleId = useId()
  const submit = () => {
    if (canSubmit) onSubmit()
  }
  return (
    <Modal
      onClose={onCancel}
      labelledBy={titleId}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.metaKey) submit()
      }}
      panelClassName="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[500px] max-w-[90vw]">
      <h2 id={titleId} className="text-lg font-bold mb-4">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
      <div className="flex justify-end gap-2 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
          {actionLabel}
        </button>
      </div>
    </Modal>
  )
}

interface FieldProps {
  label: string
  required?: boolean
  /** Shown under the field, in red when `error` is set in its place. */
  hint?: React.ReactNode
  error?: React.ReactNode
  children: (inputProps: {
    'id': string
    'className': string
    'aria-invalid'?: boolean
  }) => React.ReactNode
}

/**
 * One labelled field of a cue-file dialog, with its hint or, when something is wrong, its error.
 */
export const CueFileField: React.FC<FieldProps> = ({ label, required, hint, error, children }) => {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children({
        id,
        'className': `${INPUT_CLASS} ${error ? INPUT_BORDER_INVALID : INPUT_BORDER}`,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
      ) : (
        hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>
      )}
    </div>
  )
}

interface GroupIdFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  taken: boolean
  /** "cue" or "effect", for the message when the ID is taken. */
  fileKind: string
  mode: string
  hint: React.ReactNode
  autoFocus?: boolean
}

/** The group ID field both dialogs ask for, which names the file's group in the registry. */
export const GroupIdField: React.FC<GroupIdFieldProps> = ({
  label,
  value,
  onChange,
  taken,
  fileKind,
  mode,
  hint,
  autoFocus,
}) => (
  <CueFileField
    label={label}
    required
    hint={hint}
    error={
      taken &&
      `This group ID is already used by another ${fileKind} file in ${mode.toUpperCase()} mode. Choose a different ID.`
    }>
    {(inputProps) => (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoFocus={autoFocus}
        {...inputProps}
      />
    )}
  </CueFileField>
)
