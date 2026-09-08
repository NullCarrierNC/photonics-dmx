/**
 * Shortens a value for the node-cue debug log, so enabling debug logging cannot dump a whole
 * light rig or a long colour array into the log.
 */

/** Longest array rendered in full; beyond this the rest is reported as a count. */
const MAX_ARRAY = 12
/** Longest string rendered in full. */
const MAX_STRING = 300

/**
 * A log-safe view of `value`: strings and arrays are truncated, TrackedLight-ish objects reduce to
 * id and position, VariableValues to type and value, and other objects are previewed key by key.
 */
export function debugPreview(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY).map(debugPreview)
    return value.length > MAX_ARRAY ? { items: head, truncated: value.length - MAX_ARRAY } : head
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('id' in obj && typeof obj.id === 'string') {
      const out: Record<string, unknown> = { id: obj.id }
      if ('position' in obj && typeof obj.position === 'number') out.position = obj.position
      return out
    }
    if ('type' in obj && 'value' in obj) {
      return { type: obj.type, value: debugPreview(obj.value) }
    }
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(obj)) {
      result[key] = debugPreview(val)
    }
    return result
  }
  return value
}
