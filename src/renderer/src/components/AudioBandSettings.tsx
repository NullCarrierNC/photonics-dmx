import React, { useState, useEffect, useMemo } from 'react'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'
import { DEFAULT_AUDIO_BANDS } from '../../../photonics-dmx/listeners/Audio/AudioConfig'
import {
  AUDIO_BAND_PRESETS,
  clonePresetBands,
  matchAudioBandPresetId,
  type AudioBandPresetId,
} from '../../../photonics-dmx/listeners/Audio/AudioBandPresets'
import type { AudioBandDefinition } from '../../../photonics-dmx/listeners/Audio/AudioTypes'

const PRESET_OPTIONS = AUDIO_BAND_PRESETS.map((p) => ({ id: p.id, label: p.label }))

function isValidEightBandList(bands: unknown): bands is AudioBandDefinition[] {
  return Array.isArray(bands) && bands.length === 8
}

const AudioBandSettings: React.FC = () => {
  const [bands, setBands] = useState<AudioBandDefinition[]>(DEFAULT_AUDIO_BANDS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const matchedPresetId = useMemo(() => matchAudioBandPresetId(bands), [bands])

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getAudioConfig()
        if (config?.bands && isValidEightBandList(config.bands)) {
          setBands(config.bands.map((b) => ({ ...b })))
        }
      } catch (error) {
        console.error('Failed to load audio band settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [])

  const handleSave = async (updatedBands: AudioBandDefinition[]) => {
    if (isSaving) return

    try {
      setIsSaving(true)
      const result = await saveAudioConfig({ bands: updatedBands })
      if (!result.success) {
        console.error('Failed to save audio band settings:', result.error)
        const config = await getAudioConfig()
        if (config?.bands && isValidEightBandList(config.bands)) {
          setBands(config.bands.map((b) => ({ ...b })))
        }
      }
    } catch (error) {
      console.error('Failed to save audio band settings:', error)
      const config = await getAudioConfig()
      if (config?.bands && isValidEightBandList(config.bands)) {
        setBands(config.bands.map((b) => ({ ...b })))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handlePresetChange = async (presetId: AudioBandPresetId) => {
    const next = clonePresetBands(presetId)
    setBands(next)
    await handleSave(next)
  }

  const handleGainChange = (index: number, value: number) => {
    const clamped = Math.max(0.1, Math.min(5.0, value))
    const newBands = bands.map((b, i) => (i === index ? { ...b, gain: clamped } : b))
    setBands(newBands)
  }

  const handleGainBlur = () => {
    handleSave(bands)
  }

  const handleGainSliderChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    handleGainChange(index, value)
  }

  const handleResetGains = async () => {
    const next = bands.map((b) => ({ ...b, gain: 1.0 }))
    setBands(next)
    await handleSave(next)
  }

  const handleResetToShippedDefault = async () => {
    const next = clonePresetBands('rhythm-game')
    setBands(next)
    await handleSave(next)
  }

  if (isLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading band settings...</div>
  }

  const selectValue: AudioBandPresetId | 'custom' = matchedPresetId ?? 'custom'

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        For the best compatibility with the cue library, it&apos;s recommended you leave the
        Frequency Bands preset set to Rhythm Game.
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        The gain multiplier will let you increase or decrease the sensitivity of each band. This is
        useful if your mic is not as sensitive across all frequencies. Use the spectrum analyzer to
        tune gains — you don&apos;t want bands constantly peaking.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {/* Narrow column: ~half the width of a 50% flex column (select stays visually half-width vs old layout) */}
        <div className="w-full sm:w-1/4 sm:flex-shrink-0 sm:min-w-0">
          <label
            htmlFor="audio-band-preset"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Preset
          </label>
          <select
            id="audio-band-preset"
            value={selectValue}
            disabled={isSaving}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'custom') return
              void handlePresetChange(v as AudioBandPresetId)
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
            {matchedPresetId === null && (
              <option value="custom" disabled>
                Custom (unmatched Hz layout)
              </option>
            )}
            {PRESET_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {/* Flex column stretches to row height on sm+; items-center vertically centers the copy next to the preset control */}
        <div className="flex min-h-0 flex-1 items-center">
          <p className="text-xs text-gray-500 dark:text-gray-400 min-w-0">
            {matchedPresetId
              ? AUDIO_BAND_PRESETS.find((p) => p.id === matchedPresetId)?.description ?? ''
              : 'Saved band boundaries do not match a known preset. Select a preset to replace them.'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {bands.map((band, index) => (
          <div
            key={band.id}
            className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="mb-2">
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {band.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                  {band.minHz}–
                  {band.maxHz >= 1000 ? `${(band.maxHz / 1000).toFixed(1)}k` : band.maxHz}
                  Hz
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label
                className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap shrink-0 sm:pt-0.5"
                htmlFor={`audio-band-gain-${band.id}`}>
                Gain multiplier
              </label>
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <input
                  id={`audio-band-gain-${band.id}`}
                  type="range"
                  min="0.1"
                  max="5.0"
                  step="0.1"
                  value={band.gain}
                  onChange={(e) => handleGainSliderChange(index, e)}
                  onMouseUp={() => handleGainBlur()}
                  disabled={isSaving}
                  aria-label={`${band.name} gain multiplier`}
                  className="flex-1 min-w-0 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((band.gain - 0.1) / (5.0 - 0.1)) * 100}%, #e5e7eb ${((band.gain - 0.1) / (5.0 - 0.1)) * 100}%, #e5e7eb 100%)`,
                  }}
                />
                <span className="text-sm text-gray-600 dark:text-gray-400 font-mono shrink-0 w-12 text-right tabular-nums">
                  {band.gain.toFixed(1)}x
                </span>
                <input
                  type="number"
                  min="0.1"
                  max="5.0"
                  step="0.1"
                  value={band.gain}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0.1
                    handleGainChange(index, Math.max(0.1, Math.min(5.0, value)))
                  }}
                  onBlur={() => handleGainBlur()}
                  disabled={isSaving}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center disabled:opacity-50 shrink-0"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => void handleResetGains()}
          disabled={isSaving}
          className="px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 rounded-md transition-colors">
          Reset gains to 1.0x
        </button>
        <button
          type="button"
          onClick={() => void handleResetToShippedDefault()}
          disabled={isSaving}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors">
          Reset to Rhythm Game preset
        </button>
      </div>
    </div>
  )
}

export default AudioBandSettings
