/**
 * Fixture and rig payloads: channel numbers, strobe values, extra channels, brightness scaling, lighting configuration and rigs.
 */

import type { DmxRig, LightingConfiguration, DmxFixture } from '../../../photonics-dmx/types'
import type { ValidationResult } from './primitives'
import { ConfigStrobeType, EXTRA_CHANNEL_TYPES, FixtureTypes } from '../../../photonics-dmx/types'
import {
  isStorableBrightnessScale,
  isValidBrightnessScalePercent,
} from '../../../photonics-dmx/helpers/brightnessScaling'
import { isPlainObject } from './primitives'
import { validateRigOutputs, validateRigMirrorFlag } from './senderValidation'

const VALID_STROBE_TYPES = new Set<string>([
  ConfigStrobeType.None,
  ConfigStrobeType.Dedicated,
  ConfigStrobeType.AllCapable,
])

/**
 * Every value in a fixture `channels` record must be an integer 0–512. 0 is accepted as
 * "unassigned" (fixture templates initialise unbound slots to 0; the publisher skips it at write
 * time) — what must never persist is NaN, a negative, or an out-of-range number that would become
 * an unbounded buffer index in the wire senders. Returns null when valid.
 */
function validateFixtureChannelNumbers(
  channels: Record<string, unknown>,
  fieldName: string,
): string | null {
  for (const [name, num] of Object.entries(channels)) {
    if (num == null) {
      continue
    }
    if (typeof num !== 'number' || !Number.isInteger(num) || num < 0 || num > 512) {
      return `${fieldName}.${name} must be an integer DMX channel between 0 and 512`
    }
  }
  return null
}

/**
 * Element-validates a light array from a rig/layout payload: each entry must be an object whose
 * `channels` record passes {@link validateFixtureChannelNumbers}. Returns null when valid.
 */
function validateLightArrayChannels(lights: unknown[], fieldName: string): string | null {
  for (let i = 0; i < lights.length; i++) {
    const el = lights[i]
    if (!isPlainObject(el)) {
      return `${fieldName}[${i}] must be an object`
    }
    if (!isPlainObject(el.channels)) {
      return `${fieldName}[${i}].channels must be an object`
    }
    const channelError = validateFixtureChannelNumbers(el.channels, `${fieldName}[${i}].channels`)
    if (channelError) {
      return channelError
    }
    normalizeExtraChannelsKey(el)
    if (el.extraChannels != null) {
      const extraError = validateExtraChannels(el.extraChannels, `${fieldName}[${i}].extraChannels`)
      if (extraError) {
        return extraError
      }
    }
    if (el.brightnessScaling != null) {
      const scalingError = validateBrightnessScaling(
        el.brightnessScaling,
        `${fieldName}[${i}].brightnessScaling`,
      )
      if (scalingError) {
        return scalingError
      }
    }
    normalizeBrightnessScalingKeys(el)
  }
  return null
}

export function validateLightingConfiguration(
  data: unknown,
): ValidationResult<LightingConfiguration> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Light layout payload must be a plain object' }
  }

  const numLights = Number(data.numLights)
  if (!Number.isFinite(numLights) || numLights < 0) {
    return { ok: false, error: 'LightingConfiguration.numLights must be a non-negative number' }
  }

  if (!isPlainObject(data.lightLayout)) {
    return { ok: false, error: 'LightingConfiguration.lightLayout must be a plain object' }
  }
  const lightLayout = data.lightLayout as Record<string, unknown>
  if (typeof lightLayout.id !== 'string' || typeof lightLayout.label !== 'string') {
    return { ok: false, error: 'LightingConfiguration.lightLayout must have id and label strings' }
  }

  if (typeof data.strobeType !== 'string' || !VALID_STROBE_TYPES.has(data.strobeType)) {
    return {
      ok: false,
      error: `LightingConfiguration.strobeType must be one of: ${[...VALID_STROBE_TYPES].join(', ')}`,
    }
  }

  if (!Array.isArray(data.frontLights)) {
    return { ok: false, error: 'LightingConfiguration.frontLights must be an array' }
  }
  if (!Array.isArray(data.backLights)) {
    return { ok: false, error: 'LightingConfiguration.backLights must be an array' }
  }
  if (!Array.isArray(data.strobeLights)) {
    return { ok: false, error: 'LightingConfiguration.strobeLights must be an array' }
  }

  for (const [arrayName, lights] of [
    ['frontLights', data.frontLights],
    ['backLights', data.backLights],
    ['strobeLights', data.strobeLights],
  ] as const) {
    const lightsError = validateLightArrayChannels(lights, `LightingConfiguration.${arrayName}`)
    if (lightsError) {
      return { ok: false, error: lightsError }
    }
  }

  const value: LightingConfiguration = {
    numLights,
    lightLayout: { id: lightLayout.id, label: lightLayout.label },
    strobeType: data.strobeType as ConfigStrobeType,
    frontLights: data.frontLights as LightingConfiguration['frontLights'],
    backLights: data.backLights as LightingConfiguration['backLights'],
    strobeLights: data.strobeLights as LightingConfiguration['strobeLights'],
  }
  return { ok: true, value }
}

export function validateDmxRigPayload(data: unknown): ValidationResult<DmxRig> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'DmxRig must be a plain object' }
  }
  if (typeof data.id !== 'string' || data.id.trim().length === 0) {
    return { ok: false, error: 'DmxRig.id must be a non-empty string' }
  }
  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    return { ok: false, error: 'DmxRig.name must be a non-empty string' }
  }
  if (typeof data.active !== 'boolean') {
    return { ok: false, error: 'DmxRig.active must be a boolean' }
  }
  const cfg = validateLightingConfiguration(data.config)
  if (!cfg.ok) {
    return { ok: false, error: `DmxRig.config: ${cfg.error}` }
  }
  const outputs = validateRigOutputs(data.outputs)
  if (!outputs.ok) {
    return { ok: false, error: outputs.error }
  }
  const mirrorHoriz = validateRigMirrorFlag(data.mirrorHoriz, 'mirrorHoriz')
  if (!mirrorHoriz.ok) {
    return { ok: false, error: mirrorHoriz.error }
  }
  const mirrorVert = validateRigMirrorFlag(data.mirrorVert, 'mirrorVert')
  if (!mirrorVert.ok) {
    return { ok: false, error: mirrorVert.error }
  }
  const rig: DmxRig = {
    id: data.id.trim(),
    name: data.name.trim(),
    active: data.active,
    config: cfg.value,
  }
  if (outputs.value !== undefined) {
    rig.outputs = outputs.value
  }
  if (mirrorHoriz.value !== undefined) {
    rig.mirrorHoriz = mirrorHoriz.value
  }
  if (mirrorVert.value !== undefined) {
    rig.mirrorVert = mirrorVert.value
  }
  return { ok: true, value: rig }
}

const FIXTURE_TYPE_VALUES = new Set<string>(Object.values(FixtureTypes))

/**
 * Structural validation for CONFIG.SAVE_MY_LIGHTS (user-edited DMX fixture list from the renderer).
 */
export function validateDmxFixturesArray(
  value: unknown,
  fieldName: string = 'lights',
): ValidationResult<DmxFixture[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${fieldName} must be an array` }
  }
  for (let i = 0; i < value.length; i++) {
    const el = value[i]
    if (!isPlainObject(el)) {
      return { ok: false, error: `${fieldName}[${i}] must be an object` }
    }
    if (el.id != null && typeof el.id !== 'string') {
      return { ok: false, error: `${fieldName}[${i}].id must be string or null` }
    }
    if (typeof el.position !== 'number' || !Number.isFinite(el.position)) {
      return { ok: false, error: `${fieldName}[${i}].position must be a number` }
    }
    if (el.fixture == null || !FIXTURE_TYPE_VALUES.has(String(el.fixture))) {
      return { ok: false, error: `${fieldName}[${i}].fixture must be a valid fixture type` }
    }
    if (typeof el.label !== 'string' || typeof el.name !== 'string') {
      return { ok: false, error: `${fieldName}[${i}].label and name must be strings` }
    }
    if (typeof el.isStrobeEnabled !== 'boolean') {
      return { ok: false, error: `${fieldName}[${i}].isStrobeEnabled must be a boolean` }
    }
    if (!isPlainObject(el.channels)) {
      return { ok: false, error: `${fieldName}[${i}].channels must be an object` }
    }
    const channelError = validateFixtureChannelNumbers(el.channels, `${fieldName}[${i}].channels`)
    if (channelError) {
      return { ok: false, error: channelError }
    }
    if (el.strobeValues != null) {
      const strobeValuesError = validateStrobeChannelValues(
        el.strobeValues,
        `${fieldName}[${i}].strobeValues`,
      )
      if (strobeValuesError) {
        return { ok: false, error: strobeValuesError }
      }
    }
    normalizeExtraChannelsKey(el)
    if (el.extraChannels != null) {
      const extraError = validateExtraChannels(el.extraChannels, `${fieldName}[${i}].extraChannels`)
      if (extraError) {
        return { ok: false, error: extraError }
      }
    }
    if (el.brightnessScaling != null) {
      const scalingError = validateBrightnessScaling(
        el.brightnessScaling,
        `${fieldName}[${i}].brightnessScaling`,
      )
      if (scalingError) {
        return { ok: false, error: scalingError }
      }
    }
    normalizeBrightnessScalingKeys(el)
  }
  return { ok: true, value: value as DmxFixture[] }
}

const EXTRA_CHANNEL_TYPE_VALUES = new Set<string>(EXTRA_CHANNEL_TYPES)

/**
 * Validates a fixture's `extraChannels` array (user-added channels beyond the archetype map).
 * Returns null when valid, or an error message string when not. Each entry must have a valid `type`
 * from the extra-channel vocabulary, an integer `channel` 0–512 (0 = unassigned, same rule as the
 * base channels), and — only for `fixed` channels — an integer `value` 0–255. A `value` on a
 * non-fixed row is rejected (it would ride through sync forever and break import dedup).
 *
 * Callers must first normalise a nullish or empty array to a missing key (the invariant is "never
 * persist `[]`"); this validator only runs when `extraChannels` is a non-null array.
 */
function validateExtraChannels(value: unknown, fieldName: string): string | null {
  if (!Array.isArray(value)) {
    return `${fieldName} must be an array`
  }
  for (let i = 0; i < value.length; i++) {
    const ec = value[i]
    if (!isPlainObject(ec)) {
      return `${fieldName}[${i}] must be an object`
    }
    if (typeof ec.type !== 'string' || !EXTRA_CHANNEL_TYPE_VALUES.has(ec.type)) {
      return `${fieldName}[${i}].type must be a valid extra-channel type`
    }
    if (
      typeof ec.channel !== 'number' ||
      !Number.isInteger(ec.channel) ||
      ec.channel < 0 ||
      ec.channel > 512
    ) {
      return `${fieldName}[${i}].channel must be an integer DMX channel between 0 and 512`
    }
    if (ec.type === 'fixed') {
      if (
        typeof ec.value !== 'number' ||
        !Number.isInteger(ec.value) ||
        ec.value < 0 ||
        ec.value > 255
      ) {
        return `${fieldName}[${i}].value must be an integer between 0 and 255 for a fixed channel`
      }
    } else if (ec.value !== undefined) {
      // Rejects a present value on a non-fixed row — including a literal `null`, which would
      // otherwise persist and defeat template dedup against an identical value-less row.
      return `${fieldName}[${i}].value is only valid on a fixed channel`
    }
    if (ec.type === 'fixed') {
      if (ec.scale !== undefined) {
        // A fixed channel is a pinned constant, so a scale on it would never be applied, and it
        // would ride through sync forever, the same dedup hazard as a value on a colour row.
        return `${fieldName}[${i}].scale is not valid on a fixed channel`
      }
    } else if (ec.scale !== undefined && !isValidBrightnessScalePercent(ec.scale)) {
      return `${fieldName}[${i}].scale must be an integer percent between 0 and 100`
    }
  }
  return null
}

const BRIGHTNESS_SCALING_KEYS = ['red', 'green', 'blue'] as const
const BRIGHTNESS_SCALING_KEY_SET = new Set<string>(BRIGHTNESS_SCALING_KEYS)

/**
 * Validates a fixture's `brightnessScaling`: integer percents 0–100, keys limited to red/green/blue
 * (an unrecognised one would ride through sync and defeat dedup). Null when valid.
 */
function validateBrightnessScaling(value: unknown, fieldName: string): string | null {
  if (!isPlainObject(value)) {
    return `${fieldName} must be a plain object`
  }
  for (const [key, percent] of Object.entries(value)) {
    if (!BRIGHTNESS_SCALING_KEY_SET.has(key)) {
      return `${fieldName}.${key} is not a scalable colour channel`
    }
    if (percent !== undefined && !isValidBrightnessScalePercent(percent)) {
      return `${fieldName}.${key} must be an integer percent between 0 and 100`
    }
  }
  return null
}

/**
 * Applies the "never persist a 100% scale" invariant in place. Normalised rather than rejected,
 * because a hand-edited config may reasonably say 100; it just must not reach storage, where it
 * would stop an unscaled fixture deep-equalling one that omits the field.
 */
function normalizeBrightnessScalingKeys(el: Record<string, unknown>): void {
  const scaling = el.brightnessScaling
  if (isPlainObject(scaling)) {
    for (const key of BRIGHTNESS_SCALING_KEYS) {
      if (!isStorableBrightnessScale(scaling[key])) delete scaling[key]
    }
    if (Object.keys(scaling).length === 0) delete el.brightnessScaling
  } else {
    // Covers an explicit null, which would otherwise persist and stop an unscaled fixture
    // deep-equalling one that simply omits the key.
    delete el.brightnessScaling
  }

  if (Array.isArray(el.extraChannels)) {
    for (const ec of el.extraChannels) {
      if (isPlainObject(ec) && !isStorableBrightnessScale(ec.scale)) delete ec.scale
    }
  }
}

/**
 * Applies the "never persist `[]`" invariant to a fixture-like object in place: a nullish or empty
 * `extraChannels` becomes a missing key. Called after {@link validateExtraChannels} passes so the
 * persisted shape is uniform (only ever absent or a non-empty array). Returns the same object.
 */
function normalizeExtraChannelsKey(el: Record<string, unknown>): void {
  const extras = el.extraChannels
  if (extras == null || (Array.isArray(extras) && extras.length === 0)) {
    delete el.extraChannels
  }
}

const STROBE_VALUE_KEYS = ['slow', 'medium', 'fast', 'fastest'] as const

/**
 * Validates a {@link StrobeChannelValues} record (each slot must be a DMX 0–255 integer).
 * Returns null when valid, or an error message string when not.
 */
function validateStrobeChannelValues(value: unknown, fieldName: string): string | null {
  if (!isPlainObject(value)) {
    return `${fieldName} must be a plain object`
  }
  for (const key of STROBE_VALUE_KEYS) {
    const v = (value as Record<string, unknown>)[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 255) {
      return `${fieldName}.${key} must be an integer between 0 and 255`
    }
  }
  return null
}
