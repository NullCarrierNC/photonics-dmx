import React, { useState, useEffect } from 'react'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'
import { DEFAULT_AUDIO_BANDS } from '../../../photonics-dmx/listeners/Audio/AudioConfig'
import type { AudioBandDefinition } from '../../../photonics-dmx/listeners/Audio/AudioTypes'

const AudioBandSettings: React.FC = () => {
  const [bands, setBands] = useState<AudioBandDefinition[]>(DEFAULT_AUDIO_BANDS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getAudioConfig()
        if (config?.bands && Array.isArray(config.bands) && config.bands.length === 5) {
          setBands(config.bands as AudioBandDefinition[])
        }
      } catch (error) {
        console.error('Failed to load audio band settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [])

  const handleBandChange = (index: number, updates: Partial<AudioBandDefinition>) => {
    const newBands = [...bands]
    newBands[index] = { ...newBands[index], ...updates }
    setBands(newBands)
  }

  const handleSave = async (updatedBands: AudioBandDefinition[]) => {
    if (isSaving) return

    try {
      setIsSaving(true)
      const result = await saveAudioConfig({ bands: updatedBands })
      if (!result.success) {
        console.error('Failed to save audio band settings:', result.error)
        // Revert on failure
        const config = await getAudioConfig()
        if (config?.bands && Array.isArray(config.bands) && config.bands.length === 5) {
          setBands(config.bands as AudioBandDefinition[])
        }
      }
    } catch (error) {
      console.error('Failed to save audio band settings:', error)
      // Revert on failure
      const config = await getAudioConfig()
      if (config?.bands && Array.isArray(config.bands) && config.bands.length === 5) {
        setBands(config.bands as AudioBandDefinition[])
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    setBands(DEFAULT_AUDIO_BANDS)
    await handleSave(DEFAULT_AUDIO_BANDS)
  }

  const handleNameChange = (index: number, name: string) => {
    handleBandChange(index, { name })
  }

  const handleNameBlur = (_index: number) => {
    handleSave(bands)
  }

  const handleMinHzChange = (index: number, value: number) => {
    const clamped = Math.max(20, Math.min(20000, value))
    const newBands = [...bands]
    newBands[index] = { ...newBands[index], minHz: clamped }
    // Ensure minHz < maxHz
    if (newBands[index].minHz >= newBands[index].maxHz) {
      newBands[index].maxHz = Math.min(20000, newBands[index].minHz + 1)
    }
    setBands(newBands)
  }

  const handleMinHzBlur = (_index: number) => {
    handleSave(bands)
  }

  const handleMaxHzChange = (index: number, value: number) => {
    const clamped = Math.max(20, Math.min(20000, value))
    const newBands = [...bands]
    newBands[index] = { ...newBands[index], maxHz: clamped }
    // Ensure minHz < maxHz
    if (newBands[index].minHz >= newBands[index].maxHz) {
      newBands[index].minHz = Math.max(20, newBands[index].maxHz - 1)
    }
    setBands(newBands)
  }

  const handleMaxHzBlur = (_index: number) => {
    handleSave(bands)
  }

  const handleGainChange = async (index: number, value: number) => {
    const clamped = Math.max(0.1, Math.min(5.0, value))
    handleBandChange(index, { gain: clamped })
  }

  const handleGainBlur = (_index: number) => {
    handleSave(bands)
  }

  const handleGainSliderChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    handleGainChange(index, value)
  }

  if (isLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading band settings...</div>
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Configure the frequency ranges and per-band gain multipliers. Per-band gain is applied on
        top of the global sensitivity. This allows you to adjust the sensitivity of each band, eg to
        increase the sensitivity of the upper mids and highs while lowering the sensitivity of the
        bass. Use the spectrum analyzer to see how the bands are being affected.
      </p>

      <div className="space-y-4">
        {bands.map((band, index) => (
          <div
            key={band.id}
            className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="space-y-3">
              {/* Band Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Band Name
                </label>
                <input
                  type="text"
                  value={band.name}
                  onChange={(e) => handleNameChange(index, e.target.value)}
                  onBlur={() => handleNameBlur(index)}
                  disabled={isSaving}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white disabled:opacity-50"
                />
              </div>

              {/* Frequency Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Min Hz
                  </label>
                  <input
                    type="number"
                    min="20"
                    max="20000"
                    step="1"
                    value={band.minHz}
                    onChange={(e) => handleMinHzChange(index, parseFloat(e.target.value) || 20)}
                    onBlur={() => handleMinHzBlur(index)}
                    disabled={isSaving}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Max Hz
                  </label>
                  <input
                    type="number"
                    min="20"
                    max="20000"
                    step="1"
                    value={band.maxHz}
                    onChange={(e) => handleMaxHzChange(index, parseFloat(e.target.value) || 20000)}
                    onBlur={() => handleMaxHzBlur(index)}
                    disabled={isSaving}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Gain */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Gain Multiplier
                  </label>
                  <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-right">
                    {band.gain.toFixed(1)}x
                  </span>
                </div>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={band.gain}
                    onChange={(e) => handleGainSliderChange(index, e)}
                    onMouseUp={() => handleGainBlur(index)}
                    disabled={isSaving}
                    className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((band.gain - 0.1) / (5.0 - 0.1)) * 100}%, #e5e7eb ${((band.gain - 0.1) / (5.0 - 0.1)) * 100}%, #e5e7eb 100%)`,
                    }}
                  />
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
                    onBlur={() => handleGainBlur(index)}
                    disabled={isSaving}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleReset}
          disabled={isSaving}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors">
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}

export default AudioBandSettings
