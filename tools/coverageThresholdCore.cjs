/**
 * The coverage ratchet's pure core: reading the settings that decide what coverage measures and
 * how much of it has to pass out of an evaluated Jest config, naming each one a config loosens
 * against a base, and reading the refs the pre-push hook is given. The CLI in
 * coverage-threshold-check.mjs owns git, evaluating jest.config.js and the exit code.
 */

/** What Jest leaves out of coverage when a config names nothing. */
const DEFAULT_IGNORE_PATTERNS = ['/node_modules/']

/**
 * @typedef {{
 *   thresholds: Map<string, number>,
 *   collectFrom: string[] | null,
 *   ignorePatterns: string[],
 * }} CoverageSettings
 */

/**
 * The config and each inline project, since a project can carry its own coverage settings.
 * @param {Record<string, unknown>} config
 * @returns {Array<Record<string, unknown>>}
 */
function scopesOf(config) {
  const projects = Array.isArray(config.projects) ? config.projects : []
  return [config, ...projects.filter((project) => project !== null && typeof project === 'object')]
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringsIn(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []
}

/**
 * @param {Record<string, unknown> | null | undefined} config an evaluated Jest config
 * @returns {CoverageSettings} every threshold by `<path> <metric>`, the collectCoverageFrom
 *   entries across the config and its projects (null when none sets any), and the ignore patterns
 *   across them with Jest's default included
 */
function coverageSettings(config) {
  const scopes = scopesOf(config ?? {})

  /** @type {Map<string, number>} */
  const thresholds = new Map()
  const byPath = config?.coverageThreshold ?? {}
  for (const [path, metrics] of Object.entries(byPath)) {
    for (const [metric, value] of Object.entries(metrics ?? {})) {
      if (typeof value === 'number') thresholds.set(`${path} ${metric}`, value)
    }
  }

  const collecting = scopes.filter((scope) => Array.isArray(scope.collectCoverageFrom))
  const collectFrom =
    collecting.length === 0
      ? null
      : [...new Set(collecting.flatMap((scope) => stringsIn(scope.collectCoverageFrom)))]

  const ignorePatterns = [
    ...new Set([
      ...DEFAULT_IGNORE_PATTERNS,
      ...scopes.flatMap((scope) => stringsIn(scope.coveragePathIgnorePatterns)),
    ]),
  ]

  return { thresholds, collectFrom, ignorePatterns }
}

/**
 * @param {Record<string, unknown> | null | undefined} current the evaluated config being checked
 * @param {Record<string, unknown> | null | undefined} base the evaluated config it may not loosen,
 *   or null when there is nothing to compare with
 * @returns {string[]} one line per threshold set lower or dropped, per collectCoverageFrom entry
 *   dropped, per exclusion added to collectCoverageFrom and per ignore pattern added
 */
function loosenedCoverage(current, base) {
  if (!base) return []
  const now = coverageSettings(current)
  const then = coverageSettings(base)
  /** @type {string[]} */
  const loosened = []

  for (const [key, floor] of then.thresholds) {
    const value = now.thresholds.get(key)
    if (value === undefined) {
      loosened.push(`${key} threshold is gone, and the base sets ${floor}`)
    } else if (value < floor) {
      loosened.push(`${key} threshold ${value} is below the base ${floor}`)
    }
  }

  const collected = now.collectFrom ?? []
  for (const entry of then.collectFrom ?? []) {
    if (!collected.includes(entry)) {
      loosened.push(`collectCoverageFrom drops '${entry}'`)
    }
  }
  for (const entry of collected) {
    if (entry.startsWith('!') && !(then.collectFrom ?? []).includes(entry)) {
      loosened.push(`collectCoverageFrom adds the exclusion '${entry}'`)
    }
  }

  for (const pattern of now.ignorePatterns) {
    if (!then.ignorePatterns.includes(pattern)) {
      loosened.push(`coveragePathIgnorePatterns adds '${pattern}'`)
    }
  }

  return loosened
}

/**
 * @param {string | null | undefined} sha
 * @returns {boolean} true for the all-zero id git gives a ref that does not exist, or no id at all
 */
function isMissingCommit(sha) {
  return !sha || /^0+$/.test(sha)
}

/**
 * @typedef {{ localRef: string, localSha: string, remoteRef: string, remoteSha: string }} PushedRef
 */

/**
 * The refs a pre-push hook is given on stdin, one `<local ref> <local sha> <remote ref> <remote
 * sha>` line each. A line that deletes a remote ref pushes nothing, so it is left out.
 * @param {string} text
 * @returns {PushedRef[]}
 */
function parsePushedRefs(text) {
  /** @type {PushedRef[]} */
  const refs = []
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 4) continue
    const [localRef, localSha, remoteRef, remoteSha] = fields
    if (isMissingCommit(localSha)) continue
    refs.push({ localRef, localSha, remoteRef, remoteSha })
  }
  return refs
}

module.exports = { coverageSettings, loosenedCoverage, isMissingCommit, parsePushedRefs }
