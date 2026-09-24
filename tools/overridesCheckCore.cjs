/**
 * The overrides check's pure core. An override is needed while at least one package asks for a
 * range it narrows. When every dependent's declared range already sits inside the override, npm
 * resolves inside it without one.
 *
 * Ranges are compared as intervals. Only the forms the overrides here use are understood: exact
 * versions, `^`, `~`, `>=`, `*` and `$name` references to a root dependency. Any other form counts
 * as narrowed, so an unfamiliar range can keep an override but never fail one.
 */

/** @typedef {[number, number, number]} Version */
/**
 * @typedef {{ low: Version, high: Version | null }} Interval high is exclusive, null is unbounded
 */

/**
 * @param {string} text
 * @returns {Version | null}
 */
function parseVersion(text) {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(text.trim())
  if (!match) {
    return null
  }
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

/**
 * @param {Version} a
 * @param {Version} b
 */
function compare(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * @param {string} range
 * @returns {Interval | null} null for a form this core does not read
 */
function parseRange(range) {
  const text = range.trim()
  if (text === '*' || text === '') {
    return { low: [0, 0, 0], high: null }
  }
  const at = /^>=\s*(.+)$/.exec(text)
  if (at) {
    const low = parseVersion(at[1])
    return low && { low, high: null }
  }
  const operator = text[0] === '^' || text[0] === '~' ? text[0] : ''
  const low = parseVersion(text.slice(operator.length))
  if (!low) {
    return null
  }
  const [major, minor, patch] = low
  if (operator === '~') {
    return { low, high: [major, minor + 1, 0] }
  }
  if (operator === '^') {
    if (major > 0) return { low, high: [major + 1, 0, 0] }
    if (minor > 0) return { low, high: [0, minor + 1, 0] }
    return { low, high: [0, 0, patch + 1] }
  }
  return { low, high: [major, minor, patch + 1] }
}

/**
 * Whether every version `inner` allows is one `outer` allows.
 * @param {string} inner
 * @param {string} outer
 */
function isWithin(inner, outer) {
  const a = parseRange(inner)
  const b = parseRange(outer)
  if (!a || !b) {
    return false
  }
  if (compare(a.low, b.low) < 0) {
    return false
  }
  if (b.high === null) {
    return true
  }
  return a.high !== null && compare(a.high, b.high) <= 0
}

/**
 * Resolves `$name` to the root manifest's range for `name`, as npm does.
 * @param {string} spec
 * @param {Record<string, any>} manifest
 */
function resolveSpec(spec, manifest) {
  if (!spec.startsWith('$')) {
    return spec
  }
  const name = spec.slice(1)
  return manifest.dependencies?.[name] ?? manifest.devDependencies?.[name] ?? spec
}

const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies']

/**
 * The overrides nothing needs, each with the reason.
 * @param {Record<string, any>} manifest package.json
 * @param {Record<string, any>} lock package-lock.json (lockfileVersion 2 or 3)
 * @returns {string[]}
 */
function unneededOverrides(manifest, lock) {
  /** @type {string[]} */
  const unneeded = []
  const packages = lock.packages ?? {}
  for (const [name, value] of Object.entries(manifest.overrides ?? {})) {
    const raw = typeof value === 'string' ? value : value?.['.']
    if (typeof raw !== 'string') {
      continue
    }
    const spec = resolveSpec(raw, manifest)
    /** @type {string[]} */
    const asked = []
    for (const meta of Object.values(packages)) {
      for (const field of DEPENDENCY_FIELDS) {
        const range = meta?.[field]?.[name]
        if (typeof range === 'string') {
          asked.push(range)
        }
      }
    }
    if (asked.length === 0) {
      unneeded.push(`${name}: nothing in the lock depends on it`)
    } else if (asked.every((range) => isWithin(range, spec))) {
      unneeded.push(`${name}: every dependent already asks for a range inside ${spec}`)
    }
  }
  return unneeded
}

module.exports = { parseRange, isWithin, resolveSpec, unneededOverrides }
