import React, { useCallback, useEffect, useState } from 'react'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import type { AudioGameModeConfig } from '../../../shared/ipcTypes'
import { getAudioGameMode, setAudioGameMode } from '../ipcApi'
import { createLogger } from '../../../shared/logger'
import { DraftNumberField } from './controls/DraftField'
const log = createLogger('AudioGameModeSettings')

const CUE_DURATION_ABS_MIN = 5
const CUE_DURATION_ABS_MAX = 120

const AudioGameModeSettings: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cueDurationMin, setCueDurationMin] = useState(5)
  const [cueDurationMax, setCueDurationMax] = useState(20)

  const applyConfig = useCallback((config: AudioGameModeConfig) => {
    setCueDurationMin(config.cueDurationMin)
    setCueDurationMax(config.cueDurationMax)
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const config = await getAudioGameMode()
        applyConfig(config)
      } catch (e) {
        log.error('Failed to load audio game mode settings', e)
        setError('Failed to load Game Mode settings')
      } finally {
        setLoading(false)
      }
    }
    void load()

    const onUpdate = (config: AudioGameModeConfig) => {
      applyConfig(config)
    }
    addIpcListener(RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE, onUpdate)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE, onUpdate)
    }
  }, [applyConfig])

  const persist = async (updates: Partial<AudioGameModeConfig>) => {
    setSaving(true)
    setError(null)
    try {
      const result = await setAudioGameMode(updates)
      if (!result.success) {
        setError(result.error ?? 'Failed to save')
        const config = await getAudioGameMode()
        applyConfig(config)
      } else {
        applyConfig(result.config)
      }
    } catch (e) {
      log.error('Failed to save audio game mode', e)
      setError('Failed to save Game Mode settings')
      try {
        const config = await getAudioGameMode()
        applyConfig(config)
      } catch {
        // ignore
      }
    } finally {
      setSaving(false)
    }
  }

  // The boxes hold each value inside the absolute range, and the window keeps max at or above min.
  const commitCueDurationMin = (min: number) => {
    const max = Math.max(min, cueDurationMax)
    setCueDurationMin(min)
    setCueDurationMax(max)
    void persist({ cueDurationMin: min, cueDurationMax: max })
  }

  /** Answers false when the maximum was raised to the minimum, so the box shows the one taken. */
  const commitCueDurationMax = (typed: number): boolean => {
    const max = Math.max(cueDurationMin, typed)
    setCueDurationMax(max)
    void persist({ cueDurationMin, cueDurationMax: max })
    return max === typed
  }

  if (loading) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">Loading Game Mode settings…</p>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900 dark:text-red-100">
          {error}
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Cue duration window (seconds)
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          After a random time in this range, the next cue switch is scheduled; the cue actually
          changes on the next beat.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Minimum
            </label>
            <DraftNumberField
              min={CUE_DURATION_ABS_MIN}
              max={CUE_DURATION_ABS_MAX}
              step={1}
              className="w-full sm:w-32 p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
              value={cueDurationMin}
              disabled={saving}
              onCommit={commitCueDurationMin}
              aria-label="Minimum cue duration"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Maximum
            </label>
            <DraftNumberField
              min={CUE_DURATION_ABS_MIN}
              max={CUE_DURATION_ABS_MAX}
              step={1}
              className="w-full sm:w-32 p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
              value={cueDurationMax}
              disabled={saving}
              onCommit={commitCueDurationMax}
              aria-label="Maximum cue duration"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default AudioGameModeSettings
