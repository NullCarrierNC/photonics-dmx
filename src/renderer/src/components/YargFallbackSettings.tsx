import React, { useCallback, useEffect, useState } from 'react'
import { getYargFallbackCueTimeMs, setYargFallbackCueTimeMs } from '../ipcApi'
import { createLogger } from '../../../shared/logger'

const log = createLogger('YargFallbackSettings')

const MIN_SECONDS = 0
const MAX_SECONDS = 600

/**
 * Fallback Time (seconds) preference: when a YARG song is playing and no new lighting cue has
 * arrived for this long, an auto Fallback cue is triggered (and re-triggered each window). 0
 * disables the feature. Stored as milliseconds; displayed in seconds.
 */
const YargFallbackSettings: React.FC = () => {
  const [seconds, setSeconds] = useState(20)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const result = await getYargFallbackCueTimeMs()
        if (result?.success === true && typeof result.fallbackMs === 'number') {
          setSeconds(Math.round(result.fallbackMs / 1000))
        }
      } catch (error) {
        log.error('Failed to load YARG fallback time:', error)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const handleChange = useCallback(
    async (value: number) => {
      if (isSaving) return
      const clampedSeconds = Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, Math.round(value)))
      setSeconds(clampedSeconds)
      try {
        setIsSaving(true)
        const result = await setYargFallbackCueTimeMs(clampedSeconds * 1000)
        if (result.success && typeof result.fallbackMs === 'number') {
          setSeconds(Math.round(result.fallbackMs / 1000))
        } else if (!result.success) {
          log.error('Failed to save YARG fallback time:', result.error)
        }
      } catch (error) {
        log.error('Failed to save YARG fallback time:', error)
      } finally {
        setIsSaving(false)
      }
    },
    [isSaving],
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Fallback Cue (YARG)
      </h2>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        If a track has a bad lighting track, YARG won't autogenerate a show or send any cues,
        causing the lights to turn off. If Photonics hasn't received a new cue within the Fallback
        Time, it will trigger a fallback cue. Set to <strong>0</strong> to disable.
      </p>

      <div>
        <label
          htmlFor="yarg-fallback-time"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Fallback Time
        </label>
        <div className="flex items-center space-x-4">
          <input
            type="number"
            id="yarg-fallback-time"
            min={MIN_SECONDS}
            max={MAX_SECONDS}
            step={1}
            value={seconds}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setSeconds(Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, Number.isNaN(v) ? 0 : v)))
            }}
            onBlur={() => handleChange(seconds)}
            disabled={isLoading || isSaving}
            className="w-28 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
            placeholder="20"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">seconds (0 = disabled)</span>
        </div>
      </div>
    </div>
  )
}

export default YargFallbackSettings
