import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { audioDataAtom, audioConfigAtom } from '../atoms'
import type { Color } from '../../../photonics-dmx/types'
import { getBandEnergy } from '../../../photonics-dmx/listeners/Audio/bandEnergy'
import { DEFAULT_AUDIO_BANDS } from '../../../photonics-dmx/listeners/Audio/AudioConfig'
import { EQ_BAND_COLORS } from '../lib/audioEqBandColors'
import AudioSensitivityControls from './AudioSensitivityControls'

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
  /** When false, omit the in-card "Audio Preview" heading (page supplies the title). */
  showTitle?: boolean
  /** DMX Preview: show Global Sensitivity / Noise Floor under the spectrum (same as Audio Settings). */
  showAudioQuickControls?: boolean
}

type PreviewRange = {
  id: string
  name: string
  minHz: number
  maxHz: number
  color: Color
}

/** Minimum time the beat indicator stays lit so transient single-frame triggers remain visible. */
const MIN_BEAT_INDICATOR_MS = 280

const CuePreviewAudio: React.FC<CuePreviewAudioProps> = ({
  className = '',
  showTitle = true,
  showAudioQuickControls = false,
}) => {
  // Read audio data from atom (no IPC needed - data stays in renderer!)
  const audioData = useAtomValue(audioDataAtom)
  const audioConfig = useAtomValue(audioConfigAtom)
  const [showBeatPulse, setShowBeatPulse] = useState(false)
  const hideBeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Map band definitions from config to PreviewRange format
  const displayRanges: PreviewRange[] = useMemo(() => {
    if (!audioConfig?.bands) {
      return DEFAULT_AUDIO_BANDS.map((band, index) => ({
        id: band.id,
        name: band.name,
        minHz: band.minHz,
        maxHz: band.maxHz,
        color: (EQ_BAND_COLORS[index] || 'white') as Color,
      }))
    }
    return audioConfig.bands.map((band, index) => ({
      id: band.id,
      name: band.name,
      minHz: band.minHz,
      maxHz: band.maxHz,
      color: (EQ_BAND_COLORS[index] || 'white') as Color,
    }))
  }, [audioConfig])

  const energy = audioData?.energy ?? audioData?.overallLevel ?? 0
  const bandValuesById: Record<string, number> = useMemo(() => {
    const raw = audioData?.rawFrequencyData
    const sr = audioData?.sampleRate
    const fft = audioData?.fftSize
    const bands = audioConfig?.bands || DEFAULT_AUDIO_BANDS

    if (raw?.length && sr != null && fft != null) {
      // Calculate energy for each band using its configured frequency range
      const values: Record<string, number> = {}
      for (const band of bands) {
        values[band.id] = getBandEnergy(raw, sr, fft, band.minHz, band.maxHz)
      }
      return values
    }
    // Fallback: use energy with decreasing multipliers
    const fallback: Record<string, number> = {}
    bands.forEach((band, index) => {
      fallback[band.id] = energy * (1.0 - index * 0.15)
    })
    return fallback
  }, [
    audioData?.rawFrequencyData,
    audioData?.sampleRate,
    audioData?.fftSize,
    audioConfig?.bands,
    energy,
  ])

  // Beat indicator: minimum hold time via ref timer so single-frame beats stay visible.
  // Do not clear when beatDetected goes false on the next frame — that caused flicker.
  // Clear immediately only when there is no audio data (capture stopped).
  useEffect(() => {
    const clearHideTimer = () => {
      if (hideBeatTimerRef.current) {
        clearTimeout(hideBeatTimerRef.current)
        hideBeatTimerRef.current = null
      }
    }

    if (!audioData) {
      clearHideTimer()
      queueMicrotask(() => {
        setShowBeatPulse(false)
      })
      return
    }

    if (audioData.beatDetected) {
      clearHideTimer()
      hideBeatTimerRef.current = setTimeout(() => {
        setShowBeatPulse(false)
        hideBeatTimerRef.current = null
      }, MIN_BEAT_INDICATOR_MS)
      queueMicrotask(() => {
        setShowBeatPulse(true)
      })
    }
    // Do not clear the hide timer when beatDetected goes false — that would cancel the minimum hold.
  }, [audioData])

  useEffect(
    () => () => {
      if (hideBeatTimerRef.current) {
        clearTimeout(hideBeatTimerRef.current)
        hideBeatTimerRef.current = null
      }
    },
    [],
  )

  const showPulse = showBeatPulse

  if (!audioData) {
    return (
      <div className={`p-3 bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}>
        {showTitle && <h3 className="text-lg font-semibold mb-1">Spectrum Analyzer</h3>}
        <p className="text-gray-500 dark:text-gray-400">Waiting for audio data...</p>
      </div>
    )
  }

  const bpm = audioData.bpm

  return (
    <div className={`p-4 bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}>
      {(showTitle || bpm != null) && (
        <div className={`flex items-center mb-3 ${showTitle ? 'justify-between' : 'justify-end'}`}>
          {showTitle && <h3 className="text-lg font-semibold">Spectrum Analyzer</h3>}
          {bpm != null && (
            <div className="text-sm font-mono bg-gray-300 dark:bg-gray-600 px-2 py-1 rounded">
              {bpm.toFixed(0)} BPM
            </div>
          )}
        </div>
      )}

      {/* Frequency Bars */}
      <div className={showAudioQuickControls ? 'space-y-2' : 'space-y-2 mb-4'}>
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

      {showAudioQuickControls && (
        <div className="border-t border-gray-300 dark:border-gray-600 pt-4 mt-4">
          <AudioSensitivityControls compact />
        </div>
      )}

      {/* Beat Indicator */}
      <div className="flex items-center gap-3">
        <span
          className={`text-sm font-semibold transition-colors duration-200 ${
            showPulse ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-500'
          }`}>
          Beat detected
        </span>
        <div
          className={`min-w-[5.5rem] h-9 px-2 rounded-lg border-2 flex items-center justify-center text-xs font-bold uppercase tracking-wide transition-all duration-150 ${
            showPulse
              ? 'bg-amber-400 border-amber-600 text-gray-900 shadow-[0_0_12px_rgba(251,191,36,0.65)] ring-2 ring-amber-300/80 dark:bg-amber-500 dark:border-amber-400 dark:text-gray-950 dark:shadow-[0_0_16px_rgba(251,191,36,0.5)]'
              : 'bg-gray-200 border-gray-400 text-gray-500 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-500'
          }`}>
          {showPulse ? 'Beat' : 'None'}
        </div>
      </div>
    </div>
  )
}

export default CuePreviewAudio
