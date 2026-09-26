/**
 * A plain object: one made by an object literal, `JSON.parse` or a structured clone, whose prototype
 * is `Object.prototype` or null. A date, a map or a class instance is not one.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
