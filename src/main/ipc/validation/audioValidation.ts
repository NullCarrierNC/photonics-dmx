/**
 * Audio listener payloads: device and band configuration, idle detection and audio game mode.
 */

import type { Brightness, Color } from '../../../photonics-dmx/types'
import type {
  AudioBandDefinition,
  AudioConfig,
  AudioGameModeConfig,
  AudioIdleDetectionConfig,
} from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import type { ValidationResult } from './primitives'
import {
  AUDIO_BAND_GAIN_MAX,
  AUDIO_BAND_GAIN_MIN,
} from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import { isPlainObject, isNonEmptyString, validateNumberInRange } from './primitives'

const AUDIO_CONFIG_KEYS = new Set([
  'deviceId',
  'fftSize',
  'sensitivity',
  'noiseFloor',
  'bands',
  'beatDetection',
  'smoothing',
  'enabled',
  'linearResponse',
  'strobeEnabled',
  'strobeTriggerThreshold',
  'strobeProbability',
  'idleDetection',
])

const VALID_AUDIO_IDLE_COLORS = new Set<Color>([
  'red',
  'blue',
  'yellow',
  'green',
  'cyan',
  'orange',
  'purple',
  'chartreuse',
  'teal',
  'violet',
  'magenta',
  'vermilion',
  'amber',
  'white',
  'black',
  'transparent',
])

const VALID_AUDIO_IDLE_BRIGHTNESS = new Set<Brightness>(['low', 'medium', 'high', 'max', 'linear'])

const WEB_AUDIO_FFT_MIN = 32
const WEB_AUDIO_FFT_MAX = 32768

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0
}

function validateFftSize(value: unknown): ValidationResult<number> {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false, error: 'fftSize must be an integer' }
  }
  if (value < WEB_AUDIO_FFT_MIN || value > WEB_AUDIO_FFT_MAX) {
    return {
      ok: false,
      error: `fftSize must be between ${WEB_AUDIO_FFT_MIN} and ${WEB_AUDIO_FFT_MAX}`,
    }
  }
  if (!isPowerOfTwo(value)) {
    return { ok: false, error: 'fftSize must be a power of 2' }
  }
  return { ok: true, value }
}

function validateBeatDetectionPayload(
  data: unknown,
): ValidationResult<AudioConfig['beatDetection']> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'beatDetection must be an object' }
  }
  const o = data as Record<string, unknown>
  const threshold = validateNumberInRange(o.threshold, 0.1, 1.0, 'beatDetection.threshold')
  if (!threshold.ok) return threshold
  const decayRate = validateNumberInRange(o.decayRate, 0.8, 0.99, 'beatDetection.decayRate')
  if (!decayRate.ok) return decayRate
  const minInterval = validateNumberInRange(o.minInterval, 50, 500, 'beatDetection.minInterval')
  if (!minInterval.ok) return minInterval
  return {
    ok: true,
    value: {
      threshold: threshold.value,
      decayRate: decayRate.value,
      minInterval: Math.round(minInterval.value),
    },
  }
}

function validateSmoothingPayload(data: unknown): ValidationResult<AudioConfig['smoothing']> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'smoothing must be an object' }
  }
  const o = data as Record<string, unknown>
  if (typeof o.enabled !== 'boolean') {
    return { ok: false, error: 'smoothing.enabled must be a boolean' }
  }
  const alpha = validateNumberInRange(o.alpha, 0.1, 0.95, 'smoothing.alpha')
  if (!alpha.ok) return alpha
  return { ok: true, value: { enabled: o.enabled, alpha: alpha.value } }
}

function validateCompleteIdleDetectionPayload(
  data: unknown,
): ValidationResult<AudioIdleDetectionConfig> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'idleDetection must be an object' }
  }
  const o = data as Record<string, unknown>
  if (typeof o.enabled !== 'boolean') {
    return { ok: false, error: 'idleDetection.enabled must be a boolean' }
  }
  const thresholdPct = validateNumberInRange(o.thresholdPct, 0, 100, 'idleDetection.thresholdPct')
  if (!thresholdPct.ok) return thresholdPct
  const minIdleSeconds = validateNumberInRange(
    o.minIdleSeconds,
    0,
    600,
    'idleDetection.minIdleSeconds',
  )
  if (!minIdleSeconds.ok) return minIdleSeconds
  const resumeSeconds = validateNumberInRange(o.resumeSeconds, 0, 60, 'idleDetection.resumeSeconds')
  if (!resumeSeconds.ok) return resumeSeconds
  if (!VALID_AUDIO_IDLE_COLORS.has(o.idleColor as Color)) {
    return { ok: false, error: 'idleDetection.idleColor is not a valid color' }
  }
  if (!VALID_AUDIO_IDLE_BRIGHTNESS.has(o.idleBrightness as Brightness)) {
    return { ok: false, error: 'idleDetection.idleBrightness is not a valid brightness' }
  }
  return {
    ok: true,
    value: {
      enabled: o.enabled,
      thresholdPct: thresholdPct.value,
      minIdleSeconds: minIdleSeconds.value,
      resumeSeconds: resumeSeconds.value,
      idleColor: o.idleColor as Color,
      idleBrightness: o.idleBrightness as Brightness,
    },
  }
}

/**
 * Validates a single audio band definition
 */
function validateAudioBand(band: unknown): ValidationResult<AudioBandDefinition> {
  if (!isPlainObject(band)) {
    return { ok: false, error: 'Audio band must be an object' }
  }

  const bandObj = band as Record<string, unknown>

  // Validate id
  if (!isNonEmptyString(bandObj.id)) {
    return { ok: false, error: 'Audio band id must be a non-empty string' }
  }

  // Validate name
  if (!isNonEmptyString(bandObj.name)) {
    return { ok: false, error: 'Audio band name must be a non-empty string' }
  }

  // Validate minHz
  const minHzResult = validateNumberInRange(bandObj.minHz, 20, 20000, 'Audio band minHz')
  if (!minHzResult.ok) return minHzResult

  // Validate maxHz
  const maxHzResult = validateNumberInRange(bandObj.maxHz, 20, 20000, 'Audio band maxHz')
  if (!maxHzResult.ok) return maxHzResult

  // Validate minHz < maxHz
  if (minHzResult.value >= maxHzResult.value) {
    return { ok: false, error: 'Audio band minHz must be less than maxHz' }
  }

  // Validate gain
  const gainResult = validateNumberInRange(
    bandObj.gain,
    AUDIO_BAND_GAIN_MIN,
    AUDIO_BAND_GAIN_MAX,
    'Audio band gain',
  )
  if (!gainResult.ok) return gainResult

  return {
    ok: true,
    value: {
      id: bandObj.id,
      name: bandObj.name,
      minHz: minHzResult.value,
      maxHz: maxHzResult.value,
      gain: gainResult.value,
    },
  }
}

/**
 * Validates an audio configuration update payload, stripping unknown keys.
 */
export function validateAudioConfigPayload(data: unknown): ValidationResult<Partial<AudioConfig>> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Audio configuration payload must be an object' }
  }

  const cleaned: Partial<AudioConfig> = {}
  for (const key of Object.keys(data)) {
    if (AUDIO_CONFIG_KEYS.has(key)) {
      const value = data[key]
      // Special validation for bands array
      if (key === 'bands') {
        if (!Array.isArray(value)) {
          return { ok: false, error: 'Audio bands must be an array' }
        }
        const bandsArray = value as unknown[]
        if (bandsArray.length !== 8) {
          return { ok: false, error: 'Audio bands must contain exactly 8 bands' }
        }
        const validatedBands: AudioBandDefinition[] = []
        for (let i = 0; i < bandsArray.length; i++) {
          const bandResult = validateAudioBand(bandsArray[i])
          if (!bandResult.ok) {
            return { ok: false, error: `Audio band ${i + 1}: ${bandResult.error}` }
          }
          validatedBands.push(bandResult.value)
        }
        cleaned.bands = validatedBands
      } else if (key === 'strobeEnabled') {
        if (typeof value !== 'boolean') {
          return { ok: false, error: 'strobeEnabled must be a boolean' }
        }
        cleaned.strobeEnabled = value
      } else if (key === 'strobeTriggerThreshold') {
        const t = validateNumberInRange(value, 0, 1, 'strobeTriggerThreshold')
        if (!t.ok) {
          return t
        }
        cleaned.strobeTriggerThreshold = t.value
      } else if (key === 'strobeProbability') {
        const t = validateNumberInRange(value, 0, 100, 'strobeProbability')
        if (!t.ok) {
          return t
        }
        cleaned.strobeProbability = t.value
      } else if (key === 'idleDetection') {
        const idResult = validateCompleteIdleDetectionPayload(value)
        if (!idResult.ok) {
          return idResult
        }
        cleaned.idleDetection = idResult.value
      } else if (key === 'deviceId') {
        // undefined is the system default device. An empty string is not a device the capture
        // layer can resolve, and the UI renders it as the default while prefs disagree.
        if (value !== undefined && !isNonEmptyString(value)) {
          return { ok: false, error: 'deviceId must be a non-empty string or undefined' }
        }
        cleaned.deviceId = value as string | undefined
      } else if (key === 'fftSize') {
        const t = validateFftSize(value)
        if (!t.ok) {
          return t
        }
        cleaned.fftSize = t.value
      } else if (key === 'sensitivity') {
        const t = validateNumberInRange(value, 0.1, 5.0, 'sensitivity')
        if (!t.ok) {
          return t
        }
        cleaned.sensitivity = t.value
      } else if (key === 'noiseFloor') {
        const t = validateNumberInRange(value, 0, 255, 'noiseFloor')
        if (!t.ok) {
          return t
        }
        cleaned.noiseFloor = Math.round(t.value)
      } else if (key === 'enabled' || key === 'linearResponse') {
        if (typeof value !== 'boolean') {
          return { ok: false, error: `${key} must be a boolean` }
        }
        cleaned[key] = value
      } else if (key === 'beatDetection') {
        const beatResult = validateBeatDetectionPayload(value)
        if (!beatResult.ok) {
          return beatResult
        }
        cleaned.beatDetection = beatResult.value
      } else if (key === 'smoothing') {
        const smoothingResult = validateSmoothingPayload(value)
        if (!smoothingResult.ok) {
          return smoothingResult
        }
        cleaned.smoothing = smoothingResult.value
      }
    }
  }

  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: 'Audio configuration payload contains no valid config keys' }
  }

  return { ok: true, value: cleaned }
}

const AUDIO_GAME_MODE_KEYS = new Set(['enabled', 'cueDurationMin', 'cueDurationMax'])

/**
 * Validates a partial game mode update, merges onto `base`, returns full config.
 */
export function validateAudioGameModePayload(
  data: unknown,
  base: AudioGameModeConfig,
): ValidationResult<AudioGameModeConfig> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Game mode payload must be an object' }
  }

  const merged: AudioGameModeConfig = { ...base }

  let hadValidKey = false
  for (const key of Object.keys(data)) {
    if (!AUDIO_GAME_MODE_KEYS.has(key)) {
      continue
    }
    hadValidKey = true
    const v = data[key]
    switch (key) {
      case 'enabled':
        if (typeof v !== 'boolean') {
          return { ok: false, error: `${key} must be a boolean` }
        }
        merged[key] = v
        break
      case 'cueDurationMin':
      case 'cueDurationMax': {
        const n = Number(v)
        if (!Number.isFinite(n) || n <= 0) {
          return { ok: false, error: `${key} must be a positive number` }
        }
        merged[key] = n
        break
      }
      default:
        break
    }
  }

  if (!hadValidKey) {
    return { ok: false, error: 'Game mode payload contains no valid keys' }
  }

  if (merged.cueDurationMin > merged.cueDurationMax) {
    return {
      ok: false,
      error: 'cueDurationMin must be less than or equal to cueDurationMax',
    }
  }

  return { ok: true, value: merged }
}
