/**
 * Event and effect nodes: what a graph listens for, and what it raises.
 */
import type { NetEventType } from '../../../types'
import type { ValueSource } from './variables'

export interface EventRaiserNode {
  id: string
  type: 'event-raiser'
  eventName: string
  label?: string
  inputs?: string[]
  outputs?: string[]
}

export interface EventListenerNode {
  id: string
  type: 'event-listener'
  eventName: string
  label?: string
  outputs?: string[]
}

// Effect Event Listener node
export interface EffectEventListenerNode {
  id: string
  type: 'effect-listener'
  label?: string
  outputs?: string[]
  // parameterMappings removed - auto-mapped from effect variables with isParameter=true
}

// Effect Raiser node
export interface EffectRaiserNode {
  id: string
  type: 'effect-raiser'
  effectId: string // References effect definition
  label?: string
  inputs?: string[]
  outputs?: string[]
  parameterValues?: Record<string, ValueSource> // Parameter name -> value
  /** When true, the effect automatically re-triggers when it completes, creating a continuous loop.
   *  Used for effects like sweeps or cross-fades that should run indefinitely until the cue stops. */
  isPersistent?: boolean
  /** When true, re-triggering this raiser while its effect is still running cancels the in-flight
   *  effect and restarts it from the top, instead of dropping the trigger. Used for event-driven
   *  flashes (e.g. a drum-red blink) that must fire on every event even when they arrive faster than
   *  the flash duration. Default false keeps the drop-while-busy behaviour. */
  interruptible?: boolean
}

export interface BaseEventNode {
  id: string
  type: 'event'
  label?: string
  outputs?: string[]
}

export interface NetEventNode extends BaseEventNode {
  eventType: NetEventType
  /**
   * RB3 led-N gates only: when true, the ON gate also fires while the position stays lit but the set
   * of banks lighting it changes (a colour change), not just on the off→on edge. Ignored by led-N-off
   * and non-led events.
   */
  triggerOnColorChange?: boolean
}

export type AudioEventType =
  | 'none'
  | 'delay'
  | 'cue-started'
  | 'cue-called'
  | 'beat'
  | 'audio-energy'
  | 'audio-trigger'
  | 'audio-centroid'
  | 'audio-flatness'
  | 'audio-hfc'

export interface AudioEventNode extends BaseEventNode {
  eventType: AudioEventType
  threshold?: number
  triggerMode: 'edge' | 'level'
  /** Minimum ms between edge triggers, 0 = no limit */
  cooldownMs?: number
  /**
   * When true (edge mode only), also require max per-band onset strength >= onsetThreshold.
   * Used to tighten beat/HFC-style events against weak or duplicate edges.
   */
  useOnsetGating?: boolean
  /** Minimum onset strength (0-1) when useOnsetGating is true. Default 0.3 */
  onsetThreshold?: number
}

/** Optional min/max range for a single spectral gate (0-1 feature values). */
export interface SpectralGateRange {
  min?: number
  max?: number
}

/** When set, all defined sub-gates must pass (AND). Omitted sub-gates are ignored. */
export interface AudioTriggerSpectralGates {
  /** Spectral flatness (0-1). 0 = tonal, 1 = noise */
  flatness?: SpectralGateRange
  /** Zero-crossing rate (0-1). Low = sustained, high = percussive */
  zeroCrossingRate?: SpectralGateRange
  /** HFC onset (0-1). Higher = more percussive / transient */
  hfcOnset?: SpectralGateRange
  /** Spectral crest (0-1). Higher = peakier / more tonal */
  crest?: SpectralGateRange
}

export type AudioTriggerInstrumentPresetId =
  | 'sub-bass'
  | 'kick'
  | 'snare'
  | 'bass-guitar'
  | 'electric-guitar'
  | 'vocals'
  | 'hi-hat-cymbals'
  | 'full-kit'

export interface AudioTriggerNode extends BaseEventNode {
  type: 'event'
  eventType: 'audio-trigger'
  frequencyRange: { minHz: number; maxHz: number }
  /** Power level (0-1) the band energy must exceed to trigger. Higher = needs more energy to fire. */
  threshold: number
  /** Hysteresis margin (0-1). Release when level drops below threshold - hysteresis. Omitted = 0. */
  hysteresis?: number
  /** Minimum ms the trigger stays active after entering. 0 = no minimum hold. */
  holdMs?: number
  /** Energy smoothing (0-1). 0 = raw/immediate, 1 = maximum smoothing (slow response). Default 0.45. */
  smoothing?: number
  /** Rising-edge time constant (ms) for the band envelope. Smaller = snappier fade-up. Set with releaseMs to opt into asymmetric (fast-up/slow-down) smoothing instead of the symmetric `smoothing` path. */
  attackMs?: number
  /** Falling-edge time constant (ms) for the band envelope. Larger = slower fade-down (eg. 1970s light-organ feel). Set with attackMs to opt into asymmetric smoothing. */
  releaseMs?: number
  /** Optional spectral conditions (flatness, ZCR, HFC, crest). AND with band energy. */
  spectralGates?: AudioTriggerSpectralGates
  /** When true, also require per-band onset strength above onsetThreshold for the matched band */
  useOnsetGating?: boolean
  /** Minimum onset strength (0-1) when useOnsetGating is true. Default 0.3 */
  onsetThreshold?: number
  /** Last-applied instrument preset (for editor display) */
  appliedTriggerPreset?: AudioTriggerInstrumentPresetId
  /** True when the user changed fields after applying a preset */
  triggerPresetDirty?: boolean
  color: string
  nodeLabel: string
  outputs: ['enter', 'during', 'exit']
}

export type AudioEventNodeUnion = AudioEventNode | AudioTriggerNode
