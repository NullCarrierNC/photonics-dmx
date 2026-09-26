import React from 'react'

export interface ToggleSwitchProps {
  label: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
  /** Smaller label and switch, for inline rows such as the calibration wizard. */
  compact?: boolean
}

/**
 * The sliding on/off switch used across the settings surfaces.
 *
 * The output sender and game listener switches draw from here, so the colour animation and the
 * label spacing match where they share a row. The audio, smoothing and cue editor toolbar switches
 * draw their own.
 */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  label,
  checked,
  onToggle,
  disabled = false,
  compact = false,
}) => (
  <div
    className={
      compact
        ? 'flex items-center gap-2 justify-between'
        : 'flex items-center gap-4 justify-between'
    }>
    <label
      className={`${compact ? 'text-sm font-medium' : 'text-lg font-semibold'} ${
        disabled ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
      }`}>
      {label}
    </label>
    <button
      type="button"
      role="switch"
      onClick={onToggle}
      disabled={disabled}
      aria-checked={checked}
      aria-label={label}
      className={`${compact ? 'w-9 h-5' : 'w-12 h-6'} rounded-full transition-colors ${
        checked ? 'bg-green-500' : 'bg-gray-400'
      } relative focus:outline-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <div
        className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} bg-white rounded-full shadow-md transform transition-transform duration-200 ${
          checked ? (compact ? 'translate-x-4' : 'translate-x-6') : 'translate-x-0'
        }`}></div>
    </button>
  </div>
)
