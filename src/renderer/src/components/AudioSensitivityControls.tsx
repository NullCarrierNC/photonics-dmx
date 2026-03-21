import React, { useState, useEffect } from 'react'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'

const AudioSensitivityControls: React.FC = () => {
  const [sensitivity, setSensitivity] = useState(1.0)
  const [noiseFloor, setNoiseFloor] = useState(50)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getAudioConfig()
        setSensitivity(config?.sensitivity ?? 1.0)
        setNoiseFloor(config?.noiseFloor ?? 50)
      } catch (error) {
        console.error('Failed to load audio sensitivity:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
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
        setSensitivity(config?.sensitivity ?? 1.0)
      }
    } catch (error) {
      console.error('Failed to save audio sensitivity:', error)
      // Revert on failure
      const config = await getAudioConfig()
      setSensitivity(config?.sensitivity ?? 1.0)
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
        setNoiseFloor(config?.noiseFloor ?? 50)
      }
    } catch (error) {
      console.error('Failed to save noise floor:', error)
      // Revert on failure
      const config = await getAudioConfig()
      setNoiseFloor(config?.noiseFloor ?? 50)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Global Sensitivity
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Adjust the global sensitivity: acts as again multiplier for audio input. This is applied
            to all frequency bands.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-right">
            {sensitivity.toFixed(1)}x
          </span>
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
          disabled={isLoading || isSaving}
          className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((sensitivity - 0.1) / (5.0 - 0.1)) * 100}%, #e5e7eb ${((sensitivity - 0.1) / (5.0 - 0.1)) * 100}%, #e5e7eb 100%)`,
          }}
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
          disabled={isLoading || isSaving}
          className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
        />
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
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[4rem] text-right">
              {noiseFloor} / 255
            </span>
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
            disabled={isLoading || isSaving}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(noiseFloor / 255) * 100}%, #e5e7eb ${(noiseFloor / 255) * 100}%, #e5e7eb 100%)`,
            }}
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
            disabled={isLoading || isSaving}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
          />
        </div>
      </div>
    </div>
  )
}

export default AudioSensitivityControls
