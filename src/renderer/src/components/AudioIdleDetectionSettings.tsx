import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioConfig, AudioGameModeConfig } from '../../../shared/ipcTypes'
import type { Brightness, Color } from '../../../photonics-dmx/types'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getAudioConfig, saveAudioConfig, getAudioGameMode } from '../ipcApi'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'
import { DEFAULT_AUDIO_IDLE_DETECTION } from '../../../photonics-dmx/listeners/Audio/AudioConfig'

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

const THRESHOLD_PERSIST_DEBOUNCE_MS = 300

const AudioIdleDetectionSettings: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [gameModeEnabled, setGameModeEnabled] = useState(false)
  const [idleEnabled, setIdleEnabled] = useState(DEFAULT_AUDIO_IDLE_DETECTION.enabled)
  const [thresholdPct, setThresholdPct] = useState(DEFAULT_AUDIO_IDLE_DETECTION.thresholdPct)
  const [minIdleSeconds, setMinIdleSeconds] = useState(DEFAULT_AUDIO_IDLE_DETECTION.minIdleSeconds)
  const [resumeSeconds, setResumeSeconds] = useState(DEFAULT_AUDIO_IDLE_DETECTION.resumeSeconds)
  const [idleColor, setIdleColor] = useState<Color>(DEFAULT_AUDIO_IDLE_DETECTION.idleColor)
  const [idleBrightness, setIdleBrightness] = useState<Brightness>(
    DEFAULT_AUDIO_IDLE_DETECTION.idleBrightness,
  )

  const thresholdPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyIdleFromConfig = useCallback((config: AudioConfig | undefined) => {
    if (!config?.idleDetection) return
    const id = config.idleDetection
    setIdleEnabled(id.enabled)
    setThresholdPct(id.thresholdPct)
    setMinIdleSeconds(id.minIdleSeconds)
    setResumeSeconds(id.resumeSeconds)
    setIdleColor(id.idleColor)
    setIdleBrightness(id.idleBrightness)
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const [audioCfg, gm] = await Promise.all([getAudioConfig(), getAudioGameMode()])
        applyIdleFromConfig(audioCfg)
        setGameModeEnabled(gm.enabled)
      } catch (e) {
        console.error('Failed to load idle detection settings', e)
      } finally {
        setLoading(false)
      }
    }
    void load()

    const onAudio = (config: AudioConfig | undefined) => applyIdleFromConfig(config)
    const onGm = (cfg: AudioGameModeConfig) => setGameModeEnabled(cfg.enabled)
    addIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, onAudio)
    addIpcListener(RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE, onGm)
    return () => {
      removeIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, onAudio)
      removeIpcListener(RENDERER_RECEIVE.AUDIO_GAME_MODE_UPDATE, onGm)
    }
  }, [applyIdleFromConfig])

  const persist = useCallback(
    async (patch: Partial<AudioConfig['idleDetection']>) => {
      if (saving) return
      setSaving(true)
      try {
        const base = await getAudioConfig()
        const merged = {
          ...(base?.idleDetection ?? DEFAULT_AUDIO_IDLE_DETECTION),
          ...patch,
        }
        const result = await saveAudioConfig({ idleDetection: merged })
        if (!result.success) {
          console.error('Failed to save idle detection:', result.error)
          const cfg = await getAudioConfig()
          applyIdleFromConfig(cfg)
        }
      } catch (e) {
        console.error('Failed to save idle detection', e)
        const cfg = await getAudioConfig()
        applyIdleFromConfig(cfg)
      } finally {
        setSaving(false)
      }
    },
    [saving, applyIdleFromConfig],
  )

  const schedulePersistThreshold = useCallback(
    (v: number) => {
      if (thresholdPersistTimerRef.current !== null) {
        clearTimeout(thresholdPersistTimerRef.current)
      }
      thresholdPersistTimerRef.current = setTimeout(() => {
        thresholdPersistTimerRef.current = null
        void persist({ thresholdPct: v })
      }, THRESHOLD_PERSIST_DEBOUNCE_MS)
    },
    [persist],
  )

  useEffect(() => {
    if (!idleEnabled && thresholdPersistTimerRef.current !== null) {
      clearTimeout(thresholdPersistTimerRef.current)
      thresholdPersistTimerRef.current = null
    }
  }, [idleEnabled])

  useEffect(() => {
    return () => {
      if (thresholdPersistTimerRef.current !== null) {
        clearTimeout(thresholdPersistTimerRef.current)
        thresholdPersistTimerRef.current = null
      }
    }
  }, [])

  if (loading) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">Loading idle detection…</p>
  }

  const disabled = saving

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
          checked={idleEnabled}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.checked
            setIdleEnabled(v)
            void persist({ enabled: v })
          }}
        />
        <label
          htmlFor="idle-detection-enabled"
          className="text-sm text-gray-800 dark:text-gray-200">
          Enable idle / menu detection
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Minimum overall energy threshold ({thresholdPct}%)
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          className="w-full max-w-md h-2 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          value={thresholdPct}
          disabled={disabled || !idleEnabled}
          onChange={(e) => {
            const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value))))
            setThresholdPct(v)
            schedulePersistThreshold(v)
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Minimum low-energy time (seconds)
          </label>
          <input
            type="number"
            min={0}
            max={600}
            step={1}
            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
            value={minIdleSeconds}
            disabled={disabled || !idleEnabled}
            onChange={(e) => setMinIdleSeconds(Number(e.target.value))}
            onBlur={() => {
              const v = Math.max(0, Math.min(600, Math.round(minIdleSeconds)))
              setMinIdleSeconds(v)
              void persist({ minIdleSeconds: v })
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Resume time (seconds)
          </label>
          <input
            type="number"
            min={0}
            max={60}
            step={1}
            className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:text-gray-200"
            value={resumeSeconds}
            disabled={disabled || !idleEnabled}
            onChange={(e) => setResumeSeconds(Number(e.target.value))}
            onBlur={() => {
              const v = Math.max(0, Math.min(60, Math.round(resumeSeconds)))
              setResumeSeconds(v)
              void persist({ resumeSeconds: v })
            }}
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
            value={idleColor}
            disabled={disabled || !idleEnabled}
            onChange={(e) => {
              const v = e.target.value as Color
              setIdleColor(v)
              void persist({ idleColor: v })
            }}>
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
            value={idleBrightness}
            disabled={disabled || !idleEnabled}
            onChange={(e) => {
              const v = e.target.value as Brightness
              setIdleBrightness(v)
              void persist({ idleBrightness: v })
            }}>
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
