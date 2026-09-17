import {
  normalizeEnttecProDmxSpeedHz,
  normalizeOpenDmxSpeedHz,
} from '../../../shared/dmxOutputRefresh'
import { isPlainObject, type ValidationResult } from './primitives'

/**
 * Validates one USB sender's stored config shape. When the config carries a `dmxSpeed`, returns a
 * new object with that field normalized to the sender's range, leaving the caller's object
 * untouched.
 */
export function validateUsbSenderConfig(
  value: unknown,
  name: 'enttecProConfig' | 'openDmxConfig',
  normalizeSpeed: (hz: number) => number,
): ValidationResult<Record<string, unknown>> {
  if (!isPlainObject(value)) {
    return { ok: false, error: `${name} must be an object` }
  }
  if ('port' in value && typeof value.port !== 'string') {
    return { ok: false, error: `${name}.port must be a string` }
  }
  if ('dmxSpeed' in value) {
    if (typeof value.dmxSpeed !== 'number' || !Number.isFinite(value.dmxSpeed)) {
      return { ok: false, error: `${name}.dmxSpeed must be a finite number` }
    }
    return { ok: true, value: { ...value, dmxSpeed: normalizeSpeed(value.dmxSpeed) } }
  }
  return { ok: true, value }
}

export function validateStoredUsbSenderConfigs(
  cleaned: Record<string, unknown>,
): ValidationResult<void> {
  for (const [key, normalizeSpeed] of [
    ['enttecProConfig', normalizeEnttecProDmxSpeedHz],
    ['openDmxConfig', normalizeOpenDmxSpeedHz],
  ] as const) {
    if (!(key in cleaned)) continue
    const v = validateUsbSenderConfig(cleaned[key], key, normalizeSpeed)
    if (!v.ok) return v
    cleaned[key] = v.value
  }
  return { ok: true, value: undefined }
}
