import React, { useMemo } from 'react'
import { DEFAULT_AUDIO_BANDS } from '../../../photonics-dmx/listeners/Audio/AudioConfig'
import { useAudioConfigFields } from '../hooks/useAudioConfigFields'
import { useCommitOnRelease } from '../hooks/useCommitOnRelease'
import { DraftNumberField } from './controls/DraftField'
import {
  AUDIO_BAND_PRESETS,
  clonePresetBands,
  matchAudioBandPresetId,
  type AudioBandPresetId,
} from '../../../photonics-dmx/listeners/Audio/AudioBandPresets'
import {
  AUDIO_BAND_GAIN_MAX,
  AUDIO_BAND_GAIN_MIN,
  type AudioBandDefinition,
} from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import { SaveErrorAlert } from './controls/SaveErrorAlert'

const PRESET_OPTIONS = (() => {
  const copy = [...AUDIO_BAND_PRESETS]
  const rhythmIdx = copy.findIndex((p) => p.id === 'rhythm-game')
  const rhythm = rhythmIdx >= 0 ? copy.splice(rhythmIdx, 1)[0] : undefined
  copy.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  const ordered = rhythm ? [rhythm, ...copy] : copy
  return ordered.map((p) => ({ id: p.id, label: p.label }))
})()

function isValidEightBandList(bands: unknown): bands is AudioBandDefinition[] {
  return Array.isArray(bands) && bands.length === 8
}

const AudioBandSettings: React.FC = () => {
  const audio = useAudioConfigFields({ bands: DEFAULT_AUDIO_BANDS })
  // A stored list of the wrong length cannot drive eight rows, so the shipped bands stand in.
  const bands = isValidEightBandList(audio.values.bands) ? audio.values.bands : DEFAULT_AUDIO_BANDS
  const isSaving = audio.isSaving

  const matchedPresetId = useMemo(() => matchAudioBandPresetId(bands), [bands])

  const handleSave = (updatedBands: AudioBandDefinition[]): void => {
    void audio.save({ bands: updatedBands })
  }

  const handlePresetChange = (presetId: AudioBandPresetId): void => {
    handleSave(clonePresetBands(presetId))
  }

  const handleGainChange = (index: number, value: number): void => {
    const clamped = Math.max(AUDIO_BAND_GAIN_MIN, Math.min(AUDIO_BAND_GAIN_MAX, value))
    audio.set({ bands: bands.map((b, i) => (i === index ? { ...b, gain: clamped } : b)) })
  }

  // One release serves every gain slider, since a save writes all eight bands.
  const gainRelease = useCommitOnRelease(() => handleSave(bands))

  const handleGainSliderChange = (index: number, e: React.ChangeEvent<HTMLInputElement>): void => {
    handleGainChange(index, parseFloat(e.target.value))
    gainRelease.changed()
  }

  const handleResetGains = (): void => {
    handleSave(bands.map((b) => ({ ...b, gain: 1.0 })))
  }

  const handleResetToShippedDefault = (): void => {
    handleSave(clonePresetBands('rhythm-game'))
  }

  if (!audio.loaded) {
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
        tune gains — you don&apos;t want bands constantly peaking, but you also want to see activity
        across all bands.
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
              handlePresetChange(v as AudioBandPresetId)
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
                Gain
              </label>
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <input
                  id={`audio-band-gain-${band.id}`}
                  type="range"
                  min={String(AUDIO_BAND_GAIN_MIN)}
                  max={String(AUDIO_BAND_GAIN_MAX)}
                  step="0.1"
                  value={band.gain}
                  onChange={(e) => handleGainSliderChange(index, e)}
                  {...gainRelease.props}
                  aria-label={`${band.name} gain multiplier`}
                  className="flex-1 min-w-0 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((band.gain - AUDIO_BAND_GAIN_MIN) / (AUDIO_BAND_GAIN_MAX - AUDIO_BAND_GAIN_MIN)) * 100}%, #e5e7eb ${((band.gain - AUDIO_BAND_GAIN_MIN) / (AUDIO_BAND_GAIN_MAX - AUDIO_BAND_GAIN_MIN)) * 100}%, #e5e7eb 100%)`,
                  }}
                />
                <DraftNumberField
                  value={band.gain}
                  min={AUDIO_BAND_GAIN_MIN}
                  max={AUDIO_BAND_GAIN_MAX}
                  step={0.1}
                  decimals={2}
                  onCommit={(gain) =>
                    handleSave(bands.map((b, i) => (i === index ? { ...b, gain } : b)))
                  }
                  disabled={isSaving}
                  aria-label={`${band.name} gain value`}
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
          onClick={handleResetGains}
          disabled={isSaving}
          className="px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 rounded-md transition-colors">
          Reset gains to 1.0x
        </button>
        <button
          type="button"
          onClick={handleResetToShippedDefault}
          disabled={isSaving}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors">
          Reset to Rhythm Game preset
        </button>
      </div>
      <SaveErrorAlert message={audio.saveError} />
    </div>
  )
}

export default AudioBandSettings
