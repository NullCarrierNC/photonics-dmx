import React from 'react'
import { useAudioConfigFields } from '../hooks/useAudioConfigFields'
import { useCommitOnRelease } from '../hooks/useCommitOnRelease'
import { SaveErrorAlert } from './controls/SaveErrorAlert'

const AudioStrobeSettings: React.FC = () => {
  const audio = useAudioConfigFields({
    strobeEnabled: false,
    strobeTriggerThreshold: 0.8,
    strobeProbability: 100,
  })
  const { strobeEnabled, strobeTriggerThreshold, strobeProbability } = audio.values
  const commit = (): void => void audio.commit()
  const thresholdRelease = useCommitOnRelease(commit)
  const probabilityRelease = useCommitOnRelease(commit)

  const thresholdRangeStyle = {
    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${strobeTriggerThreshold * 100}%, #e5e7eb ${strobeTriggerThreshold * 100}%, #e5e7eb 100%)`,
  } as const

  const probabilityRangeStyle = {
    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${strobeProbability}%, #e5e7eb ${strobeProbability}%, #e5e7eb 100%)`,
  } as const

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
        <div className="space-y-1">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Strobe trigger threshold
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Normalised total energy (0-1) above which the strobe can activate. (Higher is louder)
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              style={thresholdRangeStyle}
              value={strobeTriggerThreshold}
              disabled={strobeControlsDisabled}
              onChange={(e) => {
                audio.set({ strobeTriggerThreshold: Number(e.target.value) })
                thresholdRelease.changed()
              }}
              {...thresholdRelease.props}
            />
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={strobeTriggerThreshold}
              disabled={strobeControlsDisabled}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                if (Number.isFinite(value)) {
                  audio.set({ strobeTriggerThreshold: Math.max(0, Math.min(1, value)) })
                }
              }}
              onBlur={commit}
              className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
              aria-label="Strobe trigger threshold numeric"
            />
          </div>
        </div>

        <div className="space-y-1 mt-3">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Strobe probability
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              When the threshold is exceeded, this is the chance the strobe actually fires.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              style={probabilityRangeStyle}
              value={strobeProbability}
              disabled={strobeControlsDisabled}
              onChange={(e) => {
                audio.set({ strobeProbability: Number(e.target.value) })
                probabilityRelease.changed()
              }}
              {...probabilityRelease.props}
            />
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={strobeProbability}
              disabled={strobeControlsDisabled}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                if (Number.isFinite(value)) {
                  audio.set({ strobeProbability: Math.max(0, Math.min(100, Math.round(value))) })
                }
              }}
              onBlur={commit}
              className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
              aria-label="Strobe probability percent"
            />
          </div>
        </div>
      </div>
      <SaveErrorAlert message={audio.saveError} />
    </div>
  )
}

export default AudioStrobeSettings
