import React, { useEffect, useState } from 'react'
import type { AudioGameModeConfig } from '../../../shared/ipcTypes'
import type { Brightness, Color } from '../../../photonics-dmx/types'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getAudioGameMode } from '../ipcApi'
import { registerIpcListener } from '../utils/ipcHelpers'
import { DEFAULT_AUDIO_IDLE_DETECTION } from '../../../photonics-dmx/listeners/Audio/AudioConfig'
import { useAudioConfigFields } from '../hooks/useAudioConfigFields'
import { useCommitOnRelease } from '../hooks/useCommitOnRelease'
import { DraftNumberField } from './controls/DraftField'
import { createLogger } from '../../../shared/logger'
const log = createLogger('AudioIdleDetectionSettings')

const COLORS: Color[] = [
  'red',
  'blue',
  'yellow',
  'green',
  'cyan',
  'orange',
  'purple',
  'chartreuse',
  'teal',
  'violet',
  'magenta',
  'vermilion',
  'amber',
  'white',
  'black',
  'transparent',
]

const BRIGHTNESS: Brightness[] = ['low', 'medium', 'high', 'max', 'linear']

const AudioIdleDetectionSettings: React.FC = () => {
  const audio = useAudioConfigFields({ idleDetection: DEFAULT_AUDIO_IDLE_DETECTION })
  const idle = audio.values.idleDetection
  const [gameModeEnabled, setGameModeEnabled] = useState(false)

  // Game mode lives outside the audio config and gates this whole section.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const gm = await getAudioGameMode()
        if (!cancelled) setGameModeEnabled(gm.enabled)
      } catch (e) {
        log.error('Failed to load game mode', e)
      }
    })()
    const stop = registerIpcListener(RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE, (cfg) =>
      setGameModeEnabled((cfg as AudioGameModeConfig).enabled),
    )
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  const write = (patch: Partial<typeof idle>): void => {
    void audio.save({ idleDetection: { ...idle, ...patch } })
  }
  const thresholdRelease = useCommitOnRelease(() => void audio.commit())

  if (!audio.loaded) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">Loading idle detection…</p>
  }

  const disabled = audio.isSaving
  const fieldsDisabled = disabled || !idle.enabled

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        When in game mode, if the audio level drops below the threshold for the minimum idle time,
        the lights will enter idle mode.
      </p>
      {!gameModeEnabled && (
        <p className="text-sm text-amber-700 dark:text-amber-300 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2">
          Enable Game Mode in Audio-Reactive Lighting above to use idle detection.
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          id="idle-detection-enabled"
          type="checkbox"
          checked={idle.enabled}
          disabled={disabled}
          onChange={(e) => write({ enabled: e.target.checked })}
        />
        <label
          htmlFor="idle-detection-enabled"
          className="text-sm text-gray-800 dark:text-gray-200">
          Enable idle / menu detection
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Minimum overall energy threshold ({idle.thresholdPct}%)
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          className="w-full max-w-md h-2 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          value={idle.thresholdPct}
          disabled={fieldsDisabled}
          onChange={(e) => {
            audio.set({
              idleDetection: {
                ...idle,
                thresholdPct: Math.max(0, Math.min(100, Math.round(Number(e.target.value)))),
              },
            })
            thresholdRelease.changed()
          }}
          {...thresholdRelease.props}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="idle-min-seconds"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Minimum low-energy time (seconds)
          </label>
          <DraftNumberField
            id="idle-min-seconds"
            min={0}
            max={600}
            step={1}
            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
            value={idle.minIdleSeconds}
            disabled={fieldsDisabled}
            onCommit={(minIdleSeconds) => write({ minIdleSeconds })}
          />
        </div>
        <div>
          <label
            htmlFor="idle-resume-seconds"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Resume time (seconds)
          </label>
          <DraftNumberField
            id="idle-resume-seconds"
            min={0}
            max={60}
            step={1}
            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
            value={idle.resumeSeconds}
            disabled={fieldsDisabled}
            onCommit={(resumeSeconds) => write({ resumeSeconds })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Idle colour
          </label>
          <select
            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
            value={idle.idleColor}
            disabled={fieldsDisabled}
            onChange={(e) => write({ idleColor: e.target.value as Color })}>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Idle brightness
          </label>
          <select
            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
            value={idle.idleBrightness}
            disabled={fieldsDisabled}
            onChange={(e) => write({ idleBrightness: e.target.value as Brightness })}>
            {BRIGHTNESS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

export default AudioIdleDetectionSettings
