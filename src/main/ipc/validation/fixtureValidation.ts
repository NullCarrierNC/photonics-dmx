/**
 * Fixture and rig payloads: the fixture library, lighting configurations and rigs. Each fixture is
 * checked by `fixtureParsing`.
 */

import type { DmxRig, LightingConfiguration, DmxFixture } from '../../../photonics-dmx/types'
import type { ValidationResult } from './primitives'
import { ConfigStrobeType } from '../../../photonics-dmx/types'
import {
  parseDmxFixture,
  parseDmxLight,
  parseFixtureList,
  type FixtureFault,
  type FixtureFaultReport,
} from '../../../photonics-dmx/helpers/fixtureParsing'
import { isNonEmptyString, isPlainObject } from './primitives'
import { validateRigOutputs, validateRigMirrorFlag } from './senderValidation'

const VALID_STROBE_TYPES = new Set<string>([
  ConfigStrobeType.None,
  ConfigStrobeType.Dedicated,
  ConfigStrobeType.AllCapable,
])

/**
 * Parses every entry of a fixture list from an IPC payload, refusing the payload on the first
 * fault. A save carries what the editors built, so a fault here is never repaired.
 */
function parseSavedList<T>(
  list: readonly unknown[],
  path: string,
  parse: (raw: unknown, path: string, report: FixtureFaultReport) => T | null,
): ValidationResult<T[]> {
  const faults: FixtureFault[] = []
  const parsed = parseFixtureList(list, path, parse, faults)
  return parsed.ok && faults.length > 0 ? { ok: false, error: faults[0].message } : parsed
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

  const frontLights = parseSavedList(
    data.frontLights,
    'LightingConfiguration.frontLights',
    parseDmxLight,
  )
  if (!frontLights.ok) return frontLights
  const backLights = parseSavedList(
    data.backLights,
    'LightingConfiguration.backLights',
    parseDmxLight,
  )
  if (!backLights.ok) return backLights
  const strobeLights = parseSavedList(
    data.strobeLights,
    'LightingConfiguration.strobeLights',
    parseDmxLight,
  )
  if (!strobeLights.ok) return strobeLights

  const value: LightingConfiguration = {
    numLights,
    lightLayout: { id: lightLayout.id, label: lightLayout.label },
    strobeType: data.strobeType as ConfigStrobeType,
    frontLights: frontLights.value,
    backLights: backLights.value,
    strobeLights: strobeLights.value,
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

/** The id the rig read and delete channels take. */
export function validateRigId(value: unknown): ValidationResult<string> {
  if (!isNonEmptyString(value)) {
    return { ok: false, error: 'Rig id must be a non-empty string' }
  }
  return { ok: true, value }
}

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
  return parseSavedList(value, fieldName, parseDmxFixture)
}
