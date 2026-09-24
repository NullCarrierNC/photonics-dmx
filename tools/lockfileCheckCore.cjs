/**
 * The lockfile check's pure core: telling a registry outage apart from a lock that does not match,
 * and reading the skip variable. The CLI in lockfile-check.mjs owns npm and the exit code. The
 * audit check in audit-check.mjs reads its own outages and skip through the same two functions.
 */

/** Set to 1 to skip the check, for a push made offline. */
const SKIP_ENV = 'SKIP_LOCKFILE_CHECK'

/** Set to 1 to skip the audit, for a push made offline. */
const AUDIT_SKIP_ENV = 'SKIP_AUDIT_CHECK'

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
 * @param {string} [check] the check named in the line
 * @param {string} [skipEnv] the variable that skips it
 * @returns {string | null} one line naming the outage and the skip, or null when npm failed for
 *   another reason. npm install reports an outage as an error code, and npm audit as a warning that
 *   its request failed, with the code in the reason.
 */
function networkFailure(npmOutput, check = 'lockfile:check', skipEnv = SKIP_ENV) {
  const auditReason = /audit request to \S+ failed, reason: (.*)/.exec(npmOutput)?.[1] ?? ''
  const code =
    /npm error code (\S+)/.exec(npmOutput)?.[1] ??
    NETWORK_CODES.find((known) => auditReason.split(/\s+/).includes(known))
  const isNetwork =
    (code !== undefined && NETWORK_CODES.includes(code)) ||
    /npm error network request to \S+ failed/.test(npmOutput)
  if (!isNetwork) return null
  const reason = code && NETWORK_CODES.includes(code) ? ` (${code})` : ''
  return `${check} could not reach the npm registry${reason}. Push again online, or skip this check on purpose with ${skipEnv}=1.`
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} [skipEnv] the variable that skips the check
 * @returns {boolean} whether the check was skipped
 */
function skipRequested(env, skipEnv = SKIP_ENV) {
  return env[skipEnv] === '1'
}

module.exports = { networkFailure, skipRequested, SKIP_ENV, AUDIT_SKIP_ENV }
