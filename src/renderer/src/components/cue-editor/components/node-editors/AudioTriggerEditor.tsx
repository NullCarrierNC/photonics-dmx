/**
 * The audio trigger form: preset selection, frequency band, thresholds and spectral gates.
 */
import React from 'react'
import type {
  AudioEventNode,
  AudioTriggerNode,
  AudioTriggerSpectralGates,
  SpectralGateRange,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  getInstrumentTriggerPreset,
  INSTRUMENT_TRIGGER_PRESETS,
  instrumentPresetToTriggerUpdates,
  triggerMatchesInstrumentPreset,
} from '../../lib/audioTriggerPresets'
import { AUDIO_TRIGGER_PROPERTY_DOCS, DOC_BLOCK_CLASS } from './eventNodeDocs'

const DEFAULT_TRIGGER_COLOR = '#60a5fa'

export const AUDIO_TRIGGER_DEFAULTS: Omit<AudioTriggerNode, 'id' | 'type'> = {
  eventType: 'audio-trigger',
  frequencyRange: { minHz: 120, maxHz: 500 },
  threshold: 0.5,
  hysteresis: 0.05,
  holdMs: 0,
  smoothing: 0.45,
  spectralGates: undefined,
  color: DEFAULT_TRIGGER_COLOR,
  nodeLabel: 'Audio Trigger',
  outputs: ['enter', 'during', 'exit'],
}

type SpectralGateField = keyof AudioTriggerSpectralGates

const SPECTRAL_GATE_ROWS: {
  key: SpectralGateField
  label: string
  hint: string
}[] = [
  {
    key: 'flatness',
    label: 'Flatness',
    hint: '0 = tonal / pitched, 1 = noise-like. Narrow to tonal or noisy content.',
  },
  {
    key: 'zeroCrossingRate',
    label: 'Zero-crossing rate',
    hint: 'Low = sustained; high = noisy / percussive.',
  },
  {
    key: 'hfcOnset',
    label: 'HFC onset',
    hint: 'Higher = more transient / percussive energy in high frequencies.',
  },
  {
    key: 'crest',
    label: 'Spectral crest',
    hint: 'Higher = peakier spectrum in the matched band.',
  },
]

function mergeSpectralGates(
  prev: AudioTriggerSpectralGates | undefined,
  key: SpectralGateField,
  range: SpectralGateRange | undefined,
): AudioTriggerSpectralGates | undefined {
  const next: AudioTriggerSpectralGates = { ...(prev ?? {}) }
  if (range === undefined) {
    delete next[key]
  } else {
    next[key] = range
  }
  return Object.keys(next).length > 0 ? next : undefined
}

interface AudioTriggerEditorProps {
  trigger: AudioTriggerNode
  updateAudioNode: (updates: Partial<AudioEventNode | AudioTriggerNode>) => void
}

const AudioTriggerEditor: React.FC<AudioTriggerEditorProps> = ({ trigger, updateAudioNode }) => {
  const patchTrigger = (updates: Partial<AudioTriggerNode>) => {
    updateAudioNode({ ...updates, triggerPresetDirty: true })
  }

  const appliedPreset =
    trigger && trigger.appliedTriggerPreset
      ? getInstrumentTriggerPreset(trigger.appliedTriggerPreset)
      : undefined
  const showPresetModified = Boolean(
    trigger &&
      (trigger.triggerPresetDirty === true ||
        (appliedPreset != null && !triggerMatchesInstrumentPreset(trigger, appliedPreset))),
  )

  const hasActivePreset =
    trigger != null && trigger.appliedTriggerPreset != null && trigger.triggerPresetDirty !== true

  return (
    <>
      <label className="flex flex-col font-medium">
        <span className="flex flex-wrap items-center gap-2">
          Trigger preset
          {showPresetModified && (
            <span className="font-normal text-gray-500 dark:text-gray-400">(modified)</span>
          )}
        </span>
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={trigger.appliedTriggerPreset ?? ''}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') {
              updateAudioNode({ appliedTriggerPreset: undefined, triggerPresetDirty: true })
              return
            }
            const preset = getInstrumentTriggerPreset(
              v as (typeof INSTRUMENT_TRIGGER_PRESETS)[number]['id'],
            )
            if (!preset) return
            updateAudioNode({
              ...instrumentPresetToTriggerUpdates(preset),
              appliedTriggerPreset: preset.id,
              triggerPresetDirty: false,
            })
          }}>
          <option value="">None (custom)</option>
          {INSTRUMENT_TRIGGER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <div className={DOC_BLOCK_CLASS}>
          Sets frequency range, threshold, hysteresis, label, colour (from the EQ band palette), and
          spectral gates for common instruments. Edit any field to mark the preset as modified.
        </div>
      </label>
      <label className="flex flex-col font-medium">
        Frequency range (Hz)
        <div className="mt-1 flex gap-1">
          <input
            type="number"
            min={20}
            max={20000}
            step={10}
            readOnly={hasActivePreset}
            className={`w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 ${
              hasActivePreset ? 'cursor-not-allowed opacity-60' : ''
            }`}
            value={trigger.frequencyRange?.minHz ?? 120}
            onChange={(e) =>
              patchTrigger({
                frequencyRange: {
                  ...trigger.frequencyRange,
                  minHz: Number(e.target.value),
                  maxHz: trigger.frequencyRange?.maxHz ?? 500,
                },
              })
            }
          />
          <span className="self-center">-</span>
          <input
            type="number"
            min={20}
            max={20000}
            step={10}
            readOnly={hasActivePreset}
            className={`w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 ${
              hasActivePreset ? 'cursor-not-allowed opacity-60' : ''
            }`}
            value={trigger.frequencyRange?.maxHz ?? 500}
            onChange={(e) =>
              patchTrigger({
                frequencyRange: {
                  ...trigger.frequencyRange,
                  minHz: trigger.frequencyRange?.minHz ?? 120,
                  maxHz: Number(e.target.value),
                },
              })
            }
          />
        </div>
        {!hasActivePreset && (
          <div className={DOC_BLOCK_CLASS}>
            {AUDIO_TRIGGER_PROPERTY_DOCS.frequencyRange.description}
            <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
              Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.frequencyRange.bestUsedFor}
            </span>
          </div>
        )}
      </label>
      <label className="flex flex-col font-medium">
        Threshold
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          className="mt-1"
          value={trigger.threshold ?? 0.5}
          onChange={(e) => patchTrigger({ threshold: Number(e.target.value) })}
        />
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          {(trigger.threshold ?? 0.5).toFixed(2)}
        </span>
        <div className={DOC_BLOCK_CLASS}>
          {AUDIO_TRIGGER_PROPERTY_DOCS.threshold.description}
          <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
            Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.threshold.bestUsedFor}
          </span>
        </div>
      </label>
      <label className="flex flex-col font-medium">
        Hysteresis
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          className="mt-1"
          value={trigger.hysteresis ?? 0}
          onChange={(e) => patchTrigger({ hysteresis: Number(e.target.value) })}
        />
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          {(trigger.hysteresis ?? 0).toFixed(2)}
        </span>
        <div className={DOC_BLOCK_CLASS}>
          {AUDIO_TRIGGER_PROPERTY_DOCS.hysteresis.description}
          <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
            Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.hysteresis.bestUsedFor}
          </span>
        </div>
      </label>
      <label className="flex flex-col font-medium">
        Hold time (ms)
        <input
          type="number"
          min={0}
          step={10}
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={trigger.holdMs ?? 0}
          onChange={(e) => patchTrigger({ holdMs: Math.max(0, Number(e.target.value) || 0) })}
        />
        <div className={DOC_BLOCK_CLASS}>
          {AUDIO_TRIGGER_PROPERTY_DOCS.holdMs.description}
          <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
            Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.holdMs.bestUsedFor}
          </span>
        </div>
      </label>
      <label className="flex flex-col font-medium">
        Energy smoothing
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          className="mt-1"
          value={trigger.smoothing ?? 0.45}
          onChange={(e) => patchTrigger({ smoothing: Number(e.target.value) })}
        />
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          {(trigger.smoothing ?? 0.45).toFixed(2)}
        </span>
        <div className={DOC_BLOCK_CLASS}>
          {AUDIO_TRIGGER_PROPERTY_DOCS.smoothing.description}
          <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
            Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.smoothing.bestUsedFor}
          </span>
        </div>
      </label>
      <label className="flex flex-col font-medium">
        Attack (ms)
        <input
          type="number"
          min={0}
          step={5}
          placeholder="off"
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={trigger.attackMs ?? ''}
          onChange={(e) =>
            patchTrigger({
              attackMs:
                e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0),
            })
          }
        />
        <div className={DOC_BLOCK_CLASS}>
          {AUDIO_TRIGGER_PROPERTY_DOCS.attackMs.description}
          <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
            Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.attackMs.bestUsedFor}
          </span>
        </div>
      </label>
      <label className="flex flex-col font-medium">
        Release (ms)
        <input
          type="number"
          min={0}
          step={10}
          placeholder="off"
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={trigger.releaseMs ?? ''}
          onChange={(e) =>
            patchTrigger({
              releaseMs:
                e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0),
            })
          }
        />
        <div className={DOC_BLOCK_CLASS}>
          {AUDIO_TRIGGER_PROPERTY_DOCS.releaseMs.description}
          <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
            Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.releaseMs.bestUsedFor}
          </span>
        </div>
      </label>

      <details className="rounded border border-gray-200 dark:border-gray-700 px-2 py-1.5">
        <summary className="cursor-pointer font-medium text-gray-800 dark:text-gray-200">
          Spectral gates
        </summary>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 font-normal">
            <input
              type="checkbox"
              className="rounded border-gray-300 dark:border-gray-600"
              checked={trigger.spectralGates !== undefined}
              onChange={(e) => patchTrigger({ spectralGates: e.target.checked ? {} : undefined })}
            />
            <span>Enable spectral gates (all defined conditions must pass)</span>
          </label>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            Flatness and crest use the analysis band that best overlaps your trigger range; ZCR and
            HFC use the global frame values.
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] dark:border-gray-600 dark:bg-gray-800"
              onClick={() =>
                patchTrigger({
                  spectralGates: { flatness: { max: 0.3 }, zeroCrossingRate: { max: 0.3 } },
                })
              }>
              Tonal
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] dark:border-gray-600 dark:bg-gray-800"
              onClick={() =>
                patchTrigger({
                  spectralGates: { hfcOnset: { min: 0.4 }, zeroCrossingRate: { min: 0.3 } },
                })
              }>
              Percussive
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] dark:border-gray-600 dark:bg-gray-800"
              onClick={() =>
                patchTrigger({
                  spectralGates: { flatness: { min: 0.5 } },
                })
              }>
              Noise / cymbal
            </button>
          </div>
          {trigger.spectralGates !== undefined &&
            SPECTRAL_GATE_ROWS.map(({ key, label, hint }) => {
              const g = trigger.spectralGates?.[key]
              const active = g !== undefined
              const range: SpectralGateRange = active ? (g as SpectralGateRange) : {}
              return (
                <div
                  key={key}
                  className="rounded border border-gray-100 bg-gray-50/80 p-2 dark:border-gray-700 dark:bg-gray-800/50">
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 dark:border-gray-600"
                      checked={active}
                      onChange={(e) => {
                        const defaults: SpectralGateRange =
                          key === 'flatness'
                            ? { max: 0.5 }
                            : key === 'crest'
                              ? { min: 0.3 }
                              : key === 'hfcOnset'
                                ? { min: 0.4 }
                                : { max: 0.5 }
                        patchTrigger({
                          spectralGates: mergeSpectralGates(
                            trigger.spectralGates,
                            key,
                            e.target.checked ? defaults : undefined,
                          ),
                        })
                      }}
                    />
                    {label}
                  </label>
                  <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">{hint}</p>
                  {active && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="flex flex-col text-[10px] font-medium">
                        Min (0-1)
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          className="mt-0.5"
                          value={range.min ?? 0}
                          onChange={(e) =>
                            patchTrigger({
                              spectralGates: mergeSpectralGates(trigger.spectralGates, key, {
                                ...range,
                                min: Number(e.target.value),
                              }),
                            })
                          }
                        />
                        <span className="font-mono text-gray-600 dark:text-gray-300">
                          {(range.min ?? 0).toFixed(2)}
                        </span>
                      </label>
                      <label className="flex flex-col text-[10px] font-medium">
                        Max (0-1)
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          className="mt-0.5"
                          value={range.max ?? 1}
                          onChange={(e) =>
                            patchTrigger({
                              spectralGates: mergeSpectralGates(trigger.spectralGates, key, {
                                ...range,
                                max: Number(e.target.value),
                              }),
                            })
                          }
                        />
                        <span className="font-mono text-gray-600 dark:text-gray-300">
                          {(range.max ?? 1).toFixed(2)}
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </details>

      <div className="rounded border border-gray-200 dark:border-gray-700 px-2 py-1.5 space-y-2">
        <span className="font-medium text-gray-800 dark:text-gray-200">Onset gating</span>
        <p className="text-[10px] text-gray-500 dark:text-gray-400">
          When enabled, the trigger also requires per-band onset strength (spectral flux in the
          matched frequency band) above the threshold. Helps separate drum hits from sustained
          chords.
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="rounded border-gray-300 dark:border-gray-600"
            checked={trigger.useOnsetGating === true}
            onChange={(e) =>
              patchTrigger({
                useOnsetGating: e.target.checked,
                onsetThreshold: e.target.checked ? trigger.onsetThreshold ?? 0.3 : undefined,
              })
            }
          />
          <span>Require band onset above threshold</span>
        </label>
        {trigger.useOnsetGating === true && (
          <label className="flex flex-col font-medium">
            Onset threshold
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              className="mt-1"
              value={trigger.onsetThreshold ?? 0.3}
              onChange={(e) => patchTrigger({ onsetThreshold: Number(e.target.value) })}
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {(trigger.onsetThreshold ?? 0.3).toFixed(2)}
            </span>
          </label>
        )}
      </div>

      {!hasActivePreset && (
        <label className="flex flex-col font-medium">
          Label
          <input
            type="text"
            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={trigger.nodeLabel ?? ''}
            onChange={(e) => patchTrigger({ nodeLabel: e.target.value })}
            placeholder="Audio Trigger"
          />
          <div className={DOC_BLOCK_CLASS}>
            {AUDIO_TRIGGER_PROPERTY_DOCS.label.description}
            <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
              Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.label.bestUsedFor}
            </span>
          </div>
        </label>
      )}
      {!hasActivePreset && (
        <label className="flex flex-col font-medium">
          Colour
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              className="h-8 w-12 cursor-pointer rounded border border-gray-300 dark:border-gray-600"
              value={trigger.color ?? DEFAULT_TRIGGER_COLOR}
              onChange={(e) => patchTrigger({ color: e.target.value })}
            />
            <input
              type="text"
              className="flex-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 font-mono text-[10px]"
              value={trigger.color ?? DEFAULT_TRIGGER_COLOR}
              onChange={(e) => patchTrigger({ color: e.target.value })}
            />
          </div>
          <div className={DOC_BLOCK_CLASS}>
            {AUDIO_TRIGGER_PROPERTY_DOCS.color.description}
            <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
              Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.color.bestUsedFor}
            </span>
          </div>
        </label>
      )}
    </>
  )
}

export default AudioTriggerEditor
