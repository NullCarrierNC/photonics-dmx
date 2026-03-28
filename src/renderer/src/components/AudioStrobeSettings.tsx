import React, { useState, useEffect } from 'react'
import type { AudioConfig } from '../../../shared/ipcTypes'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'
import { addIpcListener, removeIpcListener } from '../utils/ipcHelpers'

const AudioStrobeSettings: React.FC = () => {
  const [strobeEnabled, setStrobeEnabled] = useState(false)
  const [strobeTriggerThreshold, setStrobeTriggerThreshold] = useState(0.8)
  const [strobeProbability, setStrobeProbability] = useState(100)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const strobeOff = !strobeEnabled

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getAudioConfig()
        setStrobeEnabled(config?.strobeEnabled ?? false)
        setStrobeTriggerThreshold(config?.strobeTriggerThreshold ?? 0.8)
        setStrobeProbability(config?.strobeProbability ?? 100)
      } catch (error) {
        console.error('Failed to load strobe settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    void loadConfig()
  }, [])

  useEffect(() => {
    const onConfigUpdate = (config: AudioConfig | undefined) => {
      if (!config) return
      setStrobeEnabled(config.strobeEnabled ?? false)
      setStrobeTriggerThreshold(config.strobeTriggerThreshold ?? 0.8)
      setStrobeProbability(config.strobeProbability ?? 100)
    }
    addIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, onConfigUpdate)
    return () => removeIpcListener(RENDERER_RECEIVE.AUDIO_CONFIG_UPDATE, onConfigUpdate)
  }, [])

  const persistStrobe = async (
    updates: Partial<
      Pick<AudioConfig, 'strobeEnabled' | 'strobeTriggerThreshold' | 'strobeProbability'>
    >,
  ) => {
    if (isSaving) return
    try {
      setIsSaving(true)
      const result = await saveAudioConfig(updates)
      if (!result.success) {
        console.error('Failed to save strobe settings:', result.error)
        const config = await getAudioConfig()
        setStrobeEnabled(config?.strobeEnabled ?? false)
        setStrobeTriggerThreshold(config?.strobeTriggerThreshold ?? 0.8)
        setStrobeProbability(config?.strobeProbability ?? 100)
      }
    } catch (error) {
      console.error('Failed to save strobe settings:', error)
      const config = await getAudioConfig()
      setStrobeEnabled(config?.strobeEnabled ?? false)
      setStrobeTriggerThreshold(config?.strobeTriggerThreshold ?? 0.8)
      setStrobeProbability(config?.strobeProbability ?? 100)
    } finally {
      setIsSaving(false)
    }
  }

  const thresholdRangeStyle = {
    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${strobeTriggerThreshold * 100}%, #e5e7eb ${strobeTriggerThreshold * 100}%, #e5e7eb 100%)`,
  } as const

  const probabilityRangeStyle = {
    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${strobeProbability}%, #e5e7eb ${strobeProbability}%, #e5e7eb 100%)`,
  } as const

  const controlsDisabled = isLoading || isSaving || strobeOff

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        When enabled, a strobe cue can run on the secondary slot when total audio energy exceeds the
        threshold. Use probability to reduce how often it fires.
      </p>
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="form-checkbox h-5 w-5 rounded text-blue-600"
            checked={strobeEnabled}
            disabled={isLoading || isSaving}
            onChange={(e) => {
              const next = e.target.checked
              setStrobeEnabled(next)
              void persistStrobe({ strobeEnabled: next })
            }}
          />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Strobe enabled
          </span>
        </label>
      </div>

      <div className="space-y-1">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Strobe trigger threshold
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Normalised total energy (0–1) above which the strobe can activate.
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={thresholdRangeStyle}
            value={strobeTriggerThreshold}
            disabled={controlsDisabled}
            onChange={(e) => setStrobeTriggerThreshold(Number(e.target.value))}
            onMouseUp={() => void persistStrobe({ strobeTriggerThreshold })}
            onTouchEnd={() => void persistStrobe({ strobeTriggerThreshold })}
            onBlur={() => void persistStrobe({ strobeTriggerThreshold })}
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={strobeTriggerThreshold}
            disabled={controlsDisabled}
            onChange={(e) => {
              const value = parseFloat(e.target.value)
              if (Number.isFinite(value)) {
                setStrobeTriggerThreshold(Math.max(0, Math.min(1, value)))
              }
            }}
            onBlur={() => void persistStrobe({ strobeTriggerThreshold })}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
            aria-label="Strobe trigger threshold numeric"
          />
        </div>
      </div>

      <div className="space-y-1 mt-3">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Strobe probability
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            When the threshold is exceeded, this is the chance the strobe actually fires.
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={probabilityRangeStyle}
            value={strobeProbability}
            disabled={controlsDisabled}
            onChange={(e) => setStrobeProbability(Number(e.target.value))}
            onMouseUp={() => void persistStrobe({ strobeProbability })}
            onTouchEnd={() => void persistStrobe({ strobeProbability })}
            onBlur={() => void persistStrobe({ strobeProbability })}
          />
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={strobeProbability}
            disabled={controlsDisabled}
            onChange={(e) => {
              const value = parseFloat(e.target.value)
              if (Number.isFinite(value)) {
                setStrobeProbability(Math.max(0, Math.min(100, Math.round(value))))
              }
            }}
            onBlur={() => void persistStrobe({ strobeProbability })}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
            aria-label="Strobe probability percent"
          />
        </div>
      </div>
    </div>
  )
}

export default AudioStrobeSettings
