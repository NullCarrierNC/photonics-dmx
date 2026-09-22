/**
 * Cue selection payloads: cue and motion selection modes, cue types, cue refs and disabled cue maps.
 */

import type { AudioCueType } from '../../../photonics-dmx/cues/types/audioCueTypes'
import type { ValidationResult } from './primitives'
import { CueType } from '../../../photonics-dmx/cues/types/cueTypes'
import { AudioCueRegistry } from '../../../photonics-dmx/cues/registries/AudioCueRegistry'
import {
  isPlainObject,
  isNonEmptyString,
  validateNumberInRange,
  validateStringUnion,
} from './primitives'
import { MAX_BPM, MIN_BPM } from '../../../photonics-dmx/listeners/YARG/yargFieldBounds'

const YARG_AUDIO_MOTION_SELECTION_MODES = ['oncePerSong', 'perCueChange', 'none'] as const
const CUE_GROUP_SELECTION_MODES = ['oncePerSong', 'withinSong'] as const
const STAGE_KIT_PRIORITIES = ['prefer-for-tracked', 'random', 'never'] as const
export const RB3_PROCESSING_MODES = ['direct', 'cue'] as const

export type YargAudioMotionSelectionMode = (typeof YARG_AUDIO_MOTION_SELECTION_MODES)[number]
export type CueGroupSelectionMode = (typeof CUE_GROUP_SELECTION_MODES)[number]
export type StageKitPriority = (typeof STAGE_KIT_PRIORITIES)[number]

export function validateMotionSelectionMode(
  value: unknown,
): ValidationResult<YargAudioMotionSelectionMode> {
  return validateStringUnion(value, YARG_AUDIO_MOTION_SELECTION_MODES, 'selection mode')
}

export function validateCueGroupSelectionMode(
  value: unknown,
): ValidationResult<CueGroupSelectionMode> {
  return validateStringUnion(value, CUE_GROUP_SELECTION_MODES, 'cue group selection mode')
}

export function validateStageKitPriority(value: unknown): ValidationResult<StageKitPriority> {
  return validateStringUnion(value, STAGE_KIT_PRIORITIES, 'stage kit priority')
}

const CUE_TYPE_VALUES = new Set<string>(Object.values(CueType))

/**
 * Structural validation for a YARG `CueType`. Returns the narrowed enum value on success.
 */
export function validateCueType(value: unknown): ValidationResult<CueType> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, error: 'cueType is required' }
  }
  if (!CUE_TYPE_VALUES.has(value)) {
    return { ok: false, error: `cueType '${value}' is not a known CueType` }
  }
  return { ok: true, value: value as CueType }
}

const VENUE_SIZES = ['NoVenue', 'Small', 'Large'] as const

/**
 * What a test-effect start runs: a known cue type, with the venue, BPM and cue group it asks for.
 */
export interface TestEffectRequest {
  effectId: CueType
  venueSize?: (typeof VENUE_SIZES)[number]
  bpm?: number
  cueGroup?: string
}

/**
 * Validates a test-effect start. The BPM is held to the range the YARG listener accepts from the
 * game, so a simulated song can do nothing a real one cannot.
 */
export function validateTestEffectPayload(data: unknown): ValidationResult<TestEffectRequest> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Invalid test effect payload' }
  }
  const effectId = validateCueType(data.effectId)
  if (!effectId.ok) return effectId
  const request: TestEffectRequest = { effectId: effectId.value }
  if (data.venueSize !== undefined) {
    const venueSize = validateStringUnion(data.venueSize, VENUE_SIZES, 'venueSize')
    if (!venueSize.ok) return venueSize
    request.venueSize = venueSize.value
  }
  if (data.bpm !== undefined) {
    const bpm = validateNumberInRange(data.bpm, MIN_BPM, MAX_BPM, 'bpm')
    if (!bpm.ok) return bpm
    request.bpm = bpm.value
  }
  if (data.cueGroup !== undefined) {
    if (typeof data.cueGroup !== 'string') {
      return { ok: false, error: 'cueGroup must be a string' }
    }
    request.cueGroup = data.cueGroup
  }
  return { ok: true, value: request }
}

/**
 * Validates an audio cue type against the runtime AudioCueRegistry. Optionally restricts to
 * currently-enabled cues; defaults to the full registered set so handlers can decide.
 */
export function validateAudioCueType(
  value: unknown,
  options: { onlyEnabled?: boolean } = {},
): ValidationResult<AudioCueType> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, error: 'cueType is required' }
  }
  const registry = AudioCueRegistry.getInstance()
  const known = registry.getAvailableCueTypes(!options.onlyEnabled)
  if (!known.includes(value)) {
    return { ok: false, error: `audio cueType '${value}' is not registered` }
  }
  return { ok: true, value }
}

/**
 * Validates a `{ groupId, cueId }` cue-ref payload (or null). Used by the audio/YARG motion
 * "active cue ref" channels.
 */
export function validateCueRefPayload(
  value: unknown,
): ValidationResult<{ groupId: string; cueId: string } | null> {
  if (value === null || value === undefined) {
    return { ok: true, value: null }
  }
  if (!isPlainObject(value)) {
    return { ok: false, error: 'cue ref must be an object with groupId and cueId' }
  }
  const groupId = typeof value.groupId === 'string' ? value.groupId.trim() : ''
  const cueId = typeof value.cueId === 'string' ? value.cueId.trim() : ''
  if (!groupId || !cueId) {
    return { ok: false, error: 'groupId and cueId are required' }
  }
  return { ok: true, value: { groupId, cueId } }
}

/**
 * Validates per-group disabled cue id maps (Preferences → registry).
 */
export function validateDisabledCuesMap(
  value: unknown,
  fieldName: string,
): ValidationResult<Record<string, string[]>> {
  if (!isPlainObject(value)) {
    return { ok: false, error: `${fieldName} must be an object` }
  }
  const out: Record<string, string[]> = {}
  for (const [groupId, arr] of Object.entries(value)) {
    if (!isNonEmptyString(groupId)) {
      return { ok: false, error: `${fieldName} keys must be non-empty strings` }
    }
    if (!Array.isArray(arr)) {
      return { ok: false, error: `${fieldName}.${groupId} must be an array` }
    }
    const ids: string[] = []
    for (const entry of arr) {
      if (!isNonEmptyString(entry)) {
        return { ok: false, error: `${fieldName}.${groupId} must contain only non-empty strings` }
      }
      ids.push(entry.trim())
    }
    out[groupId] = ids
  }
  return { ok: true, value: out }
}
