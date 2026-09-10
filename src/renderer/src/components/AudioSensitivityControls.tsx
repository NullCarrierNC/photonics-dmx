import React from 'react'
import { useAudioConfigFields } from '../hooks/useAudioConfigFields'

interface AudioSensitivityControlsProps {
  /** Omit long helper copy (e.g. DMX Preview quick controls). */
  compact?: boolean
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

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

  // The sliders carry their own bounds, the numeric boxes do not, so a commit clamps.
  const commitSensitivity = (): void => {
    void audio.save({ sensitivity: clamp(sensitivity, 0.1, 5.0) })
  }

  const commitNoiseFloor = (): void => {
    void audio.save({ noiseFloor: clamp(noiseFloor, 0, 255) })
  }

  const commitStrobe = (): void => void audio.commit()

  const sensitivityRangeStyle = {
    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((sensitivity - 0.1) / (5.0 - 0.1)) * 100}%, #e5e7eb ${((sensitivity - 0.1) / (5.0 - 0.1)) * 100}%, #e5e7eb 100%)`,
  } as const

  const noiseFloorRangeStyle = {
    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(noiseFloor / 255) * 100}%, #e5e7eb ${(noiseFloor / 255) * 100}%, #e5e7eb 100%)`,
  } as const

  const strobeTriggerRangeStyle = {
    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${strobeTriggerThreshold * 100}%, #e5e7eb ${strobeTriggerThreshold * 100}%, #e5e7eb 100%)`,
  } as const

  const strobeProbabilityRangeStyle = {
    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${strobeProbability}%, #e5e7eb ${strobeProbability}%, #e5e7eb 100%)`,
  } as const

  const controlsDisabled = !audio.loaded || audio.isSaving
  const strobeControlsDisabled = controlsDisabled || !strobeEnabled

  const rangeClassName =
    'flex-1 min-w-0 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider'
  const compactStrobeRangeClassName = `${rangeClassName} disabled:cursor-not-allowed`
  const numberClassName =
    'w-16 shrink-0 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center'

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <label
            htmlFor="audio-compact-sensitivity"
            className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0 whitespace-nowrap">
            Global Gain
          </label>
          <input
            id="audio-compact-sensitivity"
            type="range"
            min="0.1"
            max="5.0"
            step="0.1"
            value={sensitivity}
            onChange={(e) => audio.set({ sensitivity: parseFloat(e.target.value) })}
            onMouseUp={commitSensitivity}
            disabled={controlsDisabled}
            className={rangeClassName}
            style={sensitivityRangeStyle}
          />

          <input
            type="number"
            min="0.1"
            max="5.0"
            step="0.1"
            value={sensitivity}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0.1
              audio.set({ sensitivity: clamp(value, 0.1, 5.0) })
            }}
            onBlur={commitSensitivity}
            disabled={controlsDisabled}
            className={numberClassName}
            aria-label="Global sensitivity numeric"
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <label
            htmlFor="audio-compact-noise-floor"
            className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0 whitespace-nowrap">
            Noise Floor
          </label>
          <input
            id="audio-compact-noise-floor"
            type="range"
            min="0"
            max="255"
            step="1"
            value={noiseFloor}
            onChange={(e) => audio.set({ noiseFloor: parseFloat(e.target.value) })}
            onMouseUp={commitNoiseFloor}
            disabled={controlsDisabled}
            className={rangeClassName}
            style={noiseFloorRangeStyle}
          />

          <input
            type="number"
            min="0"
            max="255"
            step="1"
            value={noiseFloor}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0
              audio.set({ noiseFloor: clamp(value, 0, 255) })
            }}
            onBlur={commitNoiseFloor}
            disabled={controlsDisabled}
            className={numberClassName}
            aria-label="Noise floor numeric"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0 whitespace-nowrap">
            Strobe
          </span>
          <input
            type="checkbox"
            id="audio-compact-strobe-enabled"
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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
            <label
              htmlFor="audio-compact-strobe-threshold"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0 whitespace-nowrap">
              Threshold
            </label>
            <input
              id="audio-compact-strobe-threshold"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={strobeTriggerThreshold}
              onChange={(e) => audio.set({ strobeTriggerThreshold: Number(e.target.value) })}
              onMouseUp={commitStrobe}
              onTouchEnd={commitStrobe}
              disabled={strobeControlsDisabled}
              className={compactStrobeRangeClassName}
              style={strobeTriggerRangeStyle}
            />

            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={strobeTriggerThreshold}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                if (Number.isFinite(value)) {
                  audio.set({ strobeTriggerThreshold: clamp(value, 0, 1) })
                }
              }}
              onBlur={commitStrobe}
              disabled={strobeControlsDisabled}
              className={numberClassName}
              aria-label="Strobe threshold numeric"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0 whitespace-nowrap">
              Strobe prob.
            </span>
            <input
              id="audio-compact-strobe-probability"
              type="range"
              min={0}
              max={100}
              step={1}
              value={strobeProbability}
              onChange={(e) => audio.set({ strobeProbability: Number(e.target.value) })}
              onMouseUp={commitStrobe}
              onTouchEnd={commitStrobe}
              disabled={strobeControlsDisabled}
              className={compactStrobeRangeClassName}
              style={strobeProbabilityRangeStyle}
            />
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={strobeProbability}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                if (Number.isFinite(value)) {
                  audio.set({ strobeProbability: clamp(Math.round(value), 0, 100) })
                }
              }}
              onBlur={commitStrobe}
              disabled={strobeControlsDisabled}
              className={numberClassName}
              aria-label="Strobe probability percent"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Global Gain
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Adjust the global sensitivity. This is applied to all frequency bands.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <input
            type="range"
            min="0.1"
            max="5.0"
            step="0.1"
            value={sensitivity}
            onChange={(e) => audio.set({ sensitivity: parseFloat(e.target.value) })}
            onMouseUp={commitSensitivity}
            disabled={controlsDisabled}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={sensitivityRangeStyle}
          />

          <input
            type="number"
            min="0.1"
            max="5.0"
            step="0.1"
            value={sensitivity}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0.1
              audio.set({ sensitivity: clamp(value, 0.1, 5.0) })
            }}
            onBlur={commitSensitivity}
            disabled={controlsDisabled}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
          />
        </div>
      </div>

      {/* Noise Floor */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Noise Floor
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Audio signal below this level is treated as silence. Increase to filter out background
              noise.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <input
            type="range"
            min="0"
            max="255"
            step="1"
            value={noiseFloor}
            onChange={(e) => audio.set({ noiseFloor: parseFloat(e.target.value) })}
            onMouseUp={commitNoiseFloor}
            disabled={controlsDisabled}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={noiseFloorRangeStyle}
          />

          <input
            type="number"
            min="0"
            max="255"
            step="1"
            value={noiseFloor}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0
              audio.set({ noiseFloor: clamp(value, 0, 255) })
            }}
            onBlur={commitNoiseFloor}
            disabled={controlsDisabled}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
          />
        </div>
      </div>
    </div>
  )
}

export default AudioSensitivityControls
