/**
 * The lockfile check's pure core: telling a registry outage apart from a lock that does not match,
 * and reading the skip variable. The CLI in lockfile-check.mjs owns npm and the exit code.
 */

/** Set to 1 to skip the check, for a push made offline. */
const SKIP_ENV = 'SKIP_LOCKFILE_CHECK'

/** npm error codes that mean the registry could not be reached. */
const NETWORK_CODES = [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ERR_SOCKET_TIMEOUT',
]

/**
 * @param {string} npmOutput what npm printed when it failed
 * @returns {string | null} one line naming the outage and the skip, or null when npm failed for
 *   another reason
 */
function networkFailure(npmOutput) {
  const code = /npm error code (\S+)/.exec(npmOutput)?.[1]
  const isNetwork =
    (code !== undefined && NETWORK_CODES.includes(code)) ||
    /npm error network request to \S+ failed/.test(npmOutput)
  if (!isNetwork) return null
  const reason = code && NETWORK_CODES.includes(code) ? ` (${code})` : ''
  return `lockfile:check could not reach the npm registry${reason}. Push again online, or skip this check on purpose with ${SKIP_ENV}=1.`
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {boolean} whether the check was skipped
 */
function skipRequested(env) {
  return env[SKIP_ENV] === '1'
}

module.exports = { networkFailure, skipRequested, SKIP_ENV }
