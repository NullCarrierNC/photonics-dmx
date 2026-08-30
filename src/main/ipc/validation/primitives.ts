/**
 * Shared building blocks every payload validator is composed from.
 */

/**
 * Renderer-supplied IPC payloads MUST be treated as `unknown`. Validators in this module return a
 * `ValidationResult<T>` whose success value is assignable to the corresponding
 * `IpcInvokeMap[Channel]['request']` for the channel that uses them. When you change a request type
 * in `ipcTypes.ts`, update the matching validator's return type here so the contract stays narrow.
 */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateNumberInRange(
  value: unknown,
  min: number,
  max: number,
  fieldName: string,
): ValidationResult<number> {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return { ok: false, error: `${fieldName} must be a number` }
  }
  if (num < min || num > max) {
    return { ok: false, error: `${fieldName} must be between ${min} and ${max}` }
  }
  return { ok: true, value: num }
}

/**
 * Validates that `value` is one of the literal strings in `allowed`.
 * Accepts a `field` label for the error message.
 */
export function validateStringUnion<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): ValidationResult<T> {
  if (typeof value !== 'string') {
    return { ok: false, error: `${field} must be a string` }
  }
  if (!(allowed as readonly string[]).includes(value)) {
    return { ok: false, error: `${field} must be one of: ${allowed.join(', ')}` }
  }
  return { ok: true, value: value as T }
}

export function validateOptionalStringArray(
  value: unknown,
  fieldName: string,
): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${fieldName} must be an array of strings` }
  }
  for (const entry of value) {
    if (!isNonEmptyString(entry)) {
      return { ok: false, error: `${fieldName} must contain only non-empty strings` }
    }
  }
  return { ok: true, value }
}

export function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((e) => typeof e === 'string')
}
