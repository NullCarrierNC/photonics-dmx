import React, { useState, useEffect } from 'react'
import type { AudioConfig } from '../../../shared/ipcTypes'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'

interface AudioSensitivityControlsProps {
  /** Omit long helper copy (e.g. DMX Preview quick controls). */
  compact?: boolean
}

const AudioSensitivityControls: React.FC<AudioSensitivityControlsProps> = ({ compact = false }) => {
  const [sensitivity, setSensitivity] = useState(2.5)
  const [noiseFloor, setNoiseFloor] = useState(60)
  const [strobeEnabled, setStrobeEnabled] = useState(false)
  const [strobeTriggerThreshold, setStrobeTriggerThreshold] = useState(0.8)
  const [strobeProbability, setStrobeProbability] = useState(100)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getAudioConfig()
        setSensitivity(config?.sensitivity ?? 2.5)
        setNoiseFloor(config?.noiseFloor ?? 60)
        setStrobeEnabled(config?.strobeEnabled ?? false)
        setStrobeTriggerThreshold(config?.strobeTriggerThreshold ?? 0.8)
        setStrobeProbability(config?.strobeProbability ?? 100)
      } catch (error) {
        console.error('Failed to load audio sensitivity:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [])

  useEffect(() => {
    const onConfigUpdate = (config: AudioConfig | undefined) => {
      if (!config) return
      setSensitivity(config.sensitivity ?? 2.5)
      setNoiseFloor(config.noiseFloor ?? 60)
      setStrobeEnabled(config.strobeEnabled ?? false)
      setStrobeTriggerThreshold(config.strobeTriggerThreshold ?? 0.8)
      setStrobeProbability(config.strobeProbability ?? 100)
    }
    addIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, onConfigUpdate)
    return () => removeIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, onConfigUpdate)
  }, [])

  const handleSensitivityChange = async (value: number) => {
    if (isSaving) return

    const newValue = Math.max(0.1, Math.min(5.0, value))
    setSensitivity(newValue)

    try {
      setIsSaving(true)
      const result = await saveAudioConfig({ sensitivity: newValue })
      if (!result.success) {
        console.error('Failed to save audio sensitivity:', result.error)
        // Revert on failure
        const config = await getAudioConfig()
        setSensitivity(config?.sensitivity ?? 2.5)
      }
    } catch (error) {
      console.error('Failed to save audio sensitivity:', error)
      // Revert on failure
      const config = await getAudioConfig()
      setSensitivity(config?.sensitivity ?? 2.5)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    setSensitivity(value)
  }

  const handleSliderBlur = () => {
    handleSensitivityChange(sensitivity)
  }

  const handleNoiseFloorChange = async (value: number) => {
    if (isSaving) return

    const newValue = Math.max(0, Math.min(255, value))
    setNoiseFloor(newValue)

    try {
      setIsSaving(true)
      const result = await saveAudioConfig({ noiseFloor: newValue })
      if (!result.success) {
        console.error('Failed to save noise floor:', result.error)
        // Revert on failure
        const config = await getAudioConfig()
        setNoiseFloor(config?.noiseFloor ?? 60)
      }
    } catch (error) {
      console.error('Failed to save noise floor:', error)
      // Revert on failure
      const config = await getAudioConfig()
      setNoiseFloor(config?.noiseFloor ?? 60)
    } finally {
      setIsSaving(false)
    }
  }

  const handleNoiseFloorSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    setNoiseFloor(value)
  }

  const handleNoiseFloorSliderBlur = () => {
    handleNoiseFloorChange(noiseFloor)
  }

  const persistStrobe = async (
    updates: Partial<
      Pick<AudioConfig, 'strobeEnabled' | 'strobeTriggerThreshold' | 'strobeProbability'>
    >,
  ) => {
    if (isSaving) return
    try {
      setIsSaving(true)
      const result = await saveAudioConfig(updates)
      if (!result.success) {
        console.error('Failed to save strobe settings:', result.error)
        const config = await getAudioConfig()
        setStrobeEnabled(config?.strobeEnabled ?? false)
        setStrobeTriggerThreshold(config?.strobeTriggerThreshold ?? 0.8)
        setStrobeProbability(config?.strobeProbability ?? 100)
      }
    } catch (error) {
      console.error('Failed to save strobe settings:', error)
      const config = await getAudioConfig()
      setStrobeEnabled(config?.strobeEnabled ?? false)
      setStrobeTriggerThreshold(config?.strobeTriggerThreshold ?? 0.8)
      setStrobeProbability(config?.strobeProbability ?? 100)
    } finally {
      setIsSaving(false)
    }
  }

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

  const controlsDisabled = isLoading || isSaving
  const strobeControlsDisabled = controlsDisabled || !strobeEnabled

  const rangeClassName =
    'flex-1 min-w-0 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider'
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
            onChange={handleSliderChange}
            onMouseUp={handleSliderBlur}
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
              setSensitivity(Math.max(0.1, Math.min(5.0, value)))
            }}
            onBlur={() => handleSensitivityChange(sensitivity)}
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
            onChange={handleNoiseFloorSliderChange}
            onMouseUp={handleNoiseFloorSliderBlur}
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
              setNoiseFloor(Math.max(0, Math.min(255, value)))
            }}
            onBlur={() => handleNoiseFloorChange(noiseFloor)}
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
              const next = e.target.checked
              setStrobeEnabled(next)
              void persistStrobe({ strobeEnabled: next })
            }}
            aria-label="Strobe"
          />
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
            onChange={(e) => setStrobeTriggerThreshold(Number(e.target.value))}
            onMouseUp={() => void persistStrobe({ strobeTriggerThreshold })}
            onTouchEnd={() => void persistStrobe({ strobeTriggerThreshold })}
            disabled={strobeControlsDisabled}
            className={rangeClassName}
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
                setStrobeTriggerThreshold(Math.max(0, Math.min(1, value)))
              }
            }}
            onBlur={() => void persistStrobe({ strobeTriggerThreshold })}
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
            onChange={(e) => setStrobeProbability(Number(e.target.value))}
            onMouseUp={() => void persistStrobe({ strobeProbability })}
            onTouchEnd={() => void persistStrobe({ strobeProbability })}
            disabled={strobeControlsDisabled}
            className={rangeClassName}
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
                setStrobeProbability(Math.max(0, Math.min(100, Math.round(value))))
              }
            }}
            onBlur={() => void persistStrobe({ strobeProbability })}
            disabled={strobeControlsDisabled}
            className={numberClassName}
            aria-label="Strobe probability percent"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400 shrink-0">%</span>
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
            onChange={handleSliderChange}
            onMouseUp={handleSliderBlur}
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
              setSensitivity(Math.max(0.1, Math.min(5.0, value)))
            }}
            onBlur={() => handleSensitivityChange(sensitivity)}
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
            onChange={handleNoiseFloorSliderChange}
            onMouseUp={handleNoiseFloorSliderBlur}
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
              setNoiseFloor(Math.max(0, Math.min(255, value)))
            }}
            onBlur={() => handleNoiseFloorChange(noiseFloor)}
            disabled={controlsDisabled}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
          />
        </div>
      </div>
    </div>
  )
}

export default AudioSensitivityControls
