import React, { useState, useEffect } from 'react'
import { getAudioConfig, saveAudioConfig } from '../ipcApi'

const AudioBeatDetection: React.FC = () => {
  const [threshold, setThreshold] = useState(0.3)
  const [decayRate, setDecayRate] = useState(0.95)
  const [minInterval, setMinInterval] = useState(100)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const config = await getAudioConfig()
        if (config?.beatDetection) {
          setThreshold(config.beatDetection.threshold || 0.3)
          setDecayRate(config.beatDetection.decayRate || 0.95)
          setMinInterval(config.beatDetection.minInterval || 100)
        }
      } catch (error) {
        console.error('Failed to load beat detection settings:', error)
      }
    }

    loadSettings()
  }, [])

  const handleSave = async (
    updates: Partial<{ threshold: number; decayRate: number; minInterval: number }>,
  ) => {
    setIsSaving(true)

    try {
      const beatDetection = {
        threshold: updates.threshold !== undefined ? updates.threshold : threshold,
        decayRate: updates.decayRate !== undefined ? updates.decayRate : decayRate,
        minInterval: updates.minInterval !== undefined ? updates.minInterval : minInterval,
      }

      await saveAudioConfig({ beatDetection })
    } catch (error) {
      console.error('Failed to save beat detection settings:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Configure how beats (bass kicks, snare hits) are detected. Lower threshold = more sensitive,
        higher = less sensitive.
      </p>

      {/* Threshold */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Detection Threshold
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Lower values detect more beats (0.1 = very sensitive, 1.0 = less sensitive)
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-right">
              {threshold.toFixed(2)}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">/ 1.0</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            onMouseUp={() => handleSave({ threshold })}
            onTouchEnd={() => handleSave({ threshold })}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((threshold - 0.1) / (1.0 - 0.1)) * 100}%, #e5e7eb ${((threshold - 0.1) / (1.0 - 0.1)) * 100}%, #e5e7eb 100%)`,
            }}
          />

          <input
            type="number"
            min="0.1"
            max="1.0"
            step="0.05"
            value={threshold}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0.1
              setThreshold(Math.max(0.1, Math.min(1.0, value)))
            }}
            onBlur={() => handleSave({ threshold })}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
          />
        </div>
      </div>

      {/* Decay Rate */}
      <div className="space-y-1 mt-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Decay Rate
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              How quickly the energy threshold adapts (0.80 = fast adaptation, 0.99 = slow
              adaptation)
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-right">
              {decayRate.toFixed(2)}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">/ 0.99</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <input
            type="range"
            min="0.80"
            max="0.99"
            step="0.01"
            value={decayRate}
            onChange={(e) => setDecayRate(parseFloat(e.target.value))}
            onMouseUp={() => handleSave({ decayRate })}
            onTouchEnd={() => handleSave({ decayRate })}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((decayRate - 0.8) / (0.99 - 0.8)) * 100}%, #e5e7eb ${((decayRate - 0.8) / (0.99 - 0.8)) * 100}%, #e5e7eb 100%)`,
            }}
          />

          <input
            type="number"
            min="0.80"
            max="0.99"
            step="0.01"
            value={decayRate}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0.8
              setDecayRate(Math.max(0.8, Math.min(0.99, value)))
            }}
            onBlur={() => handleSave({ decayRate })}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
          />
        </div>
      </div>

      {/* Min Interval */}
      <div className="space-y-1 mt-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Minimum Beat Interval
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Minimum time between detected beats (prevents rapid re-triggering)
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-right">
              {minInterval}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">/ 500ms</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <input
            type="range"
            min="50"
            max="500"
            step="10"
            value={minInterval}
            onChange={(e) => setMinInterval(parseInt(e.target.value))}
            onMouseUp={() => handleSave({ minInterval })}
            onTouchEnd={() => handleSave({ minInterval })}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((minInterval - 50) / (500 - 50)) * 100}%, #e5e7eb ${((minInterval - 50) / (500 - 50)) * 100}%, #e5e7eb 100%)`,
            }}
          />

          <input
            type="number"
            min="50"
            max="500"
            step="10"
            value={minInterval}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 50
              setMinInterval(Math.max(50, Math.min(500, value)))
            }}
            onBlur={() => handleSave({ minInterval })}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
          />
        </div>
      </div>

      {isSaving && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Saving...</p>}
    </div>
  )
}

export default AudioBeatDetection
