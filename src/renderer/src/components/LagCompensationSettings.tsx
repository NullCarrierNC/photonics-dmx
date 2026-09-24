import React, { useCallback, useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { lightingPrefsAtom } from '../atoms'
import { persistPrefs } from '../ipc/persistPrefs'
import { DraftNumberField } from './controls/DraftField'
import { useDebouncedSave } from '../hooks/useDebouncedSave'
import { useCommitOnRelease } from '../hooks/useCommitOnRelease'
import {
  LAG_COMPENSATION_MS_MAX,
  LAG_COMPENSATION_MS_MIN,
  normalizeLagCompensationMs,
} from '../../../shared/lagCompensation'

const INPUT_CLASS =
  'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

type LagPrefKey = 'videoLagCompensationMs' | 'audioLagCompensationMs'

interface DelayFieldProps {
  id: string
  label: string
  help: React.ReactNode
  stored: number
  /** Resolves whether the delay was stored. */
  onWrite: (ms: number) => Promise<boolean>
}

/**
 * One delay, as a slider beside the number it sets.
 *
 * Tuning means moving the value until the rig agrees with what you are watching or hearing, so the
 * slider reports every position and the write waits for the positions to stop. What is shown is the
 * position under the user's hand until a write answers, which keeps it from jumping back mid-drag.
 */
const DelayField: React.FC<DelayFieldProps> = ({ id, label, help, stored, onWrite }) => {
  // The position being dragged, before a write has answered for it. Null means the field follows
  // what is stored, so a late load of preferences still shows the right number.
  const [pending, setPending] = useState<number | null>(null)
  const shown = pending ?? stored

  const write = useCallback(
    async (ms: number): Promise<boolean> => {
      const landed = await onWrite(ms)
      // Either way the control goes back to following what is stored, so a refusal cannot leave it
      // showing a delay the main process never took. A position moved on since is left alone.
      setPending((current) => (current === ms ? null : current))
      return landed
    },
    [onWrite],
  )

  const saver = useDebouncedSave(write, { isEqual: (a, b) => a === b })

  useEffect(() => {
    saver.seed(stored)
  }, [saver, stored])

  const report = useCallback(
    (ms: number): void => {
      setPending(ms)
      saver.saveSoon(ms)
    },
    [saver],
  )

  /** A drag that has ended, or a typed entry, is written without waiting out the quiet window. */
  const commit = useCallback((): void => {
    saver.flush()
  }, [saver])
  const release = useCommitOnRelease(commit)

  return (
    <div className="mb-4">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <div className="flex items-center space-x-4">
        <input
          type="range"
          id={`${id}-slider`}
          min={LAG_COMPENSATION_MS_MIN}
          max={LAG_COMPENSATION_MS_MAX}
          step={1}
          value={shown}
          onChange={(event) => {
            report(Number(event.target.value))
            release.changed()
          }}
          {...release.props}
          aria-label={label}
          aria-describedby={`${id}-description`}
          className="flex-1 accent-blue-500"
        />
        <DraftNumberField
          id={id}
          min={LAG_COMPENSATION_MS_MIN}
          max={LAG_COMPENSATION_MS_MAX}
          step={1}
          value={shown}
          onCommit={(value) => {
            report(value)
            commit()
          }}
          aria-describedby={`${id}-description`}
          className={`w-24 ${INPUT_CLASS}`}
        />
        <span className="text-sm text-gray-600 dark:text-gray-400">milliseconds</span>
      </div>
      <p id={`${id}-description`} className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        {help}
      </p>
    </div>
  )
}

const LagCompensationSettings: React.FC = () => {
  const [prefs, setPrefs] = useAtom(lightingPrefsAtom)
  const [saveError, setSaveError] = useState<string | null>(null)
  const advancedModeEnabled = prefs.advancedModeEnabled ?? false

  /** Each field writes only its own key, so a refused save of one cannot revert the other. */
  const writeKey = useCallback(
    async (key: LagPrefKey, what: string, ms: number): Promise<boolean> => {
      setSaveError(null)
      const saved = await persistPrefs({ [key]: ms }, what, setSaveError)
      if (saved) {
        setPrefs((prev) => ({ ...prev, [key]: ms }))
      }
      return saved
    },
    [setPrefs],
  )

  const writeVideo = useCallback(
    (ms: number) => writeKey('videoLagCompensationMs', 'the game lag compensation', ms),
    [writeKey],
  )
  const writeAudio = useCallback(
    (ms: number) => writeKey('audioLagCompensationMs', 'the audio lag compensation', ms),
    [writeKey],
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600">
        Lag Compensation
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        If your physical lights seem slightly out of sync with the lights on screen, set this to
        match the calibration delay in game. Blackout, the master dimmer and the strobe gate act at
        once, so after using one the lights hold still for the delay while the show catches up.
      </p>

      <DelayField
        id="lag-compensation-video-ms"
        label="Game (YARG & RB3)"
        stored={normalizeLagCompensationMs(prefs.videoLagCompensationMs)}
        onWrite={writeVideo}
        help="A slow strobe is the easiest to see a timing offset. 0 turns it off."
      />

      {advancedModeEnabled && (
        <DelayField
          id="lag-compensation-audio-ms"
          label="Audio reactive"
          stored={normalizeLagCompensationMs(prefs.audioLagCompensationMs)}
          onWrite={writeAudio}
          help="In audio reactive mode, if the DMX effects appear slightly out of sync
          with on-screen actions, try increasing this value. 0 turns it off."
        />
      )}

      {saveError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {saveError}
        </p>
      )}
    </div>
  )
}

export default LagCompensationSettings
