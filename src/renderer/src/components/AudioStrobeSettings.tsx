import React from 'react'
import { useAudioConfigFields } from '../hooks/useAudioConfigFields'
import { LevelRow } from './controls/LevelRow'
import { SaveErrorAlert } from './controls/SaveErrorAlert'

const AudioStrobeSettings: React.FC = () => {
  const audio = useAudioConfigFields({
    strobeEnabled: false,
    strobeTriggerThreshold: 0.8,
    strobeProbability: 100,
  })
  const { strobeEnabled, strobeTriggerThreshold, strobeProbability } = audio.values

  // The controls stay live while a save is in flight, so keyboard focus stays on a slider.
  const busy = !audio.loaded
  const strobeControlsDisabled = busy || !strobeEnabled

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        When enabled, a strobe cue can run when the total audio energy exceeds the threshold. Use
        probability to reduce how often it fires.
      </p>
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="form-checkbox h-5 w-5 rounded text-blue-600"
            checked={strobeEnabled}
            disabled={busy}
            onChange={(e) => void audio.save({ strobeEnabled: e.target.checked })}
          />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Strobe enabled
          </span>
        </label>
      </div>

      <div className={strobeControlsDisabled ? 'opacity-60' : undefined}>
        <LevelRow
          label="Strobe trigger threshold"
          help="Normalised total energy (0-1) above which the strobe can activate. (Higher is louder)"
          numberLabel="Strobe trigger threshold numeric"
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          value={strobeTriggerThreshold}
          fillPercent={strobeTriggerThreshold * 100}
          disabled={strobeControlsDisabled}
          compact={false}
          onSlide={(value) => audio.set({ strobeTriggerThreshold: value })}
          onCommit={(value) => void audio.save({ strobeTriggerThreshold: value })}
        />
        <div className="mt-3">
          <LevelRow
            label="Strobe probability"
            help="When the threshold is exceeded, this is the chance the strobe actually fires."
            numberLabel="Strobe probability percent"
            min={0}
            max={100}
            step={1}
            value={strobeProbability}
            fillPercent={strobeProbability}
            disabled={strobeControlsDisabled}
            compact={false}
            onSlide={(value) => audio.set({ strobeProbability: value })}
            onCommit={(value) => void audio.save({ strobeProbability: value })}
          />
        </div>
      </div>
      <SaveErrorAlert message={audio.saveError} />
    </div>
  )
}

export default AudioStrobeSettings
