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
import {
  BoundedNumberField,
  ProbabilitySlider,
  SelectionModeField,
} from './CueConsistencySettings/fields'
import { useProbabilitySaver } from './CueConsistencySettings/useProbabilitySaver'
import { DraftNumberField } from './controls/DraftField'
import { createLogger } from '../../../shared/logger'
import {
  CUE_CONSISTENCY_WINDOW_MS_MAX,
  CUE_CONSISTENCY_WINDOW_MS_MIN,
  clampCueConsistencyWindowMs,
} from '../../../shared/cueConsistencyWindow'

const log = createLogger('CueConsistencySettings')

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
  /** The window the main process last confirmed, which a refused write falls back to. */
  const savedConsistencyWindow = useRef(10000)
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
  // Writes run one at a time in the order they were asked for, so a change made while another
  // field is saving still reaches main once that save lands.
  const writes = useRef<Promise<unknown>>(Promise.resolve())
  const [pendingWrites, setPendingWrites] = useState(0)
  const isSaving = pendingWrites > 0

  const queueWrite = useCallback((write: () => Promise<void>): Promise<void> => {
    setPendingWrites((count) => count + 1)
    const run = writes.current.then(write).finally(() => setPendingWrites((count) => count - 1))
    writes.current = run.catch(() => undefined)
    return run
  }, [])

  const yargProbability = useProbabilitySaver(
    setMotionCueProbabilityPercent,
    getMotionCueProbabilityPercent,
    setYargMotionProbability,
    'YARG motion probability',
  )
  const audioProbability = useProbabilitySaver(
    setAudioMotionCueProbabilityPercent,
    getAudioMotionCueProbabilityPercent,
    setAudioMotionProbability,
    'audio motion probability',
  )
  const rb3Probability = useProbabilitySaver(
    setRb3MotionCueProbabilityPercent,
    getRb3MotionCueProbabilityPercent,
    setRb3MotionProbability,
    'RB3 motion probability',
  )
  const { seed: seedYargProbability } = yargProbability
  const { seed: seedAudioProbability } = audioProbability
  const { seed: seedRb3Probability } = rb3Probability

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
        if (windowResult.success) {
          setConsistencyWindow(windowResult.windowMs)
          savedConsistencyWindow.current = windowResult.windowMs
        }
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
          seedYargProbability(yargProbabilityResult.percent)
        }
        if (
          audioProbabilityResult?.success === true &&
          typeof audioProbabilityResult.percent === 'number'
        ) {
          setAudioMotionProbability(audioProbabilityResult.percent)
          seedAudioProbability(audioProbabilityResult.percent)
        }
        if (rb3MotionResult?.success === true && rb3MotionResult.mode) {
          setRb3MotionSelectionModeState(rb3MotionResult.mode)
        }
        if (
          rb3ProbabilityResult?.success === true &&
          typeof rb3ProbabilityResult.percent === 'number'
        ) {
          setRb3MotionProbability(rb3ProbabilityResult.percent)
          seedRb3Probability(rb3ProbabilityResult.percent)
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

    void load()
  }, [seedYargProbability, seedAudioProbability, seedRb3Probability])

  const handleConsistencyWindowChange = useCallback(
    (value: number) => {
      const newValue = clampCueConsistencyWindowMs(value)
      setConsistencyWindow(newValue)

      return queueWrite(async () => {
        try {
          const result = await setCueConsistencyWindow(newValue)
          if (result.success) {
            setConsistencyWindow(result.windowMs)
            savedConsistencyWindow.current = result.windowMs
          } else {
            log.error('Failed to save consistency window:', result.error)
            setConsistencyWindow(savedConsistencyWindow.current)
          }
        } catch (error) {
          log.error('Failed to save consistency window:', error)
          setConsistencyWindow(savedConsistencyWindow.current)
        }
      })
    },
    [queueWrite],
  )

  /**
   * Applies a chosen mode, saves it once any write before it has landed, and puts the previous one
   * back when the save is refused.
   */
  function saveMode<T extends string>(
    next: T,
    previous: T,
    apply: (value: T) => void,
    save: (value: T) => Promise<{ success: boolean; error?: string }>,
    what: string,
  ): Promise<void> {
    apply(next)
    return queueWrite(async () => {
      try {
        const result = await save(next)
        if (result.success) {
          apply(next)
        } else {
          log.error(`Failed to save ${what}:`, result.error)
          apply(previous)
        }
      } catch (error) {
        log.error(`Failed to save ${what}:`, error)
        apply(previous)
      }
    })
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0
    // Only update the local state immediately, don't save on every keystroke
    setConsistencyWindow(clampCueConsistencyWindowMs(value))
  }

  /** Saves when the user finishes editing, rather than on every keystroke. */
  const handleInputBlur = async (): Promise<void> => {
    await handleConsistencyWindowChange(consistencyWindow)
  }

  const handleMotionMinHoldChange = useCallback(
    (value: number) => {
      const newValue = Math.max(0, Math.min(600000, value))
      setMotionMinHoldMsState(newValue)
      return queueWrite(async () => {
        try {
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
          try {
            const reload = await getMotionCueMinHoldMs()
            if (reload.success && typeof reload.minHoldMs === 'number') {
              setMotionMinHoldMsState(reload.minHoldMs)
            }
          } catch (reloadError) {
            log.error('Failed to re-read motion min hold:', reloadError)
          }
        }
      })
    },
    [queueWrite],
  )

  const handleRb3MinHoldChange = useCallback(
    (value: number) => {
      const newValue = Math.max(0, Math.min(600000, value))
      setRb3MotionMinHoldMsState(newValue)
      return queueWrite(async () => {
        try {
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
        }
      })
    },
    [queueWrite],
  )

  const handleRb3DurationChange = useCallback(
    (min: number, max: number) => {
      const range = { min: Math.max(0, Math.min(600, min)), max: Math.max(0, Math.min(600, max)) }
      return queueWrite(async () => {
        try {
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
        }
      })
    },
    [queueWrite],
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Cue Consistency Settings
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        A cue that keeps playing always stays on the group it was given. The consistency window
        decides what happens when a cue comes back after another one. I.e. if Cue A came from Group
        B, Cue A called again within this window uses Group B&apos;s version again, and after the
        window a new group is picked. With &quot;Once Per Song&quot;, the cue group is chosen when
        the song starts and stays fixed for the entire song.
      </p>

      <div className="space-y-4">
        <SelectionModeField
          id="cue-group-selection-mode"
          label="Cue Group Selection Mode"
          value={selectionMode}
          options={[
            { value: 'withinSong', label: 'Within a Song' },
            { value: 'oncePerSong', label: 'Once Per Song' },
          ]}
          help="Within a Song: the cue group can change among enabled groups during the song (subject to the consistency window). Once Per Song: the group is chosen when the song starts and remains fixed for that song."
          disabled={isLoading || isSaving}
          onChange={(mode) =>
            void saveMode(
              mode as CueGroupSelectionMode,
              selectionMode,
              setSelectionMode,
              setCueGroupSelectionMode,
              'cue group selection mode',
            )
          }
        />
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
              min={CUE_CONSISTENCY_WINDOW_MS_MIN}
              max={CUE_CONSISTENCY_WINDOW_MS_MAX}
              step="100"
              value={consistencyWindow}
              onChange={handleInputChange}
              onBlur={() => void handleInputBlur()}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isSaving}
              placeholder="10000"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">milliseconds</span>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Set to 0 to pick a new group every time a cue comes back. Default is 10000ms (10
            seconds). Maximum is 300000ms (5 minutes).
          </p>
        </div>
        <SelectionModeField
          id="yarg-motion-group-selection-mode"
          label="YARG motion cue selection mode"
          value={yargMotionSelectionMode}
          options={[
            { value: 'perCueChange', label: 'Per Lighting Cue Change' },
            { value: 'oncePerSong', label: 'Once Per Song' },
            { value: 'none', label: 'No Motion Cues' },
          ]}
          help="Controls when a new motion cue is triggered in YARG mode."
          disabled={isLoading || isSaving || !motionGloballyEnabled}
          onChange={(mode) =>
            void saveMode(
              mode as MotionGroupSelectionMode,
              yargMotionSelectionMode,
              setYargMotionSelectionModeState,
              setYargMotionGroupSelectionMode,
              'YARG motion group selection mode',
            )
          }
        />
        <SelectionModeField
          id="audio-motion-group-selection-mode"
          label="Audio motion cue selection mode"
          value={audioMotionSelectionMode}
          options={[
            { value: 'perCueChange', label: 'Per Lighting Cue Change' },
            { value: 'oncePerSong', label: 'Once Per Song' },
            { value: 'none', label: 'No Audio Motion Cues' },
          ]}
          help="Controls when a new motion cue is triggered in audio mode."
          disabled={isLoading || isSaving || !motionGloballyEnabled}
          onChange={(mode) =>
            void saveMode(
              mode as MotionGroupSelectionMode,
              audioMotionSelectionMode,
              setAudioMotionSelectionModeState,
              setAudioMotionGroupSelectionMode,
              'audio motion group selection mode',
            )
          }
        />
        <ProbabilitySlider
          id="yarg-motion-probability"
          label="YARG motion cue probability"
          value={yargMotionProbability}
          help="Chance that a motion cue will play when a new YARG lighting cue starts. At 100% a motion cue is always picked; at 0% motion is suppressed and fixtures return to their home position. Manual motion selection always plays regardless of this value."
          disabled={isLoading || !motionGloballyEnabled}
          onChange={yargProbability.onChange}
          onCommit={yargProbability.onCommit}
        />
        <ProbabilitySlider
          id="audio-motion-probability"
          label="Audio motion cue probability"
          value={audioMotionProbability}
          help="Chance that a motion cue will play when the primary audio cue changes. At 100% a motion cue is always picked; at 0% motion is suppressed and fixtures return to their home position. Manual motion selection always plays regardless of this value."
          disabled={isLoading || !motionGloballyEnabled}
          onChange={audioProbability.onChange}
          onCommit={audioProbability.onCommit}
        />
        <BoundedNumberField
          id="motion-min-hold-ms"
          label="Motion cue minimum hold time"
          value={motionMinHoldMs}
          min={0}
          max={600000}
          step={100}
          unit="milliseconds"
          placeholder="5000"
          help="Minimum time to hold a motion cue after it starts. Prevents thrashing if the lighting cue flip-flops very rapidly. Changes faster than this value will be ignored, and the next change will be used."
          disabled={isLoading || isSaving || !motionGloballyEnabled}
          onCommit={(value) => void handleMotionMinHoldChange(value)}
        />
        <SelectionModeField
          id="rb3-cue-group-selection-mode"
          label="RB3 Cue Group Selection Mode"
          value={rb3SelectionMode}
          options={[
            { value: 'withinSong', label: 'Within a Song' },
            { value: 'oncePerSong', label: 'Once Per Song' },
          ]}
          help="RB3 has no cue-change signal, so the lighting group rotates on a switch timer instead. Within a Song: the group rotates among the enabled RB3 groups as the timer fires. Once Per Song: one group is picked when the song starts and held for the whole song. Applies to RB3 cue mode only."
          disabled={isLoading || isSaving}
          onChange={(mode) =>
            void saveMode(
              mode as CueGroupSelectionMode,
              rb3SelectionMode,
              setRb3SelectionMode,
              setRb3CueGroupSelectionMode,
              'RB3 cue group selection mode',
            )
          }
        />
        <SelectionModeField
          id="rb3-motion-group-selection-mode"
          label="RB3 motion cue selection mode"
          value={rb3MotionSelectionMode}
          options={[
            { value: 'perCueChange', label: 'Per Light-1 Change (on the switch timer)' },
            { value: 'oncePerSong', label: 'Once Per Song' },
            { value: 'none', label: 'No RB3 Motion Cues' },
          ]}
          help="RB3 has no beat, so a new motion cue is chosen on a Light-1 state change once the switch timer below has elapsed."
          disabled={isLoading || isSaving || !motionGloballyEnabled}
          onChange={(mode) =>
            void saveMode(
              mode as MotionGroupSelectionMode,
              rb3MotionSelectionMode,
              setRb3MotionSelectionModeState,
              setRb3MotionGroupSelectionMode,
              'RB3 motion group selection mode',
            )
          }
        />
        <ProbabilitySlider
          id="rb3-motion-probability"
          label="RB3 motion cue probability"
          value={rb3MotionProbability}
          help="Chance that a motion cue is picked when the RB3 switch timer fires. At 0% motion is suppressed. Manual motion selection always plays regardless of this value."
          disabled={isLoading || !motionGloballyEnabled}
          onChange={rb3Probability.onChange}
          onCommit={rb3Probability.onCommit}
        />
        <div>
          <label
            htmlFor="rb3-motion-duration"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            RB3 motion switch timer (random range)
          </label>
          <div className="flex items-center space-x-3">
            <DraftNumberField
              id="rb3-motion-duration"
              min={0}
              max={600}
              step={1}
              value={rb3MotionDurationMin}
              onCommit={(value) => {
                setRb3MotionDurationMin(value)
                void handleRb3DurationChange(value, rb3MotionDurationMax)
              }}
              className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isSaving || !motionGloballyEnabled}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">to</span>
            <DraftNumberField
              aria-label="RB3 motion switch timer upper bound"
              min={0}
              max={600}
              step={1}
              value={rb3MotionDurationMax}
              onCommit={(value) => {
                setRb3MotionDurationMax(value)
                void handleRb3DurationChange(rb3MotionDurationMin, value)
              }}
              className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isSaving || !motionGloballyEnabled}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">seconds</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            The next RB3 motion switch is scheduled a random time within this range. Default 5–20s.
          </p>
        </div>
        <BoundedNumberField
          id="rb3-motion-min-hold-ms"
          label="RB3 motion cue minimum hold time"
          value={rb3MotionMinHoldMs}
          min={0}
          max={600000}
          step={100}
          unit="milliseconds"
          placeholder="5000"
          help="Floor on how soon a switch can re-pick, independent of the switch timer above."
          disabled={isLoading || isSaving || !motionGloballyEnabled}
          onCommit={(value) => void handleRb3MinHoldChange(value)}
        />
      </div>
    </div>
  )
}

export default CueConsistencySettings
