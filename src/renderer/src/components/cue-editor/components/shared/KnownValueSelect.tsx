import React, { useId } from 'react'
import { unlistedIssue } from '../../../../../../photonics-dmx/cues/node/cueValueRules'
import FieldIssue, { issueAttributes } from './FieldIssue'

interface KnownValueSelectProps {
  label: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
  /** A first entry standing for no value, such as "-- Select Event --". */
  placeholder?: string
}

/**
 * A labelled select over a fixed list. A stored value the list leaves out stays selected and is
 * flagged, so the field never shows the first option in place of what the file holds.
 */
const KnownValueSelect: React.FC<KnownValueSelectProps> = ({
  label,
  value,
  options,
  onChange,
  placeholder,
}) => {
  const issueId = useId()
  const listed = options.some((option) => option.value === value)
  const issue =
    placeholder !== undefined && value === ''
      ? null
      : unlistedIssue(
          value,
          options.map((option) => option.value),
        )
  return (
    <label className="flex flex-col font-medium">
      {label}
      <select
        aria-label={label}
        className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...issueAttributes(issue, issueId)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {!listed && value !== '' && (
          <option value={value} disabled>
            {value}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldIssue issue={issue} id={issueId} />
    </label>
  )
}

export default KnownValueSelect
