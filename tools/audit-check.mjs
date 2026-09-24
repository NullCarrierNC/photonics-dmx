/**
 * Runs `npm audit --audit-level=high`, so a high or critical advisory in the installed tree fails
 * the push hook and CI alike.
 *
 * npm needs the registry for this. When it cannot reach it the check says so in one line, and
 * `SKIP_AUDIT_CHECK=1` skips it for a push made offline.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { networkFailure, skipRequested, AUDIT_SKIP_ENV } = require('./lockfileCheckCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

if (skipRequested(process.env, AUDIT_SKIP_ENV)) {
  console.log(`npm audit not run, ${AUDIT_SKIP_ENV}=1 is set`)
  process.exit(0)
}

const npm = spawnSync('npm', ['audit', '--audit-level=high'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
})
const outage =
  npm.status === 0
    ? null
    : networkFailure(`${npm.stdout ?? ''}${npm.stderr ?? ''}`, 'audit:check', AUDIT_SKIP_ENV)
if (outage) {
  console.error(outage)
} else {
  process.stdout.write(npm.stdout ?? '')
  process.stderr.write(npm.stderr ?? '')
}
process.exit(npm.status ?? 1)
