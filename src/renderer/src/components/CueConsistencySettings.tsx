import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  getCueConsistencyWindow,
  setCueConsistencyWindow,
  getCueGroupSelectionMode,
  setCueGroupSelectionMode,
  getRb3CueGroupSelectionMode,
  setRb3CueGroupSelectionMode,
  getYargMotionGroupSelectionMode,
  setYargMotionGroupSelectionMode,
  getAudioMotionGroupSelectionMode,
  setAudioMotionGroupSelectionMode,
  getMotionCueMinHoldMs,
  setMotionCueMinHoldMs,
  getMotionCueProbabilityPercent,
  setMotionCueProbabilityPercent,
  getAudioMotionCueProbabilityPercent,
  setAudioMotionCueProbabilityPercent,
  getRb3MotionGroupSelectionMode,
  setRb3MotionGroupSelectionMode,
  getRb3MotionCueProbabilityPercent,
  setRb3MotionCueProbabilityPercent,
  getRb3MotionCueMinHoldMs,
  setRb3MotionCueMinHoldMs,
  getRb3MotionCueDuration,
  setRb3MotionCueDuration,
} from '../ipcApi'
import { createLogger } from '../../../shared/logger'

const log = createLogger('CueConsistencySettings')

const PROBABILITY_SAVE_DEBOUNCE_MS = 300

type CueGroupSelectionMode = 'oncePerSong' | 'withinSong'
type MotionGroupSelectionMode = 'oncePerSong' | 'perCueChange' | 'none'

export interface CueConsistencySettingsProps {
  /** When false, YARG/audio motion selection mode controls are disabled (global Motion master off). */
  motionGloballyEnabled?: boolean
}

const CueConsistencySettings: React.FC<CueConsistencySettingsProps> = ({
  motionGloballyEnabled = true,
}) => {
  const [consistencyWindow, setConsistencyWindow] = useState(10000)
  const [selectionMode, setSelectionMode] = useState<CueGroupSelectionMode>('withinSong')
  const [rb3SelectionMode, setRb3SelectionMode] = useState<CueGroupSelectionMode>('withinSong')
  const [yargMotionSelectionMode, setYargMotionSelectionModeState] =
    useState<MotionGroupSelectionMode>('perCueChange')
  const [audioMotionSelectionMode, setAudioMotionSelectionModeState] =
    useState<MotionGroupSelectionMode>('perCueChange')
  const [motionMinHoldMs, setMotionMinHoldMsState] = useState(5000)
  const [yargMotionProbability, setYargMotionProbability] = useState(50)
  const [audioMotionProbability, setAudioMotionProbability] = useState(50)
  const [rb3MotionSelectionMode, setRb3MotionSelectionModeState] =
    useState<MotionGroupSelectionMode>('perCueChange')
  const [rb3MotionProbability, setRb3MotionProbability] = useState(50)
  const [rb3MotionMinHoldMs, setRb3MotionMinHoldMsState] = useState(5000)
  const [rb3MotionDurationMin, setRb3MotionDurationMin] = useState(5)
  const [rb3MotionDurationMax, setRb3MotionDurationMax] = useState(20)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const yargProbabilitySaveRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    pendingValue: number | null
    lastSentValue: number | null
  }>({ timer: null, pendingValue: null, lastSentValue: null })
  const audioProbabilitySaveRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    pendingValue: number | null
    lastSentValue: number | null
  }>({ timer: null, pendingValue: null, lastSentValue: null })
  const rb3ProbabilitySaveRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    pendingValue: number | null
    lastSentValue: number | null
  }>({ timer: null, pendingValue: null, lastSentValue: null })

  useEffect(() => {
    const load = async () => {
      try {
        const [
          windowResult,
          modeResult,
          yargMotionResult,
          audioMotionResult,
          minHoldResult,
          yargProbabilityResult,
          audioProbabilityResult,
          rb3MotionResult,
          rb3ProbabilityResult,
          rb3MinHoldResult,
          rb3DurationResult,
          rb3ModeResult,
        ] = await Promise.all([
          getCueConsistencyWindow(),
          getCueGroupSelectionMode(),
          getYargMotionGroupSelectionMode(),
          getAudioMotionGroupSelectionMode(),
          getMotionCueMinHoldMs(),
          getMotionCueProbabilityPercent(),
          getAudioMotionCueProbabilityPercent(),
          getRb3MotionGroupSelectionMode(),
          getRb3MotionCueProbabilityPercent(),
          getRb3MotionCueMinHoldMs(),
          getRb3MotionCueDuration(),
          getRb3CueGroupSelectionMode(),
        ])
        if (windowResult.success) setConsistencyWindow(windowResult.windowMs)
        if (modeResult.success) setSelectionMode(modeResult.mode)
        if (rb3ModeResult.success) setRb3SelectionMode(rb3ModeResult.mode)
        if (yargMotionResult?.success === true && yargMotionResult.mode) {
          setYargMotionSelectionModeState(yargMotionResult.mode)
        }
        if (audioMotionResult?.success === true && audioMotionResult.mode) {
          setAudioMotionSelectionModeState(audioMotionResult.mode)
        }
        if (minHoldResult?.success === true && typeof minHoldResult.minHoldMs === 'number') {
          setMotionMinHoldMsState(minHoldResult.minHoldMs)
        }
        if (
          yargProbabilityResult?.success === true &&
          typeof yargProbabilityResult.percent === 'number'
        ) {
          setYargMotionProbability(yargProbabilityResult.percent)
          yargProbabilitySaveRef.current.lastSentValue = yargProbabilityResult.percent
        }
        if (
          audioProbabilityResult?.success === true &&
          typeof audioProbabilityResult.percent === 'number'
        ) {
          setAudioMotionProbability(audioProbabilityResult.percent)
          audioProbabilitySaveRef.current.lastSentValue = audioProbabilityResult.percent
        }
        if (rb3MotionResult?.success === true && rb3MotionResult.mode) {
          setRb3MotionSelectionModeState(rb3MotionResult.mode)
        }
        if (
          rb3ProbabilityResult?.success === true &&
          typeof rb3ProbabilityResult.percent === 'number'
        ) {
          setRb3MotionProbability(rb3ProbabilityResult.percent)
          rb3ProbabilitySaveRef.current.lastSentValue = rb3ProbabilityResult.percent
        }
        if (rb3MinHoldResult?.success === true && typeof rb3MinHoldResult.minHoldMs === 'number') {
          setRb3MotionMinHoldMsState(rb3MinHoldResult.minHoldMs)
        }
        if (
          rb3DurationResult?.success === true &&
          typeof rb3DurationResult.min === 'number' &&
          typeof rb3DurationResult.max === 'number'
        ) {
          setRb3MotionDurationMin(rb3DurationResult.min)
          setRb3MotionDurationMax(rb3DurationResult.max)
        }
      } catch (error) {
        log.error('Failed to load cue consistency settings:', error)
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
          log.error('Failed to save consistency window:', result.error)
          // Revert to previous value on failure
          setConsistencyWindow(consistencyWindow)
        }
      } catch (error) {
        log.error('Failed to save consistency window:', error)
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

  const sendProbability = useCallback(
    async (
      ref: React.MutableRefObject<{
        timer: ReturnType<typeof setTimeout> | null
        pendingValue: number | null
        lastSentValue: number | null
      }>,
      save: (value: number) => Promise<{ success: true; percent: number } | { success: false }>,
      reload: () => Promise<{ success: true; percent: number } | { success: false }>,
      applyServerValue: (value: number) => void,
      label: string,
    ) => {
      const pending = ref.current.pendingValue
      if (pending == null) return
      if (pending === ref.current.lastSentValue) {
        ref.current.pendingValue = null
        return
      }
      const valueToSend = pending
      ref.current.pendingValue = null
      try {
        const result = await save(valueToSend)
        if (result.success && typeof result.percent === 'number') {
          ref.current.lastSentValue = result.percent
          applyServerValue(result.percent)
        } else {
          log.error(`Failed to save ${label}`)
          const reloaded = await reload()
          if (reloaded.success && typeof reloaded.percent === 'number') {
            ref.current.lastSentValue = reloaded.percent
            applyServerValue(reloaded.percent)
          }
        }
      } catch (error) {
        log.error(`Failed to save ${label}:`, error)
        try {
          const reloaded = await reload()
          if (reloaded.success && typeof reloaded.percent === 'number') {
            ref.current.lastSentValue = reloaded.percent
            applyServerValue(reloaded.percent)
          }
        } catch (reloadError) {
          log.error(`Failed to reload ${label}:`, reloadError)
        }
      }
    },
    [],
  )

  const armProbabilitySave = useCallback(
    (
      ref: React.MutableRefObject<{
        timer: ReturnType<typeof setTimeout> | null
        pendingValue: number | null
        lastSentValue: number | null
      }>,
      value: number,
      flush: () => void,
    ) => {
      ref.current.pendingValue = value
      if (ref.current.timer) {
        clearTimeout(ref.current.timer)
      }
      ref.current.timer = setTimeout(() => {
        ref.current.timer = null
        flush()
      }, PROBABILITY_SAVE_DEBOUNCE_MS)
    },
    [],
  )

  const flushYargProbability = useCallback(() => {
    if (yargProbabilitySaveRef.current.timer) {
      clearTimeout(yargProbabilitySaveRef.current.timer)
      yargProbabilitySaveRef.current.timer = null
    }
    void sendProbability(
      yargProbabilitySaveRef,
      setMotionCueProbabilityPercent,
      getMotionCueProbabilityPercent,
      setYargMotionProbability,
      'YARG motion probability',
    )
  }, [sendProbability])

  const flushAudioProbability = useCallback(() => {
    if (audioProbabilitySaveRef.current.timer) {
      clearTimeout(audioProbabilitySaveRef.current.timer)
      audioProbabilitySaveRef.current.timer = null
    }
    void sendProbability(
      audioProbabilitySaveRef,
      setAudioMotionCueProbabilityPercent,
      getAudioMotionCueProbabilityPercent,
      setAudioMotionProbability,
      'audio motion probability',
    )
  }, [sendProbability])

  const handleYargProbabilityChange = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(value)))
      setYargMotionProbability(clamped)
      armProbabilitySave(yargProbabilitySaveRef, clamped, flushYargProbability)
    },
    [armProbabilitySave, flushYargProbability],
  )

  const handleAudioProbabilityChange = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(value)))
      setAudioMotionProbability(clamped)
      armProbabilitySave(audioProbabilitySaveRef, clamped, flushAudioProbability)
    },
    [armProbabilitySave, flushAudioProbability],
  )

  const flushRb3Probability = useCallback(() => {
    if (rb3ProbabilitySaveRef.current.timer) {
      clearTimeout(rb3ProbabilitySaveRef.current.timer)
      rb3ProbabilitySaveRef.current.timer = null
    }
    void sendProbability(
      rb3ProbabilitySaveRef,
      setRb3MotionCueProbabilityPercent,
      getRb3MotionCueProbabilityPercent,
      setRb3MotionProbability,
      'RB3 motion probability',
    )
  }, [sendProbability])

  const handleRb3ProbabilityChange = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(value)))
      setRb3MotionProbability(clamped)
      armProbabilitySave(rb3ProbabilitySaveRef, clamped, flushRb3Probability)
    },
    [armProbabilitySave, flushRb3Probability],
  )

  useEffect(() => {
    const yargRef = yargProbabilitySaveRef
    const audioRef = audioProbabilitySaveRef
    const rb3Ref = rb3ProbabilitySaveRef
    return () => {
      for (const ref of [yargRef, audioRef, rb3Ref]) {
        if (ref.current.timer) {
          clearTimeout(ref.current.timer)
          ref.current.timer = null
        }
      }
      void sendProbability(
        yargRef,
        setMotionCueProbabilityPercent,
        getMotionCueProbabilityPercent,
        () => {},
        'YARG motion probability',
      )
      void sendProbability(
        audioRef,
        setAudioMotionCueProbabilityPercent,
        getAudioMotionCueProbabilityPercent,
        () => {},
        'audio motion probability',
      )
      void sendProbability(
        rb3Ref,
        setRb3MotionCueProbabilityPercent,
        getRb3MotionCueProbabilityPercent,
        () => {},
        'RB3 motion probability',
      )
    }
  }, [sendProbability])

  const handleMotionMinHoldChange = useCallback(
    async (value: number) => {
      if (isSaving) return
      const newValue = Math.max(0, Math.min(600000, value))
      setMotionMinHoldMsState(newValue)
      try {
        setIsSaving(true)
        const result = await setMotionCueMinHoldMs(newValue)
        if (result.success && typeof result.minHoldMs === 'number') {
          setMotionMinHoldMsState(result.minHoldMs)
        } else if (!result.success) {
          log.error('Failed to save motion min hold:', result.error)
          const reload = await getMotionCueMinHoldMs()
          if (reload.success && typeof reload.minHoldMs === 'number') {
            setMotionMinHoldMsState(reload.minHoldMs)
          }
        }
      } catch (error) {
        log.error('Failed to save motion min hold:', error)
        const reload = await getMotionCueMinHoldMs()
        if (reload.success && typeof reload.minHoldMs === 'number') {
          setMotionMinHoldMsState(reload.minHoldMs)
        }
      } finally {
        setIsSaving(false)
      }
    },
    [isSaving],
  )

  const handleRb3MinHoldChange = useCallback(
    async (value: number) => {
      if (isSaving) return
      const newValue = Math.max(0, Math.min(600000, value))
      setRb3MotionMinHoldMsState(newValue)
      try {
        setIsSaving(true)
        const result = await setRb3MotionCueMinHoldMs(newValue)
        if (result.success && typeof result.minHoldMs === 'number') {
          setRb3MotionMinHoldMsState(result.minHoldMs)
        } else if (!result.success) {
          const reload = await getRb3MotionCueMinHoldMs()
          if (reload.success && typeof reload.minHoldMs === 'number') {
            setRb3MotionMinHoldMsState(reload.minHoldMs)
          }
        }
      } catch (error) {
        log.error('Failed to save RB3 motion min hold:', error)
      } finally {
        setIsSaving(false)
      }
    },
    [isSaving],
  )

  const handleRb3DurationChange = useCallback(
    async (min: number, max: number) => {
      if (isSaving) return
      const range = { min: Math.max(0, Math.min(600, min)), max: Math.max(0, Math.min(600, max)) }
      try {
        setIsSaving(true)
        const result = await setRb3MotionCueDuration(range)
        if (result.success && typeof result.min === 'number' && typeof result.max === 'number') {
          setRb3MotionDurationMin(result.min)
          setRb3MotionDurationMax(result.max)
        } else if (!result.success) {
          const reload = await getRb3MotionCueDuration()
          if (reload.success) {
            setRb3MotionDurationMin(reload.min)
            setRb3MotionDurationMax(reload.max)
          }
        }
      } catch (error) {
        log.error('Failed to save RB3 motion duration:', error)
      } finally {
        setIsSaving(false)
      }
    },
    [isSaving],
  )

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
                  log.error('Failed to save cue group selection mode:', result.error)
                  setSelectionMode(selectionMode)
                }
              } catch (error) {
                log.error('Failed to save cue group selection mode:', error)
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
              placeholder="10000"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">milliseconds</span>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Set to 0 to disable consistency throttling. Default is 10000ms (10 seconds). Maximum is
            300000ms (5 minutes).
          </p>
        </div>
        <div>
          <label
            htmlFor="yarg-motion-group-selection-mode"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            YARG motion cue selection mode
          </label>
          <select
            id="yarg-motion-group-selection-mode"
            value={yargMotionSelectionMode}
            onChange={async (e) => {
              const mode = e.target.value as MotionGroupSelectionMode
              if (mode !== 'oncePerSong' && mode !== 'perCueChange' && mode !== 'none') return
              setYargMotionSelectionModeState(mode)
              if (isSaving) return
              try {
                setIsSaving(true)
                const result = await setYargMotionGroupSelectionMode(mode)
                if (!result.success) {
                  log.error('Failed to save YARG motion group selection mode:', result.error)
                  setYargMotionSelectionModeState(yargMotionSelectionMode)
                }
              } catch (error) {
                log.error('Failed to save YARG motion group selection mode:', error)
                setYargMotionSelectionModeState(yargMotionSelectionMode)
              } finally {
                setIsSaving(false)
              }
            }}
            className="block w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isSaving || !motionGloballyEnabled}>
            <option value="perCueChange">Per Lighting Cue Change</option>
            <option value="oncePerSong">Once Per Song</option>
            <option value="none">No Motion Cues</option>
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Controls when a new motion cue is triggered in YARG mode.
          </p>
        </div>
        <div>
          <label
            htmlFor="audio-motion-group-selection-mode"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Audio motion cue selection mode
          </label>
          <select
            id="audio-motion-group-selection-mode"
            value={audioMotionSelectionMode}
            onChange={async (e) => {
              const mode = e.target.value as MotionGroupSelectionMode
              if (mode !== 'oncePerSong' && mode !== 'perCueChange' && mode !== 'none') return
              setAudioMotionSelectionModeState(mode)
              if (isSaving) return
              try {
                setIsSaving(true)
                const result = await setAudioMotionGroupSelectionMode(mode)
                if (!result.success) {
                  log.error('Failed to save audio motion group selection mode:', result.error)
                  setAudioMotionSelectionModeState(audioMotionSelectionMode)
                }
              } catch (error) {
                log.error('Failed to save audio motion group selection mode:', error)
                setAudioMotionSelectionModeState(audioMotionSelectionMode)
              } finally {
                setIsSaving(false)
              }
            }}
            className="block w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isSaving || !motionGloballyEnabled}>
            <option value="perCueChange">Per Lighting Cue Change</option>
            <option value="oncePerSong">Once Per Song</option>
            <option value="none">No Audio Motion Cues</option>
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Controls when a new motion cue is triggered in audio mode.
          </p>
        </div>
        <div>
          <label
            htmlFor="yarg-motion-probability"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            YARG motion cue probability
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              id="yarg-motion-probability"
              min={0}
              max={100}
              step={1}
              value={yargMotionProbability}
              onChange={(e) => handleYargProbabilityChange(parseInt(e.target.value, 10))}
              onMouseUp={flushYargProbability}
              onPointerUp={flushYargProbability}
              onBlur={flushYargProbability}
              className="flex-1 max-w-xs accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !motionGloballyEnabled}
            />
            <span className="text-sm text-gray-700 dark:text-gray-300 w-12 text-right tabular-nums">
              {yargMotionProbability}%
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Chance that a motion cue will play when a new YARG lighting cue starts. At 100% a motion
            cue is always picked; at 0% motion is suppressed and fixtures return to their home
            position. Manual motion selection always plays regardless of this value.
          </p>
        </div>
        <div>
          <label
            htmlFor="audio-motion-probability"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Audio motion cue probability
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              id="audio-motion-probability"
              min={0}
              max={100}
              step={1}
              value={audioMotionProbability}
              onChange={(e) => handleAudioProbabilityChange(parseInt(e.target.value, 10))}
              onMouseUp={flushAudioProbability}
              onPointerUp={flushAudioProbability}
              onBlur={flushAudioProbability}
              className="flex-1 max-w-xs accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !motionGloballyEnabled}
            />
            <span className="text-sm text-gray-700 dark:text-gray-300 w-12 text-right tabular-nums">
              {audioMotionProbability}%
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Chance that a motion cue will play when the primary audio cue changes. At 100% a motion
            cue is always picked; at 0% motion is suppressed and fixtures return to their home
            position. Manual motion selection always plays regardless of this value.
          </p>
        </div>
        <div>
          <label
            htmlFor="motion-min-hold-ms"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Motion cue minimum hold time
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="number"
              id="motion-min-hold-ms"
              min="0"
              max="600000"
              step="100"
              value={motionMinHoldMs}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) || 0
                setMotionMinHoldMsState(Math.max(0, Math.min(600000, v)))
              }}
              onBlur={() => handleMotionMinHoldChange(motionMinHoldMs)}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isSaving || !motionGloballyEnabled}
              placeholder="5000"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">milliseconds</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Minimum time to hold a motion cue after it starts. Prevents thrashing if the lighting
            cue flip-flops very rapidly. Changes faster than this value will be ignored, and the
            next change will be used.
          </p>
        </div>
        <div>
          <label
            htmlFor="rb3-cue-group-selection-mode"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            RB3 Cue Group Selection Mode
          </label>
          <select
            id="rb3-cue-group-selection-mode"
            value={rb3SelectionMode}
            onChange={async (e) => {
              const mode = e.target.value as CueGroupSelectionMode
              if (mode !== 'oncePerSong' && mode !== 'withinSong') return
              setRb3SelectionMode(mode)
              if (isSaving) return
              try {
                setIsSaving(true)
                const result = await setRb3CueGroupSelectionMode(mode)
                if (!result.success) {
                  log.error('Failed to save RB3 cue group selection mode:', result.error)
                  setRb3SelectionMode(rb3SelectionMode)
                }
              } catch (error) {
                log.error('Failed to save RB3 cue group selection mode:', error)
                setRb3SelectionMode(rb3SelectionMode)
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
            RB3 has no cue-change signal, so the lighting group rotates on a switch timer instead.
            Within a Song: the group rotates among the enabled RB3 groups as the timer fires. Once
            Per Song: one group is picked when the song starts and held for the whole song. Applies
            to RB3 cue mode only.
          </p>
        </div>
        <div>
          <label
            htmlFor="rb3-motion-group-selection-mode"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            RB3 motion cue selection mode
          </label>
          <select
            id="rb3-motion-group-selection-mode"
            value={rb3MotionSelectionMode}
            onChange={async (e) => {
              const mode = e.target.value as MotionGroupSelectionMode
              if (mode !== 'oncePerSong' && mode !== 'perCueChange' && mode !== 'none') return
              setRb3MotionSelectionModeState(mode)
              if (isSaving) return
              try {
                setIsSaving(true)
                const result = await setRb3MotionGroupSelectionMode(mode)
                if (!result.success) {
                  log.error('Failed to save RB3 motion group selection mode:', result.error)
                  setRb3MotionSelectionModeState(rb3MotionSelectionMode)
                }
              } catch (error) {
                log.error('Failed to save RB3 motion group selection mode:', error)
                setRb3MotionSelectionModeState(rb3MotionSelectionMode)
              } finally {
                setIsSaving(false)
              }
            }}
            className="block w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isSaving || !motionGloballyEnabled}>
            <option value="perCueChange">Per Light-1 Change (on the switch timer)</option>
            <option value="oncePerSong">Once Per Song</option>
            <option value="none">No RB3 Motion Cues</option>
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            RB3 has no beat, so a new motion cue is chosen on a Light-1 state change once the switch
            timer below has elapsed.
          </p>
        </div>
        <div>
          <label
            htmlFor="rb3-motion-probability"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            RB3 motion cue probability
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              id="rb3-motion-probability"
              min={0}
              max={100}
              step={1}
              value={rb3MotionProbability}
              onChange={(e) => handleRb3ProbabilityChange(parseInt(e.target.value, 10))}
              onMouseUp={flushRb3Probability}
              onPointerUp={flushRb3Probability}
              onBlur={flushRb3Probability}
              className="flex-1 max-w-xs accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !motionGloballyEnabled}
            />
            <span className="text-sm text-gray-700 dark:text-gray-300 w-12 text-right tabular-nums">
              {rb3MotionProbability}%
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Chance that a motion cue is picked when the RB3 switch timer fires. At 0% motion is
            suppressed. Manual motion selection always plays regardless of this value.
          </p>
        </div>
        <div>
          <label
            htmlFor="rb3-motion-duration"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            RB3 motion switch timer (random range)
          </label>
          <div className="flex items-center space-x-3">
            <input
              type="number"
              id="rb3-motion-duration"
              min="0"
              max="600"
              step="1"
              value={rb3MotionDurationMin}
              onChange={(e) =>
                setRb3MotionDurationMin(
                  Math.max(0, Math.min(600, parseInt(e.target.value, 10) || 0)),
                )
              }
              onBlur={() => handleRb3DurationChange(rb3MotionDurationMin, rb3MotionDurationMax)}
              className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isSaving || !motionGloballyEnabled}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">to</span>
            <input
              type="number"
              min="0"
              max="600"
              step="1"
              value={rb3MotionDurationMax}
              onChange={(e) =>
                setRb3MotionDurationMax(
                  Math.max(0, Math.min(600, parseInt(e.target.value, 10) || 0)),
                )
              }
              onBlur={() => handleRb3DurationChange(rb3MotionDurationMin, rb3MotionDurationMax)}
              className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isSaving || !motionGloballyEnabled}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">seconds</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            The next RB3 motion switch is scheduled a random time within this range. Default 5–20s.
          </p>
        </div>
        <div>
          <label
            htmlFor="rb3-motion-min-hold-ms"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            RB3 motion cue minimum hold time
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="number"
              id="rb3-motion-min-hold-ms"
              min="0"
              max="600000"
              step="100"
              value={rb3MotionMinHoldMs}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) || 0
                setRb3MotionMinHoldMsState(Math.max(0, Math.min(600000, v)))
              }}
              onBlur={() => handleRb3MinHoldChange(rb3MotionMinHoldMs)}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isSaving || !motionGloballyEnabled}
              placeholder="5000"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">milliseconds</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Floor on how soon a switch can re-pick, independent of the switch timer above.
          </p>
        </div>
      </div>
    </div>
  )
}

export default CueConsistencySettings
