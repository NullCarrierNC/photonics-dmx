import React from 'react'
import { useAudioConfigFields } from '../hooks/useAudioConfigFields'
import { COMPACT_LABEL_CLASS, LevelRow } from './controls/LevelRow'
import { SaveErrorAlert } from './controls/SaveErrorAlert'

interface AudioSensitivityControlsProps {
  /** Omit long helper copy (e.g. DMX Preview quick controls). */
  compact?: boolean
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
    return (
      <div className="space-y-4">
        {levels}
        <SaveErrorAlert message={audio.saveError} />
      </div>
    )
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
      <SaveErrorAlert message={audio.saveError} />
    </div>
  )
}

export default AudioSensitivityControls
