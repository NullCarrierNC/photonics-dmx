/**
 * The three field shapes the cue consistency panel repeats: a mode select, a percentage slider and
 * a bounded number entry. Each is label, control and help text, and each reports a change only.
 * Saving, and putting a value back when a save is refused, stays with the panel.
 */
import React from 'react'
import { DraftNumberField } from '../controls/DraftField'
import { useCommitOnRelease } from '../../hooks/useCommitOnRelease'

const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'
const HELP_CLASS = 'text-xs text-gray-500 dark:text-gray-400 mt-2'
const INPUT_CLASS =
  'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'

export interface SelectionModeOption {
  value: string
  label: string
}

interface SelectionModeFieldProps {
  id: string
  label: string
  value: string
  options: SelectionModeOption[]
  help: React.ReactNode
  disabled: boolean
  onChange: (value: string) => void
}

/** A mode select. A value the options do not offer is ignored rather than reported. */
export const SelectionModeField: React.FC<SelectionModeFieldProps> = ({
  id,
  label,
  value,
  options,
  help,
  disabled,
  onChange,
}) => (
  <div>
    <label htmlFor={id} className={LABEL_CLASS}>
      {label}
    </label>
    <select
      id={id}
      value={value}
      onChange={(event) => {
        const chosen = event.target.value
        if (options.some((option) => option.value === chosen)) {
          onChange(chosen)
        }
      }}
      className={`block w-full max-w-xs ${INPUT_CLASS}`}
      disabled={disabled}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <p className={HELP_CLASS}>{help}</p>
  </div>
)

interface ProbabilitySliderProps {
  id: string
  label: string
  value: number
  help: React.ReactNode
  disabled: boolean
  onChange: (percent: number) => void
  /** Called when the drag ends, so a run of positions becomes one save. */
  onCommit: () => void
}

export const ProbabilitySlider: React.FC<ProbabilitySliderProps> = ({
  id,
  label,
  value,
  help,
  disabled,
  onChange,
  onCommit,
}) => {
  const release = useCommitOnRelease(onCommit)
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div className="flex items-center space-x-4">
        <input
          type="range"
          id={id}
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(event) => {
            onChange(parseInt(event.target.value, 10))
            release.changed()
          }}
          {...release.props}
          className="flex-1 max-w-xs accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
        />
        <span className="text-sm text-gray-700 dark:text-gray-300 w-12 text-right tabular-nums">
          {value}%
        </span>
      </div>
      <p className={HELP_CLASS}>{help}</p>
    </div>
  )
}

interface BoundedNumberFieldProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  placeholder: string
  help: React.ReactNode
  disabled: boolean
  /** Given the typed number, held inside min and max. */
  onCommit: (value: number) => void
}

/** A number entry held inside its range, saved when the user has finished with it. */
export const BoundedNumberField: React.FC<BoundedNumberFieldProps> = ({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  placeholder,
  help,
  disabled,
  onCommit,
}) => (
  <div>
    <label htmlFor={id} className={LABEL_CLASS}>
      {label}
    </label>
    <div className="flex items-center space-x-4">
      <DraftNumberField
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        onCommit={onCommit}
        className={`w-32 ${INPUT_CLASS}`}
        disabled={disabled}
        placeholder={placeholder}
      />
      <span className="text-sm text-gray-600 dark:text-gray-400">{unit}</span>
    </div>
    <p className={HELP_CLASS}>{help}</p>
  </div>
)
