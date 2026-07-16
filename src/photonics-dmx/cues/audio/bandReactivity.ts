/**
 * Shared band-reactive audio-trigger evaluation. Extracted from BaseAudioNodeCue so both the lighting
 * and motion audio cues AND the laser audio runtime can react to per-frequency-band energy without
 * duplicating the smoothing, spectral gating, and phase state machine.
 *
 * The functions here compute the SIGNAL (does a band trigger fire this frame, plus the band metrics
 * context). Firing the downstream graph is left to each caller, since the lighting/motion runtime and
 * the laser runtime drive different execution engines.
 */
import type { AudioTriggerNode, AudioTriggerSpectralGates } from '../types/nodeCueTypes'
import type { TriggerContext } from '../types/audioCueTypes'
import type { AudioLightingData } from '../../listeners/Audio/AudioTypes'
import { findBestMatchingBandId, getBandEnergy } from '../../listeners/Audio/bandEnergy'

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/** Default energy smoothing (0-1) when trigger.smoothing is omitted. */
const DEFAULT_EMA_SMOOTHING = 0.45
/** Default attack/release time constants (ms) filling in whichever of attackMs/releaseMs is omitted
 *  once a trigger opts into asymmetric smoothing. Snappy attack, slow release (light-organ decay). */
const DEFAULT_ATTACK_MS = 20
const DEFAULT_RELEASE_MS = 250

/**
 * One step of a fast-attack / slow-release envelope follower. Rising targets use the attack time
 * constant, falling targets the release time constant, each converted to a single-pole coefficient
 * from the actual frame delta `dtMs`, so smoothing is frame-rate independent. Zero means snap instantly.
 */
export function asymmetricEnvelopeStep(
  prev: number,
  target: number,
  dtMs: number,
  attackMs: number,
  releaseMs: number,
): number {
  const rising = target >= prev
  const tau = Math.max(0, rising ? attackMs : releaseMs)
  const a = tau > 0 ? 1 - Math.exp(-Math.max(0, dtMs) / tau) : 1
  return prev + a * (target - prev)
}

function checkSpectralGateRange(
  range: { min?: number; max?: number } | undefined,
  value: number,
): boolean {
  if (range === undefined) return true
  if (range.min !== undefined && value < range.min) return false
  if (range.max !== undefined && value > range.max) return false
  return true
}

export function spectralGatesPass(
  gates: AudioTriggerSpectralGates,
  flatness: number,
  zcr: number,
  hfc: number,
  crest: number,
): boolean {
  if (!checkSpectralGateRange(gates.flatness, flatness)) return false
  if (!checkSpectralGateRange(gates.zeroCrossingRate, zcr)) return false
  if (!checkSpectralGateRange(gates.hfcOnset, hfc)) return false
  if (!checkSpectralGateRange(gates.crest, crest)) return false
  return true
}

/** Peak frequency (Hz) within [minHz, maxHz] of an FFT magnitude array. Pure. */
export function getPeakFrequencyInRange(
  rawData: number[],
  sampleRate: number,
  fftSize: number,
  minHz: number,
  maxHz: number,
): number {
  if (!rawData.length || sampleRate <= 0 || fftSize <= 0) return 0
  const binSize = sampleRate / fftSize
  const startBin = Math.floor(minHz / binSize)
  const endBin = Math.min(Math.ceil(maxHz / binSize), rawData.length)
  let peakBin = startBin
  let maxVal = 0
  for (let i = startBin; i < endBin; i++) {
    if (rawData[i] > maxVal) {
      maxVal = rawData[i]
      peakBin = i
    }
  }
  return peakBin * binSize
}

/** Per-trigger mutable state the caller owns and passes back each frame. */
export interface BandTriggerState {
  smoothedBandEnergy: Map<string, number>
  bandSmoothTime: Map<string, number>
  triggerPhase: Map<string, 'idle' | 'active'>
  triggerEnterTime: Map<string, number>
}

/**
 * Envelope-follow a trigger's raw band energy. Default (no attackMs/releaseMs) is a frame-rate-EMA;
 * setting either opts into the asymmetric attack/release follower. Advances the per-trigger state.
 */
export function smoothBandEnergy(
  state: BandTriggerState,
  trigger: AudioTriggerNode,
  bandEnergy: number,
  nowMs: number,
): number {
  const prevSmoothed = state.smoothedBandEnergy.get(trigger.id) ?? bandEnergy
  const asymmetric = trigger.attackMs != null || trigger.releaseMs != null
  let smoothedEnergy: number
  if (asymmetric) {
    const prevTime = state.bandSmoothTime.get(trigger.id)
    // First frame (or after a stop): seed without decay, like the EMA path's `?? bandEnergy`.
    if (prevTime == null) {
      smoothedEnergy = bandEnergy
    } else {
      smoothedEnergy = asymmetricEnvelopeStep(
        prevSmoothed,
        bandEnergy,
        nowMs - prevTime,
        trigger.attackMs ?? DEFAULT_ATTACK_MS,
        trigger.releaseMs ?? DEFAULT_RELEASE_MS,
      )
    }
    state.bandSmoothTime.set(trigger.id, nowMs)
  } else {
    const smoothing = clamp(trigger.smoothing ?? DEFAULT_EMA_SMOOTHING, 0, 1)
    const alpha = 1 - smoothing
    smoothedEnergy = alpha * bandEnergy + (1 - alpha) * prevSmoothed
  }
  state.smoothedBandEnergy.set(trigger.id, smoothedEnergy)
  return smoothedEnergy
}

/** Which output ports the caller should fire this frame. Enter fires on the idle->active edge, during
 *  fires every active frame, exit fires on the active->idle edge. */
export type BandTriggerFire = 'enter' | 'during' | 'exit'

export interface BandTriggerResult {
  fire: BandTriggerFire[]
  context: TriggerContext
}

/**
 * Evaluate an audio-trigger node against the current audio frame. Advances the per-trigger state
 * (smoothing + phase machine with hysteresis and hold) and returns which output ports fire plus the
 * band-metrics context to inject downstream. Returns null when the frame has no usable FFT data.
 */
export function evaluateBandTrigger(
  trigger: AudioTriggerNode,
  audioData: AudioLightingData,
  bands: readonly { id: string; minHz: number; maxHz: number }[],
  state: BandTriggerState,
  nowMs: number,
): BandTriggerResult | null {
  const { rawFrequencyData, sampleRate, fftSize } = audioData
  if (!rawFrequencyData?.length || sampleRate == null || fftSize == null) return null

  const { frequencyRange, threshold } = trigger
  const minHz = clamp(frequencyRange.minHz, 20, 20000)
  const maxHz = clamp(frequencyRange.maxHz, 20, 20000)
  const triggerThreshold = clamp(threshold, 0, 1)
  const hysteresis = clamp(trigger.hysteresis ?? 0, 0, 1)
  const holdMs = Math.max(0, trigger.holdMs ?? 0)
  const releaseThreshold = Math.max(0, triggerThreshold - hysteresis)

  const bandEnergy = getBandEnergy(rawFrequencyData, sampleRate, fftSize, minHz, maxHz)
  const smoothedEnergy = smoothBandEnergy(state, trigger, bandEnergy, nowMs)
  const peakFreq = getPeakFrequencyInRange(rawFrequencyData, sampleRate, fftSize, minHz, maxHz)

  const matchedBandId = findBestMatchingBandId(bands, minHz, maxHz)
  const bandFeat =
    matchedBandId != null ? audioData.bandSpectralFeatures?.[matchedBandId] : undefined
  const flatnessForGate = bandFeat?.flatness ?? audioData.spectralFlatness ?? 0
  const crestForGate = bandFeat?.crest ?? audioData.spectralCrest ?? 0
  const zcrGlobal = audioData.zeroCrossingRate ?? 0
  const hfcGlobal = audioData.hfcOnset ?? 0

  const gates = trigger.spectralGates
  const spectralOk =
    gates == null
      ? true
      : spectralGatesPass(gates, flatnessForGate, zcrGlobal, hfcGlobal, crestForGate)

  const onsetThreshold = clamp(trigger.onsetThreshold ?? 0.3, 0, 1)
  let onsetOk = true
  if (trigger.useOnsetGating && matchedBandId != null && audioData.bandOnsets) {
    const o = audioData.bandOnsets[matchedBandId] ?? 0
    onsetOk = o >= onsetThreshold
  }

  const phase = state.triggerPhase.get(trigger.id) ?? 'idle'
  const enterTime = state.triggerEnterTime.get(trigger.id) ?? 0

  let energyActive: boolean
  if (phase === 'idle') {
    energyActive = bandEnergy >= triggerThreshold
  } else if (bandEnergy >= releaseThreshold) {
    energyActive = true
  } else {
    energyActive = nowMs - enterTime < holdMs
  }

  const shouldBeActive = energyActive && spectralOk && onsetOk

  const context: TriggerContext = {
    triggerLevel: smoothedEnergy,
    triggerFrequencyMin: minHz,
    triggerFrequencyMax: maxHz,
    triggerPeakFrequency: peakFreq,
    triggerBandAmplitude: smoothedEnergy,
  }
  if (matchedBandId != null) {
    context.triggerMatchedBandId = matchedBandId
  }
  if (bandFeat) {
    context.triggerBandFlatness = bandFeat.flatness
    context.triggerBandCrest = bandFeat.crest
    context.triggerBandCentroid = bandFeat.centroid
  }
  if (matchedBandId != null && audioData.bandOnsets) {
    context.triggerBandOnset = audioData.bandOnsets[matchedBandId] ?? 0
  }

  const fire: BandTriggerFire[] = []
  if (!shouldBeActive) {
    if (phase === 'active') {
      state.triggerPhase.set(trigger.id, 'idle')
      state.triggerEnterTime.delete(trigger.id)
      fire.push('exit')
    }
    return { fire, context }
  }

  if (phase === 'idle') {
    state.triggerPhase.set(trigger.id, 'active')
    state.triggerEnterTime.set(trigger.id, nowMs)
    fire.push('enter')
  }
  state.triggerPhase.set(trigger.id, 'active')
  fire.push('during')
  return { fire, context }
}
