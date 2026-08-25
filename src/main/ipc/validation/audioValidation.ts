/**
 * Audio listener payloads: device and band configuration, idle detection and audio game mode.
 */

import type { Brightness, Color } from '../../../photonics-dmx/types'
import type { AudioGameModeConfig } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
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

function validateIdleDetectionPayload(data: unknown): ValidationResult<Record<string, unknown>> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'idleDetection must be an object' }
  }
  const o = data as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if ('enabled' in o) {
    if (typeof o.enabled !== 'boolean') {
      return { ok: false, error: 'idleDetection.enabled must be a boolean' }
    }
    out.enabled = o.enabled
  }
  if ('thresholdPct' in o) {
    const t = validateNumberInRange(o.thresholdPct, 0, 100, 'idleDetection.thresholdPct')
    if (!t.ok) return t
    out.thresholdPct = t.value
  }
  if ('minIdleSeconds' in o) {
    const t = validateNumberInRange(o.minIdleSeconds, 0, 600, 'idleDetection.minIdleSeconds')
    if (!t.ok) return t
    out.minIdleSeconds = t.value
  }
  if ('resumeSeconds' in o) {
    const t = validateNumberInRange(o.resumeSeconds, 0, 60, 'idleDetection.resumeSeconds')
    if (!t.ok) return t
    out.resumeSeconds = t.value
  }
  if ('idleColor' in o) {
    if (!VALID_AUDIO_IDLE_COLORS.has(o.idleColor as Color)) {
      return { ok: false, error: 'idleDetection.idleColor is not a valid color' }
    }
    out.idleColor = o.idleColor
  }
  if ('idleBrightness' in o) {
    if (!VALID_AUDIO_IDLE_BRIGHTNESS.has(o.idleBrightness as Brightness)) {
      return { ok: false, error: 'idleDetection.idleBrightness is not a valid brightness' }
    }
    out.idleBrightness = o.idleBrightness
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: 'idleDetection contains no valid keys' }
  }

  return { ok: true, value: out }
}

/**
 * Validates a single audio band definition
 */
function validateAudioBand(band: unknown): ValidationResult<Record<string, unknown>> {
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
export function validateAudioConfigPayload(
  data: unknown,
): ValidationResult<Record<string, unknown>> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Audio configuration payload must be an object' }
  }

  const cleaned: Record<string, unknown> = {}
  for (const key of Object.keys(data)) {
    if (AUDIO_CONFIG_KEYS.has(key)) {
      // Special validation for bands array
      if (key === 'bands') {
        if (!Array.isArray(data[key])) {
          return { ok: false, error: 'Audio bands must be an array' }
        }
        const bandsArray = data[key] as unknown[]
        if (bandsArray.length !== 8) {
          return { ok: false, error: 'Audio bands must contain exactly 8 bands' }
        }
        const validatedBands: Record<string, unknown>[] = []
        for (let i = 0; i < bandsArray.length; i++) {
          const bandResult = validateAudioBand(bandsArray[i])
          if (!bandResult.ok) {
            return { ok: false, error: `Audio band ${i + 1}: ${bandResult.error}` }
          }
          validatedBands.push(bandResult.value)
        }
        cleaned[key] = validatedBands
      } else if (key === 'strobeEnabled') {
        const v = data[key]
        if (typeof v !== 'boolean') {
          return { ok: false, error: 'strobeEnabled must be a boolean' }
        }
        cleaned[key] = v
      } else if (key === 'strobeTriggerThreshold') {
        const t = validateNumberInRange(data[key], 0, 1, 'strobeTriggerThreshold')
        if (!t.ok) {
          return t
        }
        cleaned[key] = t.value
      } else if (key === 'strobeProbability') {
        const t = validateNumberInRange(data[key], 0, 100, 'strobeProbability')
        if (!t.ok) {
          return t
        }
        cleaned[key] = t.value
      } else if (key === 'idleDetection') {
        const idResult = validateIdleDetectionPayload(data[key])
        if (!idResult.ok) {
          return idResult
        }
        cleaned[key] = idResult.value
      } else {
        cleaned[key] = data[key]
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
