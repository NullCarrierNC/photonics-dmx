import type { AudioLightingData } from '../../photonics-dmx/listeners/Audio/AudioTypes'

/**
 * Permissive sanity caps for renderer-supplied audio frame payloads. These exist to bound memory
 * usage if the renderer is compromised; they're intentionally larger than the values the audio
 * pipeline actually produces so legitimate frames are never rejected.
 */
const MAX_RAW_FREQUENCY_DATA_LENGTH = 32768 // half of the largest Web Audio AnalyserNode fftSize, doubled for headroom
const MAX_MEL_BANDS_LENGTH = 256 // analyser default is 24
const MAX_CHROMAGRAM_LENGTH = 64 // analyser produces exactly 12 pitch classes
const MAX_BAND_RECORD_KEYS = 256 // bandSpectralFeatures / bandOnsets keyed by band id (config has 8 by default)

export type AudioLightingValidationResult =
  | { ok: true; value: AudioLightingData }
  | { ok: false; error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown, _field: string): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return value
}

function optionalFiniteNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  const n = finiteNumber(value, field)
  if (n === null) {
    throw new Error(`${field} must be a finite number when present`)
  }
  return n
}

function optionalUnitInterval(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  const n = finiteNumber(value, field)
  if (n === null) {
    throw new Error(`${field} must be a finite number when present`)
  }
  if (n < 0 || n > 1) {
    throw new Error(`${field} must be between 0 and 1`)
  }
  return n
}

function optionalNumberArray(
  value: unknown,
  field: string,
  maxLength: number,
): number[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array when present`)
  }
  if (value.length > maxLength) {
    throw new Error(`${field} length ${value.length} exceeds maximum ${maxLength}`)
  }
  const out: number[] = []
  for (let i = 0; i < value.length; i++) {
    const n = finiteNumber(value[i], `${field}[${i}]`)
    if (n === null) {
      throw new Error(`${field}[${i}] must be a finite number`)
    }
    out.push(n)
  }
  return out
}

function optionalNumberRecord(
  value: unknown,
  field: string,
  maxKeys: number,
): Record<string, number> | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    throw new Error(`${field} must be an object when present`)
  }
  const entries = Object.entries(value)
  if (entries.length > maxKeys) {
    throw new Error(`${field} has ${entries.length} keys; maximum is ${maxKeys}`)
  }
  const out: Record<string, number> = {}
  for (const [k, v] of entries) {
    const n = finiteNumber(v, `${field}.${k}`)
    if (n === null) {
      throw new Error(`${field}.${k} must be a finite number`)
    }
    out[k] = n
  }
  return out
}

function optionalBandSpectralFeatures(
  value: unknown,
  field: string,
):
  | Record<
      string,
      {
        flatness: number
        crest: number
        centroid: number
      }
    >
  | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    throw new Error(`${field} must be an object when present`)
  }
  const entries = Object.entries(value)
  if (entries.length > MAX_BAND_RECORD_KEYS) {
    throw new Error(`${field} has ${entries.length} keys; maximum is ${MAX_BAND_RECORD_KEYS}`)
  }
  const out: Record<string, { flatness: number; crest: number; centroid: number }> = {}
  for (const [k, v] of entries) {
    if (!isPlainObject(v)) {
      throw new Error(`${field}.${k} must be an object`)
    }
    const flatness = finiteNumber(v.flatness, `${field}.${k}.flatness`)
    const crest = finiteNumber(v.crest, `${field}.${k}.crest`)
    const centroid = finiteNumber(v.centroid, `${field}.${k}.centroid`)
    if (flatness === null || crest === null || centroid === null) {
      throw new Error(`${field}.${k} requires numeric flatness, crest, and centroid`)
    }
    out[k] = { flatness, crest, centroid }
  }
  return out
}

/**
 * Validates renderer-supplied audio analysis frames before they reach AudioCueProcessor.
 * Rejects malformed payloads; optional fields are checked only when present.
 */
export function validateAudioLightingData(raw: unknown): AudioLightingValidationResult {
  try {
    if (!isPlainObject(raw)) {
      return { ok: false, error: 'Audio frame must be a plain object' }
    }

    const timestamp = finiteNumber(raw.timestamp, 'timestamp')
    if (timestamp === null) {
      return { ok: false, error: 'timestamp must be a finite number' }
    }

    const overallLevel = finiteNumber(raw.overallLevel, 'overallLevel')
    if (overallLevel === null || overallLevel < 0 || overallLevel > 1) {
      return { ok: false, error: 'overallLevel must be a number between 0 and 1' }
    }

    const energy = finiteNumber(raw.energy, 'energy')
    if (energy === null || energy < 0 || energy > 1) {
      return { ok: false, error: 'energy must be a number between 0 and 1' }
    }

    if (typeof raw.beatDetected !== 'boolean') {
      return { ok: false, error: 'beatDetected must be a boolean' }
    }

    let bpm: number | null = null
    if (raw.bpm !== undefined && raw.bpm !== null) {
      const n = finiteNumber(raw.bpm, 'bpm')
      if (n === null || n < 0) {
        return { ok: false, error: 'bpm must be null or a non-negative finite number' }
      }
      bpm = n
    }

    const value: AudioLightingData = {
      timestamp,
      overallLevel,
      bpm,
      beatDetected: raw.beatDetected,
      energy,
    }

    if (raw.bpmConfidence !== undefined) {
      // The AudioLightingData type does not allow null for this optional field; reject it explicitly
      // rather than coercing so callers can distinguish "absent" from "null".
      if (raw.bpmConfidence === null) {
        return { ok: false, error: 'bpmConfidence must be omitted, not null' }
      }
      const c = finiteNumber(raw.bpmConfidence, 'bpmConfidence')
      if (c === null || c < 0 || c > 1) {
        return { ok: false, error: 'bpmConfidence must be between 0 and 1' }
      }
      value.bpmConfidence = c
    }

    value.rawFrequencyData = optionalNumberArray(
      raw.rawFrequencyData,
      'rawFrequencyData',
      MAX_RAW_FREQUENCY_DATA_LENGTH,
    )
    value.sampleRate = optionalFiniteNumber(raw.sampleRate, 'sampleRate')
    value.fftSize = optionalFiniteNumber(raw.fftSize, 'fftSize')
    value.peakFrequency = optionalFiniteNumber(raw.peakFrequency, 'peakFrequency')
    // amplitude / spectral* / hfcOnset / zeroCrossingRate are documented 0–1 in AudioTypes.
    value.amplitude = optionalUnitInterval(raw.amplitude, 'amplitude')
    value.spectralCentroid = optionalUnitInterval(raw.spectralCentroid, 'spectralCentroid')
    value.spectralFlatness = optionalUnitInterval(raw.spectralFlatness, 'spectralFlatness')
    value.spectralRolloff = optionalUnitInterval(raw.spectralRolloff, 'spectralRolloff')
    value.spectralCrest = optionalUnitInterval(raw.spectralCrest, 'spectralCrest')
    value.spectralSpread = optionalUnitInterval(raw.spectralSpread, 'spectralSpread')
    value.hfcOnset = optionalUnitInterval(raw.hfcOnset, 'hfcOnset')
    value.zeroCrossingRate = optionalUnitInterval(raw.zeroCrossingRate, 'zeroCrossingRate')
    value.melBands = optionalNumberArray(raw.melBands, 'melBands', MAX_MEL_BANDS_LENGTH)
    value.chromagram = optionalNumberArray(raw.chromagram, 'chromagram', MAX_CHROMAGRAM_LENGTH)

    if (raw.detectedKey !== undefined) {
      if (typeof raw.detectedKey !== 'string') {
        return { ok: false, error: 'detectedKey must be a string when present' }
      }
      value.detectedKey = raw.detectedKey
    }
    if (raw.detectedKeyStrength !== undefined) {
      const s = finiteNumber(raw.detectedKeyStrength, 'detectedKeyStrength')
      if (s === null || s < 0 || s > 1) {
        return { ok: false, error: 'detectedKeyStrength must be between 0 and 1' }
      }
      value.detectedKeyStrength = s
    }

    value.bandSpectralFeatures = optionalBandSpectralFeatures(
      raw.bandSpectralFeatures,
      'bandSpectralFeatures',
    )
    value.bandOnsets = optionalNumberRecord(raw.bandOnsets, 'bandOnsets', MAX_BAND_RECORD_KEYS)

    return { ok: true, value }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
