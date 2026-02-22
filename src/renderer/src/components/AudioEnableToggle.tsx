import React, { useState, useEffect } from 'react'
import { CONFIG } from '../../../shared/ipcChannels'

interface AudioEnableToggleProps {
  disabled?: boolean
}

const AudioEnableToggle: React.FC<AudioEnableToggleProps> = ({ disabled = false }) => {
  const [enabled, setEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const loadEnabled = async () => {
      try {
        const config = await window.electron.ipcRenderer.invoke(CONFIG.GET_AUDIO_CONFIG)
        setEnabled(config?.enabled || false)
      } catch (error) {
        console.error('Failed to load audio enabled state:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadEnabled()
  }, [])

  const handleToggle = async () => {
    if (isSaving || disabled) return

    const newValue = !enabled
    setEnabled(newValue)

    try {
      setIsSaving(true)
      const result = await window.electron.ipcRenderer.invoke(CONFIG.SET_AUDIO_ENABLED, newValue)
      if (!result.success) {
        console.error('Failed to save audio enabled state:', result.error)
        setEnabled(!newValue) // Revert on failure
      }
    } catch (error) {
      console.error('Failed to save audio enabled state:', error)
      setEnabled(!newValue) // Revert on failure
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex items-center space-x-3">
      <label
        htmlFor="audio-enabled"
        className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Enable Audio-Reactive Lighting
      </label>
      <button
        type="button"
        id="audio-enabled"
        onClick={handleToggle}
        disabled={isLoading || isSaving || disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
        } ${disabled || isLoading || isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      {(isLoading || isSaving) && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {isLoading ? 'Loading...' : 'Saving...'}
        </span>
      )}
    </div>
  )
}

export default AudioEnableToggle
