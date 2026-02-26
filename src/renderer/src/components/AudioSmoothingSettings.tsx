import React, { useState, useEffect } from 'react'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'

const AudioSmoothingSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(true)
  const [alpha, setAlpha] = useState(0.7)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const config = await getAudioConfig()
        if (config?.smoothing) {
          setEnabled(config.smoothing.enabled !== undefined ? config.smoothing.enabled : true)
          setAlpha(config.smoothing.alpha || 0.7)
        }
      } catch (error) {
        console.error('Failed to load smoothing settings:', error)
      }
    }

    loadSettings()
  }, [])

  const handleToggle = async () => {
    const newEnabled = !enabled
    setEnabled(newEnabled)
    setIsSaving(true)

    try {
      await saveAudioConfig({ smoothing: { enabled: newEnabled, alpha } })
    } catch (error) {
      console.error('Failed to save smoothing enabled state:', error)
      setEnabled(!newEnabled) // Revert on error
    } finally {
      setIsSaving(false)
    }
  }

  const handleAlphaChange = async (newAlpha: number) => {
    setAlpha(newAlpha)
  }

  const handleAlphaSave = async () => {
    setIsSaving(true)

    try {
      await saveAudioConfig({ smoothing: { enabled, alpha } })
    } catch (error) {
      console.error('Failed to save smoothing alpha:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Smoothing</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Reduces flickering by smoothing rapid frequency changes
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isSaving}
          className={`w-12 h-6 rounded-full ${
            enabled ? 'bg-green-500' : 'bg-gray-400'
          } relative focus:outline-none ${
            isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}>
          <div
            className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
              enabled ? 'translate-x-6' : 'translate-x-0'
            }`}></div>
        </button>
      </div>

      {enabled && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Smoothing Factor (Alpha)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Higher values = less smoothing (more responsive), lower values = more smoothing
                (less flicker)
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-right">
                {alpha.toFixed(2)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">/ 0.95</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="0.1"
              max="0.95"
              step="0.05"
              value={alpha}
              onChange={(e) => handleAlphaChange(parseFloat(e.target.value))}
              onMouseUp={handleAlphaSave}
              onTouchEnd={handleAlphaSave}
              className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((alpha - 0.1) / (0.95 - 0.1)) * 100}%, #e5e7eb ${((alpha - 0.1) / (0.95 - 0.1)) * 100}%, #e5e7eb 100%)`,
              }}
            />

            <input
              type="number"
              min="0.1"
              max="0.95"
              step="0.05"
              value={alpha}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0.1
                handleAlphaChange(Math.max(0.1, Math.min(0.95, value)))
              }}
              onBlur={handleAlphaSave}
              className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
            />
          </div>
        </div>
      )}

      {isSaving && <p className="text-xs text-gray-500 dark:text-gray-400">Saving...</p>}
    </div>
  )
}

export default AudioSmoothingSettings
