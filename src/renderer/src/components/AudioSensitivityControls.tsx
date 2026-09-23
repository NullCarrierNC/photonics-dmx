import React, { useId } from 'react'
import { useAudioConfigFields } from '../hooks/useAudioConfigFields'
import { useCommitOnRelease } from '../hooks/useCommitOnRelease'
import { DraftNumberField } from './controls/DraftField'

interface AudioSensitivityControlsProps {
  /** Omit long helper copy (e.g. DMX Preview quick controls). */
  compact?: boolean
}

/** The blue fill up to `percent` that shows where a slider sits. */
const filledTo = (percent: number): React.CSSProperties => ({
  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${percent}%, #e5e7eb ${percent}%, #e5e7eb 100%)`,
})

const COMPACT_LABEL_CLASS =
  'text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0 whitespace-nowrap'
const COMPACT_RANGE_CLASS =
  'flex-1 min-w-0 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider disabled:cursor-not-allowed'
const COMPACT_NUMBER_CLASS =
  'w-16 shrink-0 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center'
const FULL_RANGE_CLASS =
  'flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider'
const FULL_NUMBER_CLASS =
  'w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center'

interface LevelRowProps {
  label: string
  /** Shown under the label in the full-size layout. */
  help?: string
  /** Names the number box beside the slider. */
  numberLabel: string
  min: number
  max: number
  step: number
  /** Decimal places the number box keeps. Whole numbers when omitted. */
  decimals?: number
  value: number
  /** Where the slider's fill ends, 0 to 100. */
  fillPercent: number
  disabled: boolean
  compact: boolean
  /** The slider moved. Nothing is stored until `onCommit`. */
  onSlide: (value: number) => void
  /** The user let go of the slider, or left the number box having typed a new value. */
  onCommit: (value: number) => void
}

/** One level: a labelled slider and the number box beside it, which set the same value. */
const LevelRow: React.FC<LevelRowProps> = ({
  label,
  help,
  numberLabel,
  min,
  max,
  step,
  decimals,
  value,
  fillPercent,
  disabled,
  compact,
  onSlide,
  onCommit,
}) => {
  const id = useId()
  const release = useCommitOnRelease((input) => onCommit(Number(input.value)))
  const labelElement = (
    <label
      htmlFor={id}
      className={
        compact ? COMPACT_LABEL_CLASS : 'text-sm font-medium text-gray-700 dark:text-gray-300'
      }>
      {label}
    </label>
  )
  const controls = (
    <>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          onSlide(Number(e.target.value))
          release.changed()
        }}
        {...release.props}
        disabled={disabled}
        className={compact ? COMPACT_RANGE_CLASS : FULL_RANGE_CLASS}
        style={filledTo(fillPercent)}
      />
      <DraftNumberField
        min={min}
        max={max}
        step={step}
        decimals={decimals}
        value={value}
        onCommit={onCommit}
        disabled={disabled}
        className={compact ? COMPACT_NUMBER_CLASS : FULL_NUMBER_CLASS}
        aria-label={numberLabel}
      />
    </>
  )

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
        {labelElement}
        {controls}
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <div>
        {labelElement}
        {help && <p className="text-xs text-gray-500 dark:text-gray-400">{help}</p>}
      </div>
      <div className="flex items-center space-x-4">{controls}</div>
    </div>
  )
}

const AudioSensitivityControls: React.FC<AudioSensitivityControlsProps> = ({ compact = false }) => {
  const audio = useAudioConfigFields({
    sensitivity: 2.5,
    noiseFloor: 60,
    strobeEnabled: false,
    strobeTriggerThreshold: 0.8,
    strobeProbability: 100,
  })
  const { sensitivity, noiseFloor, strobeEnabled, strobeTriggerThreshold, strobeProbability } =
    audio.values

  // A slider stays live while a save is in flight, so keyboard focus stays on it.
  const controlsDisabled = !audio.loaded
  const strobeControlsDisabled = controlsDisabled || !strobeEnabled

  const levels = (
    <>
      <LevelRow
        label="Global Gain"
        help="Adjust the global sensitivity. This is applied to all frequency bands."
        numberLabel="Global sensitivity numeric"
        min={0.1}
        max={5.0}
        step={0.1}
        decimals={2}
        value={sensitivity}
        fillPercent={((sensitivity - 0.1) / (5.0 - 0.1)) * 100}
        disabled={controlsDisabled}
        compact={compact}
        onSlide={(value) => audio.set({ sensitivity: value })}
        onCommit={(value) => void audio.save({ sensitivity: value })}
      />
      <LevelRow
        label="Noise Floor"
        help="Audio signal below this level is treated as silence. Increase to filter out background noise."
        numberLabel="Noise floor numeric"
        min={0}
        max={255}
        step={1}
        value={noiseFloor}
        fillPercent={(noiseFloor / 255) * 100}
        disabled={controlsDisabled}
        compact={compact}
        onSlide={(value) => audio.set({ noiseFloor: value })}
        onCommit={(value) => void audio.save({ noiseFloor: value })}
      />
    </>
  )

  if (!compact) {
    return <div className="space-y-4">{levels}</div>
  }

  return (
    <div className="space-y-3">
      {levels}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
        <span className={COMPACT_LABEL_CLASS}>Strobe</span>
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 rounded text-blue-600 shrink-0"
          checked={strobeEnabled}
          disabled={controlsDisabled}
          onChange={(e) => {
            void audio.save({ strobeEnabled: e.target.checked })
          }}
          aria-label="Strobe"
        />
      </div>

      <div className={strobeControlsDisabled ? 'space-y-3 opacity-60' : 'space-y-3'}>
        <LevelRow
          label="Threshold"
          numberLabel="Strobe threshold numeric"
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          value={strobeTriggerThreshold}
          fillPercent={strobeTriggerThreshold * 100}
          disabled={strobeControlsDisabled}
          compact
          onSlide={(value) => audio.set({ strobeTriggerThreshold: value })}
          onCommit={(value) => void audio.save({ strobeTriggerThreshold: value })}
        />
        <LevelRow
          label="Strobe prob."
          numberLabel="Strobe probability percent"
          min={0}
          max={100}
          step={1}
          value={strobeProbability}
          fillPercent={strobeProbability}
          disabled={strobeControlsDisabled}
          compact
          onSlide={(value) => audio.set({ strobeProbability: value })}
          onCommit={(value) => void audio.save({ strobeProbability: value })}
        />
      </div>
    </div>
  )
}

export default AudioSensitivityControls
