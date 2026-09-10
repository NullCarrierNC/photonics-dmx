import React from 'react'
import { useAudioConfigFields } from '../hooks/useAudioConfigFields'

const AudioBeatDetection: React.FC = () => {
  const audio = useAudioConfigFields({
    beatDetection: { threshold: 0.3, decayRate: 0.8, minInterval: 100 },
  })
  const { threshold, decayRate, minInterval } = audio.values.beatDetection
  const isSaving = audio.isSaving

  /** Update one field locally, for controls that commit on release. */
  const setField = (patch: Partial<typeof audio.values.beatDetection>): void => {
    audio.set({ beatDetection: { ...audio.values.beatDetection, ...patch } })
  }

  const setThreshold = (value: number): void => setField({ threshold: value })
  const setDecayRate = (value: number): void => setField({ decayRate: value })
  const setMinInterval = (value: number): void => setField({ minInterval: value })

  const handleSave = (): void => {
    void audio.commit()
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Configure how beats (bass kicks, snare hits) are detected. Lower threshold = more sensitive,
        higher = less sensitive.
      </p>

      {/* Threshold */}
      <div className="space-y-1">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Detection Threshold
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Lower values detect more beats (0.1 = very sensitive, 1.0 = less sensitive)
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            onMouseUp={() => handleSave()}
            onTouchEnd={() => handleSave()}
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
            onBlur={() => handleSave()}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
          />
        </div>
      </div>

      {/* Decay Rate */}
      <div className="space-y-1 mt-3">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Decay Rate</label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            How quickly the energy threshold adapts (0.80 = fast adaptation, 0.99 = slow adaptation)
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <input
            type="range"
            min="0.80"
            max="0.99"
            step="0.01"
            value={decayRate}
            onChange={(e) => setDecayRate(parseFloat(e.target.value))}
            onMouseUp={() => handleSave()}
            onTouchEnd={() => handleSave()}
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
            onBlur={() => handleSave()}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
          />
        </div>
      </div>

      {/* Min Interval */}
      <div className="space-y-1 mt-3">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Minimum Beat Interval
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Minimum time between detected beats (prevents rapid re-triggering)
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <input
            type="range"
            min="50"
            max="500"
            step="10"
            value={minInterval}
            onChange={(e) => setMinInterval(parseInt(e.target.value))}
            onMouseUp={() => handleSave()}
            onTouchEnd={() => handleSave()}
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
            onBlur={() => handleSave()}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-center"
          />
        </div>
      </div>

      {isSaving && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Saving...</p>}
    </div>
  )
}

export default AudioBeatDetection
