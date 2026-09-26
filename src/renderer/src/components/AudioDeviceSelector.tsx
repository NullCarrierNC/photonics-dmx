import React, { useCallback, useEffect, useState } from 'react'
import { useAudioConfigFields } from '../hooks/useAudioConfigFields'
import { createLogger } from '../../../shared/logger'
const log = createLogger('AudioDeviceSelector')

interface AudioDevice {
  deviceId: string
  label: string
}

/** The stored config leaves deviceId unset for the system default, the select needs a value. */
const DEFAULT_DEVICE = 'default'

const AudioDeviceSelector: React.FC = () => {
  const audio = useAudioConfigFields({ deviceId: undefined as string | undefined })
  const selectedDeviceId = audio.values.deviceId || DEFAULT_DEVICE
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shownError = error ?? (audio.loadFailed ? 'Failed to load audio configuration' : null)

  const loadDevices = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = deviceList
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.substring(0, 8)}`,
        }))

      log.info(`Found ${audioInputs.length} audio input devices`)
      setDevices(audioInputs)
    } catch (error) {
      log.error('Failed to enumerate audio devices:', error)
      setError('Failed to load audio devices. Please check microphone permissions.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>): Promise<void> => {
    if (audio.isSaving) return

    const newDeviceId = e.target.value
    const outcome = await audio.save({
      deviceId: newDeviceId === DEFAULT_DEVICE ? undefined : newDeviceId,
    })

    if (!outcome.ok) {
      setError('Failed to save device selection')
    } else {
      // The device was stored, so the selection stands, but capture is not running on it.
      setError(outcome.warning ?? null)
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
          onChange={(e) => void handleDeviceChange(e)}
          disabled={isLoading || audio.isSaving}
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
          onClick={() => void loadDevices()}
          disabled={isLoading || audio.isSaving}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors"
          title="Refresh device list">
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {shownError && (
        <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-700 dark:text-red-300">{shownError}</p>
        </div>
      )}

      {audio.isSaving && <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">Saving...</p>}

      {devices.length === 0 && !isLoading && !shownError && (
        <p className="text-xs text-yellow-500 dark:text-yellow-400 mt-2">
          No audio devices found. Click "Refresh" to try again, or check that your microphone is
          connected and permissions are granted.
        </p>
      )}
    </div>
  )
}

export default AudioDeviceSelector
