import type {
  AudioTriggerInstrumentPresetId,
  AudioTriggerNode,
  AudioTriggerSpectralGates,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import {
  getInstrumentPresetEqBandColorHex,
  normalizeHexForCompare,
} from '../../../lib/audioEqBandColors'

export interface InstrumentTriggerPresetDefinition {
  id: AudioTriggerInstrumentPresetId
  label: string
  nodeLabel: string
  frequencyRange: { minHz: number; maxHz: number }
  threshold: number
  hysteresis: number
  holdMs: number
  spectralGates?: AudioTriggerSpectralGates
}

/** Instrument-focused trigger presets (frequency, threshold, hysteresis, spectral gates). */
export const INSTRUMENT_TRIGGER_PRESETS: InstrumentTriggerPresetDefinition[] = [
  {
    id: 'sub-bass',
    label: 'Sub Bass',
    nodeLabel: 'Sub Bass',
    frequencyRange: { minHz: 20, maxHz: 50 },
    threshold: 0.12,
    hysteresis: 0.04,
    holdMs: 0,
    spectralGates: { flatness: { max: 0.35 } },
  },
  {
    id: 'kick',
    label: 'Kick Drum',
    nodeLabel: 'Kick Drum',
    frequencyRange: { minHz: 30, maxHz: 120 },
    threshold: 0.12,
    hysteresis: 0.04,
    holdMs: 0,
    spectralGates: { flatness: { max: 0.35 } },
  },
  {
    id: 'snare',
    label: 'Snare',
    nodeLabel: 'Snare',
    frequencyRange: { minHz: 150, maxHz: 400 },
    threshold: 0.18,
    hysteresis: 0.05,
    holdMs: 0,
    spectralGates: { hfcOnset: { min: 0.3 } },
  },
  {
    id: 'bass-guitar',
    label: 'Bass Guitar',
    nodeLabel: 'Bass Guitar',
    frequencyRange: { minHz: 60, maxHz: 350 },
    threshold: 0.14,
    hysteresis: 0.04,
    holdMs: 0,
    spectralGates: { flatness: { max: 0.3 } },
  },
  {
    id: 'electric-guitar',
    label: 'Electric Guitar',
    nodeLabel: 'Electric Guitar',
    frequencyRange: { minHz: 300, maxHz: 3000 },
    threshold: 0.2,
    hysteresis: 0.05,
    holdMs: 0,
    spectralGates: { flatness: { max: 0.35 }, crest: { min: 0.3 } },
  },
  {
    id: 'vocals',
    label: 'Vocals',
    nodeLabel: 'Vocals',
    frequencyRange: { minHz: 200, maxHz: 4000 },
    threshold: 0.18,
    hysteresis: 0.05,
    holdMs: 0,
    spectralGates: { flatness: { max: 0.25 }, zeroCrossingRate: { max: 0.3 } },
  },
  {
    id: 'hi-hat-cymbals',
    label: 'Hi-Hat / Cymbals',
    nodeLabel: 'Hi-Hat / Cymbals',
    frequencyRange: { minHz: 6000, maxHz: 16000 },
    threshold: 0.15,
    hysteresis: 0.04,
    holdMs: 0,
    spectralGates: { flatness: { min: 0.4 } },
  },
  {
    id: 'full-kit',
    label: 'Full Kit',
    nodeLabel: 'Full Kit',
    frequencyRange: { minHz: 20, maxHz: 16000 },
    threshold: 0.15,
    hysteresis: 0.05,
    holdMs: 0,
    spectralGates: { hfcOnset: { min: 0.25 } },
  },
]

export function getInstrumentTriggerPreset(
  id: AudioTriggerInstrumentPresetId,
): InstrumentTriggerPresetDefinition | undefined {
  return INSTRUMENT_TRIGGER_PRESETS.find((p) => p.id === id)
}

/** Build node updates for applying an instrument preset (caller sets appliedTriggerPreset / dirty). */
export function instrumentPresetToTriggerUpdates(
  preset: InstrumentTriggerPresetDefinition,
): Partial<AudioTriggerNode> {
  return {
    nodeLabel: preset.nodeLabel,
    frequencyRange: { ...preset.frequencyRange },
    threshold: preset.threshold,
    hysteresis: preset.hysteresis,
    holdMs: preset.holdMs,
    spectralGates: preset.spectralGates === undefined ? undefined : { ...preset.spectralGates },
    useOnsetGating: false,
    onsetThreshold: undefined,
    color: getInstrumentPresetEqBandColorHex(preset),
  }
}

export function spectralGatesEqual(
  a: AudioTriggerSpectralGates | undefined,
  b: AudioTriggerSpectralGates | undefined,
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/** True when the trigger matches the given preset definition (for “modified” display). */
export function triggerMatchesInstrumentPreset(
  trigger: AudioTriggerNode,
  preset: InstrumentTriggerPresetDefinition,
): boolean {
  if (trigger.frequencyRange.minHz !== preset.frequencyRange.minHz) return false
  if (trigger.frequencyRange.maxHz !== preset.frequencyRange.maxHz) return false
  if (trigger.threshold !== preset.threshold) return false
  if ((trigger.hysteresis ?? 0) !== preset.hysteresis) return false
  if ((trigger.holdMs ?? 0) !== preset.holdMs) return false
  if ((trigger.nodeLabel ?? '') !== preset.nodeLabel) return false
  if (!spectralGatesEqual(trigger.spectralGates, preset.spectralGates)) return false
  if (trigger.useOnsetGating === true) return false
  const expectedColor = getInstrumentPresetEqBandColorHex(preset)
  const actualColor = trigger.color != null && trigger.color !== '' ? trigger.color : expectedColor
  if (normalizeHexForCompare(actualColor) !== normalizeHexForCompare(expectedColor)) return false
  return true
}
