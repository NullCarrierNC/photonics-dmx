import React, { useState, useEffect } from 'react'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'

interface AudioDevice {
  deviceId: string
  label: string
}

const AudioDeviceSelector: React.FC = () => {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load config and devices on mount
  useEffect(() => {
    const loadConfigAndDevices = async () => {
      try {
        // Load saved config
        const config = await getAudioConfig()
        setSelectedDeviceId(config?.deviceId || 'default')

        // Load available devices
        await loadDevices()
      } catch (error) {
        console.error('Failed to load audio config:', error)
        setError('Failed to load audio configuration')
      }
    }

    loadConfigAndDevices()
  }, [])

  const loadDevices = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Use Web Audio API to enumerate devices
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = deviceList
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.substring(0, 8)}`,
        }))

      console.log(`Found ${audioInputs.length} audio input devices`)
      setDevices(audioInputs)
    } catch (error) {
      console.error('Failed to enumerate audio devices:', error)
      setError('Failed to load audio devices. Please check microphone permissions.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isSaving) return

    const newDeviceId = e.target.value
    setSelectedDeviceId(newDeviceId)

    try {
      setIsSaving(true)
      const result = await saveAudioConfig({
        deviceId: newDeviceId === 'default' ? undefined : newDeviceId,
      })

      if (!result.success) {
        console.error('Failed to save audio device:', result.error)
        setError('Failed to save device selection')

        // Revert on failure
        const config = await getAudioConfig()
        setSelectedDeviceId(config?.deviceId || 'default')
      }
    } catch (error) {
      console.error('Failed to save audio device:', error)
      setError('Failed to save device selection')

      // Revert on failure
      const config = await getAudioConfig()
      setSelectedDeviceId(config?.deviceId || 'default')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg ">
      <label
        htmlFor="audio-device"
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Device Selection
      </label>

      <div className="flex items-center space-x-2">
        <select
          id="audio-device"
          value={selectedDeviceId}
          onChange={handleDeviceChange}
          disabled={isLoading || isSaving}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
          <option value="default">System Default Audio Input</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={loadDevices}
          disabled={isLoading || isSaving}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors"
          title="Refresh device list">
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {isSaving && <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">Saving...</p>}

      {devices.length === 0 && !isLoading && !error && (
        <p className="text-xs text-yellow-500 dark:text-yellow-400 mt-2">
          No audio devices found. Click "Refresh" to try again, or check that your microphone is
          connected and permissions are granted.
        </p>
      )}
    </div>
  )
}

export default AudioDeviceSelector
