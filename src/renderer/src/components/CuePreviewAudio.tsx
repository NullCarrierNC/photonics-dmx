import React, { useState, useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { audioDataAtom, audioConfigAtom } from '../atoms'
import type { Color } from '../../../photonics-dmx/types'

// Map Color type to RGB values for preview bars (matches AudioColorMapping.tsx)
const COLOR_TO_RGB: Record<Color, string> = {
  red: 'rgb(255, 0, 0)',
  blue: 'rgb(0, 0, 255)',
  yellow: 'rgb(255, 255, 0)',
  green: 'rgb(0, 255, 0)',
  cyan: 'rgb(0, 255, 255)',
  orange: 'rgb(255, 127, 0)',
  purple: 'rgb(128, 0, 128)',
  chartreuse: 'rgb(127, 255, 0)',
  teal: 'rgb(0, 128, 128)',
  violet: 'rgb(138, 43, 226)',
  magenta: 'rgb(255, 0, 255)',
  vermilion: 'rgb(227, 66, 52)',
  amber: 'rgb(255, 191, 0)',
  white: 'rgb(255, 255, 255)',
  black: 'rgb(0, 0, 0)',
  transparent: 'rgb(0, 0, 0)',
}

interface CuePreviewAudioProps {
  className?: string
}

const THREE_BAND_IDS = ['range1', 'range3', 'range4']
const FOUR_BAND_IDS = ['range1', 'range2', 'range3', 'range4']

type PreviewRange = {
  id: string
  name: string
  minHz: number
  maxHz: number
  color: Color
  brightness: 'low' | 'medium' | 'high' | 'max'
}

const CuePreviewAudio: React.FC<CuePreviewAudioProps> = ({ className = '' }) => {
  // Read audio data from atom (no IPC needed - data stays in renderer!)
  const audioData = useAtomValue(audioDataAtom)
  const audioConfig = useAtomValue(audioConfigAtom)
  const [showBeatPulse, setShowBeatPulse] = useState(false)

  const defaultRanges: PreviewRange[] = [
    {
      id: 'range1',
      name: 'Bass',
      minHz: 20,
      maxHz: 220,
      color: 'red' as Color,
      brightness: 'medium' as const,
    },
    {
      id: 'range2',
      name: 'Lower-Mids',
      minHz: 220,
      maxHz: 800,
      color: 'blue' as Color,
      brightness: 'medium' as const,
    },
    {
      id: 'range3',
      name: 'Upper-Mids',
      minHz: 800,
      maxHz: 2500,
      color: 'yellow' as Color,
      brightness: 'medium' as const,
    },
    {
      id: 'range4',
      name: 'Highs',
      minHz: 2500,
      maxHz: 6000,
      color: 'green' as Color,
      brightness: 'medium' as const,
    },
    {
      id: 'range5',
      name: 'Air',
      minHz: 6000,
      maxHz: 20000,
      color: 'cyan' as Color,
      brightness: 'medium' as const,
    },
  ]

  const configuredRanges = (audioConfig?.frequencyBands?.ranges as PreviewRange[]) || defaultRanges
  const configuredBandCount = audioConfig?.frequencyBands?.bandCount ?? 4
  const displayRanges =
    configuredBandCount === 3
      ? configuredRanges.filter((range) => THREE_BAND_IDS.includes(range.id))
      : configuredBandCount === 4
        ? configuredRanges.filter((range) => FOUR_BAND_IDS.includes(range.id))
        : configuredRanges

  const bandValuesById: Record<string, number> = {
    range1: audioData?.frequencyBands?.range1 || 0,
    range2: audioData?.frequencyBands?.range2 || 0,
    range3: audioData?.frequencyBands?.range3 || 0,
    range4: audioData?.frequencyBands?.range4 || 0,
    range5: audioData?.frequencyBands?.range5 || 0,
  }

  // Track beat detection for pulse animation (show for 200ms after beat)
  useEffect(() => {
    if (audioData?.beatDetected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pulse visibility for 200ms after beat
      setShowBeatPulse(true)
      const timer = setTimeout(() => setShowBeatPulse(false), 200)
      return () => clearTimeout(timer)
    }
  }, [audioData?.beatDetected])

  const showPulse = Boolean(audioData?.beatDetected || showBeatPulse)

  if (!audioData) {
    return (
      <div className={`p-3 bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}>
        <h3 className="text-lg font-semibold mb-1">Audio Preview</h3>
        <p className="text-gray-500 dark:text-gray-400">Waiting for audio data...</p>
      </div>
    )
  }

  const { energy, bpm } = audioData

  return (
    <div className={`p-4 bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Audio Preview</h3>
        {bpm && (
          <div className="text-sm font-mono bg-gray-300 dark:bg-gray-600 px-2 py-1 rounded">
            {bpm.toFixed(0)} BPM
          </div>
        )}
      </div>

      {/* Frequency Bars */}
      <div className="space-y-2 mb-4">
        {displayRanges.map((range) => {
          const bandValue = bandValuesById[range.id] || 0
          const colorRgb = COLOR_TO_RGB[range.color as Color] || COLOR_TO_RGB.white
          const frequencyLabel = `${range.minHz}-${range.maxHz >= 1000 ? `${(range.maxHz / 1000).toFixed(1)}k` : range.maxHz}Hz`

          return (
            <div key={range.id}>
              <div className="flex justify-between items-center text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 dark:text-gray-300 font-medium">{range.name}</span>
                  <span className="text-gray-500 dark:text-gray-400">({frequencyLabel})</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {range.brightness}
                  </span>
                </div>
                <span className="text-gray-600 dark:text-gray-300 font-mono">
                  {(bandValue * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded overflow-hidden">
                <div
                  className="h-full transition-all duration-150 ease-out"
                  style={{
                    width: `${bandValue * 100}%`,
                    backgroundColor: colorRgb,
                  }}
                />
              </div>
            </div>
          )
        })}

        {/* Overall Energy */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-300 font-semibold">Overall Energy</span>
            <span className="text-gray-600 dark:text-gray-300 font-mono">
              {(energy * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-150 ease-out"
              style={{ width: `${energy * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Beat Indicator */}
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Beat Detected:</span>
        <div
          className={`w-16 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-200 ${
            showPulse
              ? 'bg-white border-gray-300 text-black'
              : 'bg-gray-800 border-gray-600 text-white'
          }`}>
          {showPulse ? 'BEAT' : 'OFF'}
        </div>
      </div>
    </div>
  )
}

export default CuePreviewAudio
