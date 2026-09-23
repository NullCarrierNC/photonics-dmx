/**
 * Refuses coverage thresholds set lower than the last commit or the commit the branch started
 * from, since the thresholds only ratchet up.
 *
 * The branch base is where HEAD meets `COVERAGE_BASE_REF`, or `development` when that is unset.
 * A base that cannot be found, as in a shallow clone, is skipped with a note.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { readThresholds, loweredThresholds } = require('./coverageThresholdCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

/** @returns {string | null} the commit the branch started from, or null when there is none */
function baseCommit() {
  const refs = process.env.COVERAGE_BASE_REF
    ? [process.env.COVERAGE_BASE_REF]
    : ['development', 'origin/development']
  for (const ref of refs) {
    try {
      return git(['merge-base', 'HEAD', ref])
    } catch {
      // Not here, so try the next.
    }
  }
  return null
}

/** @param {string} commit @returns {string | null} jest.config.js at that commit */
function configAt(commit) {
  try {
    return git(['show', `${commit}:jest.config.js`])
  } catch {
    return null
  }
}

const current = readThresholds(readFileSync(join(root, 'jest.config.js'), 'utf8'))
const base = baseCommit()
const comparisons = [
  ['the last commit', configAt('HEAD')],
  [`the branch base ${base?.slice(0, 8) ?? ''}`, base ? configAt(base) : null],
]

let failed = false
for (const [name, config] of comparisons) {
  if (config === null) {
    console.log(`Coverage thresholds: nothing to compare at ${name.trim()}, skipped`)
    continue
  }
  for (const line of loweredThresholds(current, readThresholds(config))) {
    console.error(`${line} at ${name}`)
    failed = true
  }
}
if (failed) {
  console.error('Coverage thresholds only go up. Add tests rather than lowering one.')
  process.exit(1)
}
console.log('Coverage thresholds: none below the last commit or the branch base')
