import React, { useState, useEffect, useCallback } from 'react'
import { getClockRate, setClockRate as saveClockRateToBackend } from '../ipcApi'
import { createLogger } from '../../../shared/logger'
import {
  CLOCK_RATE_MS_DEFAULT,
  CLOCK_RATE_MS_MAX,
  CLOCK_RATE_MS_MIN,
  clampClockRateMs,
} from '../../../shared/clockRate'
const log = createLogger('ClockRateSettings')

const ClockRateSettings: React.FC = () => {
  const [clockRateValue, setClockRateValue] = useState(10)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const loadClockRate = async () => {
      try {
        const result = await getClockRate()
        if (result.success) {
          setClockRateValue(result.clockRate)
        }
      } catch (error) {
        log.error('Failed to load clock rate:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadClockRate()
  }, [])

  const handleClockRateChange = useCallback(
    async (value: number) => {
      if (isSaving) return

      const newValue = clampClockRateMs(value)
      setClockRateValue(newValue)

      try {
        setIsSaving(true)
        const result = await saveClockRateToBackend(newValue)
        if (result.success) {
          setClockRateValue(newValue)
        } else {
          log.error('Failed to save clock rate:', result.error)
          // Revert to previous value on failure (it will be re-fetched from backend)
          window.location.reload() // Simple approach - could be more sophisticated
        }
      } catch (error) {
        log.error('Failed to save clock rate:', error)
        // Revert to previous value on failure
        window.location.reload() // Simple approach - could be more sophisticated
      } finally {
        setIsSaving(false)
      }
    },
    [isSaving],
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 1
    // Only update the local state immediately, don't save on every keystroke
    setClockRateValue(clampClockRateMs(value))
  }

  const handleInputBlur = () => {
    // Save when the user finishes editing (loses focus)
    handleClockRateChange(clockRateValue)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Clock Rate Settings
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Controls the timing precision of lighting effects. Lower values provide smoother animations
        but may impact performance on slower systems. Higher values reduce CPU usage but may cause
        less smooth transitions.
      </p>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="clock-rate"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Clock Rate
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="number"
              id="clock-rate"
              min={CLOCK_RATE_MS_MIN}
              max={CLOCK_RATE_MS_MAX}
              step="1"
              value={clockRateValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isSaving}
              placeholder="10"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">milliseconds</span>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Default is {CLOCK_RATE_MS_DEFAULT}ms. Increase for better performance on slower systems.
            Range: {CLOCK_RATE_MS_MIN}-{CLOCK_RATE_MS_MAX}ms. A strobe faster than twice the clock
            rate cannot be shown, so the higher settings suit slower looks.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ClockRateSettings
