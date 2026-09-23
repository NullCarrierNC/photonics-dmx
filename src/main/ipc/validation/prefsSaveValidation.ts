/**
 * The whole check a SAVE_PREFS payload passes: a size bound, the preference validator, and a pass
 * that keeps each nested preference object to its own fields.
 */

import type { AppPreferences } from '../../../services/configuration/configurationDefaults'
import { isPlainObject, type ValidationResult } from './primitives'
import { validatePreferencesPayload } from './prefsValidation'

/** Far above any real preferences file, which runs to kilobytes. */
const MAX_PREFS_PAYLOAD_CHARS = 1_000_000

type Shape<K extends keyof AppPreferences> = NonNullable<AppPreferences[K]>

/** Every field of one nested preference object. The compiler holds the list to the type. */
type FieldList<T> = Record<keyof T, true>

const WINDOW_STATE_FIELDS = {
  width: true,
  height: true,
  x: true,
  y: true,
} satisfies FieldList<Shape<'windowState'>>

const USB_SENDER_FIELDS = { port: true, dmxSpeed: true } satisfies FieldList<
  Shape<'enttecProConfig'>
>

/**
 * The fields each flat nested preference object may carry. Audio settings, the audio game mode and
 * the cue domains have validators of their own that rebuild them.
 */
const NESTED_PREFERENCE_FIELDS = {
  enttecProConfig: USB_SENDER_FIELDS,
  openDmxConfig: USB_SENDER_FIELDS,
  artNetConfig: {
    host: true,
    universe: true,
    net: true,
    subnet: true,
    subuni: true,
    port: true,
    refreshRateHz: true,
  } satisfies FieldList<Shape<'artNetConfig'>>,
  sacnConfig: {
    universe: true,
    networkInterface: true,
    unicastDestination: true,
    useUnicast: true,
    refreshRateHz: true,
  } satisfies FieldList<Shape<'sacnConfig'>>,
  brightness: { low: true, medium: true, high: true, max: true } satisfies FieldList<
    Shape<'brightness'>
  >,
  dmxOutputConfig: {
    sacnEnabled: true,
    artNetEnabled: true,
    enttecProEnabled: true,
    openDmxEnabled: true,
  } satisfies FieldList<Shape<'dmxOutputConfig'>>,
  stageKitPrefs: { yargPriority: true } satisfies FieldList<Shape<'stageKitPrefs'>>,
  rb3Prefs: { processingMode: true } satisfies FieldList<Shape<'rb3Prefs'>>,
  dmxSettingsPrefs: {
    artNetExpanded: true,
    enttecProExpanded: true,
    sacnExpanded: true,
    openDmxExpanded: true,
  } satisfies FieldList<Shape<'dmxSettingsPrefs'>>,
  simulationSettings: {
    registryType: true,
    groupId: true,
    effectId: true,
    venueSize: true,
    bpm: true,
    instrument: true,
  } satisfies FieldList<Shape<'simulationSettings'>>,
  windowState: WINDOW_STATE_FIELDS,
  cueEditorWindowState: WINDOW_STATE_FIELDS,
  audioPreviewWindowState: WINDOW_STATE_FIELDS,
} satisfies Partial<Record<keyof AppPreferences, Record<string, true>>>

/**
 * Validates a SAVE_PREFS payload. A payload that could only be an attempt to fill the disk is
 * refused before it is read, and fields a nested preference object does not have are dropped, so
 * nothing but preferences reaches prefs.json.
 */
export function validatePreferencesSave(data: unknown): ValidationResult<Partial<AppPreferences>> {
  let size: number
  try {
    size = JSON.stringify(data)?.length ?? 0
  } catch {
    return { ok: false, error: 'Preferences payload could not be read' }
  }
  if (size > MAX_PREFS_PAYLOAD_CHARS) {
    return { ok: false, error: 'Preferences payload is too large' }
  }

  const validation = validatePreferencesPayload(data)
  if (!validation.ok) return validation

  const cleaned = validation.value as Record<string, unknown>
  for (const [key, fields] of Object.entries(NESTED_PREFERENCE_FIELDS)) {
    const value = cleaned[key]
    if (isPlainObject(value)) {
      cleaned[key] = Object.fromEntries(
        Object.entries(value).filter(([field]) => Object.hasOwn(fields, field)),
      )
    }
  }
  return { ok: true, value: cleaned as Partial<AppPreferences> }
}
