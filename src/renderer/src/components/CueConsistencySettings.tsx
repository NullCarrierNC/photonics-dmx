import React, { useState, useEffect, useCallback } from 'react'
import {
  getCueConsistencyWindow,
  setCueConsistencyWindow,
  getCueGroupSelectionMode,
  setCueGroupSelectionMode,
  getMotionGroupSelectionMode,
  setMotionGroupSelectionMode,
} from '../ipcApi'

type CueGroupSelectionMode = 'oncePerSong' | 'withinSong'
type MotionGroupSelectionMode = 'oncePerSong' | 'perCueChange' | 'none'

const CueConsistencySettings: React.FC = () => {
  const [consistencyWindow, setConsistencyWindow] = useState(60000)
  const [selectionMode, setSelectionMode] = useState<CueGroupSelectionMode>('withinSong')
  const [motionSelectionMode, setMotionSelectionModeState] =
    useState<MotionGroupSelectionMode>('perCueChange')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [windowResult, modeResult, motionModeResult] = await Promise.all([
          getCueConsistencyWindow(),
          getCueGroupSelectionMode(),
          getMotionGroupSelectionMode(),
        ])
        if (windowResult.success) setConsistencyWindow(windowResult.windowMs)
        if (modeResult.success) setSelectionMode(modeResult.mode)
        if (motionModeResult?.success === true && motionModeResult.mode) {
          setMotionSelectionModeState(motionModeResult.mode)
        }
      } catch (error) {
        console.error('Failed to load cue consistency settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [])

  const handleConsistencyWindowChange = useCallback(
    async (value: number) => {
      if (isSaving) return

      const newValue = Math.max(0, Math.min(300000, value)) // Clamp to 0-300000
      setConsistencyWindow(newValue)

      try {
        setIsSaving(true)
        const result = await setCueConsistencyWindow(newValue)
        if (result.success) {
          setConsistencyWindow(result.windowMs)
        } else {
          console.error('Failed to save consistency window:', result.error)
          // Revert to previous value on failure
          setConsistencyWindow(consistencyWindow)
        }
      } catch (error) {
        console.error('Failed to save consistency window:', error)
        // Revert to previous value on failure
        setConsistencyWindow(consistencyWindow)
      } finally {
        setIsSaving(false)
      }
    },
    [isSaving, consistencyWindow],
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0
    // Only update the local state immediately, don't save on every keystroke
    setConsistencyWindow(Math.max(0, Math.min(300000, value)))
  }

  const handleInputBlur = () => {
    // Save when the user finishes editing (loses focus)
    handleConsistencyWindowChange(consistencyWindow)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Cue Consistency Settings
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Prevents rapid randomization changes when the same cue is called within a short time window.
        This helps maintain visual consistency during rapid cue transitions. I.e. if Cue A from
        Group B was selected, each time Cue A is called within this window will use the same
        implementation as the previous call. With &quot;Once Per Song&quot;, the cue group is chosen
        when the song starts and stays fixed for the entire song.
      </p>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="cue-group-selection-mode"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Cue Group Selection Mode
          </label>
          <select
            id="cue-group-selection-mode"
            value={selectionMode}
            onChange={async (e) => {
              const mode = e.target.value as CueGroupSelectionMode
              if (mode !== 'oncePerSong' && mode !== 'withinSong') return
              setSelectionMode(mode)
              if (isSaving) return
              try {
                setIsSaving(true)
                const result = await setCueGroupSelectionMode(mode)
                if (!result.success) {
                  console.error('Failed to save cue group selection mode:', result.error)
                  setSelectionMode(selectionMode)
                }
              } catch (error) {
                console.error('Failed to save cue group selection mode:', error)
                setSelectionMode(selectionMode)
              } finally {
                setIsSaving(false)
              }
            }}
            className="block w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isSaving}>
            <option value="withinSong">Within a Song</option>
            <option value="oncePerSong">Once Per Song</option>
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Within a Song: the cue group can change among enabled groups during the song (subject to
            the consistency window). Once Per Song: the group is chosen when the song starts and
            remains fixed for that song.
          </p>
        </div>
        <div>
          <label
            htmlFor="motion-group-selection-mode"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Motion Cue Selection Mode
          </label>
          <select
            id="motion-group-selection-mode"
            value={motionSelectionMode}
            onChange={async (e) => {
              const mode = e.target.value as MotionGroupSelectionMode
              if (mode !== 'oncePerSong' && mode !== 'perCueChange' && mode !== 'none') return
              setMotionSelectionModeState(mode)
              if (isSaving) return
              try {
                setIsSaving(true)
                const result = await setMotionGroupSelectionMode(mode)
                if (!result.success) {
                  console.error('Failed to save motion group selection mode:', result.error)
                  setMotionSelectionModeState(motionSelectionMode)
                }
              } catch (error) {
                console.error('Failed to save motion group selection mode:', error)
                setMotionSelectionModeState(motionSelectionMode)
              } finally {
                setIsSaving(false)
              }
            }}
            className="block w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isSaving}>
            <option value="perCueChange">Per Cue Change</option>
            <option value="oncePerSong">Once Per Song</option>
            <option value="none">No Motion Cues</option>
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Controls how often a random motion program is chosen from enabled motion cue groups. Per
            Cue Change: a new random motion cue when each YARG lighting cue fires. Once Per Song:
            one random motion program is locked for the whole song. No Motion Cues: automatic motion
            selection is disabled (use Cue Simulation to run motion manually).
          </p>
        </div>
        <div>
          <label
            htmlFor="consistency-window"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Consistency Window
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="number"
              id="consistency-window"
              min="0"
              max="300000"
              step="100"
              value={consistencyWindow}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isSaving}
              placeholder="60000"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">milliseconds</span>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Set to 0 to disable consistency throttling. Default is 60000ms (60 seconds). Maximum is
            300000ms (5 minutes).
          </p>
        </div>
      </div>
    </div>
  )
}

export default CueConsistencySettings
