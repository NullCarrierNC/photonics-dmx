/**
 * The coverage-threshold ratchet's pure core: reading the global thresholds out of jest.config.js
 * text and naming any set below a base. The CLI in coverage-threshold-check.mjs owns git and the
 * exit code.
 */

const KEYS = ['statements', 'branches', 'functions', 'lines']

/**
 * @param {string} configText contents of jest.config.js
 * @returns {Record<string, number> | null} the four global thresholds, or null when absent
 */
function readThresholds(configText) {
  const block = /coverageThreshold\s*:\s*\{\s*global\s*:\s*\{([^}]*)\}/.exec(configText)
  if (!block) return null
  /** @type {Record<string, number>} */
  const thresholds = {}
  for (const key of KEYS) {
    const value = new RegExp(`${key}\\s*:\\s*(\\d+(?:\\.\\d+)?)`).exec(block[1])
    if (!value) return null
    thresholds[key] = Number(value[1])
  }
  return thresholds
}

/**
 * @param {Record<string, number> | null} current
 * @param {Record<string, number> | null} base
 * @returns {string[]} one line per threshold set below the base
 */
function loweredThresholds(current, base) {
  if (!base) return []
  if (!current) return ['jest.config.js has no global coverage thresholds, and the base does']
  return KEYS.filter((key) => current[key] < base[key]).map(
    (key) => `${key} threshold ${current[key]} is below the base ${base[key]}`,
  )
}

module.exports = { readThresholds, loweredThresholds }
