/**
 * Refuses a jest.config.js that loosens coverage against a base: a threshold set lower or dropped,
 * a collectCoverageFrom entry dropped or an exclusion added to it, or a coveragePathIgnorePatterns
 * entry added. The config is evaluated, so what is compared is the config Jest runs with.
 *
 * The working tree is held to HEAD. With `--pushed`, as the pre-push hook runs it, the refs git is
 * pushing are read from stdin and each pushed commit is held to what the remote already has, or to
 * where it meets its upstream or `development` when the remote has nothing for it yet. Without it
 * the working tree is also held to where HEAD meets its upstream or `development`. Either way, a
 * `COVERAGE_BASE_REF` adds where HEAD meets that ref as one more base, which is how CI names the
 * commit a push or pull request starts from. A base that cannot be found, as in a shallow clone, is
 * skipped with a note.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  loosenedCoverage,
  isMissingCommit,
  parsePushedRefs,
} = require('./coverageThresholdCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = 'jest.config.js'
/** Where a branch meets the mainline, for a branch with no upstream. */
const MAINLINE = ['development', 'origin/development']

/** @param {string[]} args @returns {string | null} git's output, or null when git fails */
function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/** @param {string} file @returns {Promise<Record<string, unknown>>} the config Jest reads there */
async function evaluate(file) {
  const exported = (await import(pathToFileURL(file).href)).default
  return typeof exported === 'function' ? await exported() : exported
}

const scratch = mkdtempSync(join(tmpdir(), 'coverage-check-'))
/** @type {Map<string, Promise<Record<string, unknown> | null>>} */
const evaluated = new Map()

/**
 * jest.config.js as `commit` has it, evaluated from a copy in a scratch directory beside a
 * package.json carrying that commit's module type.
 * @param {string} commit
 * @returns {Promise<Record<string, unknown> | null>} null when the commit has no jest.config.js
 */
function configAt(commit) {
  const sha = git(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`])
  if (sha === null) return Promise.resolve(null)
  if (!evaluated.has(sha)) {
    evaluated.set(
      sha,
      (async () => {
        const text = git(['show', `${sha}:${CONFIG}`])
        if (text === null) return null
        const manifest = git(['show', `${sha}:package.json`])
        const type = (manifest && JSON.parse(manifest).type) || 'commonjs'
        const dir = join(scratch, sha)
        mkdirSync(dir)
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ type }))
        writeFileSync(join(dir, CONFIG), text)
        return evaluate(join(dir, CONFIG))
      })(),
    )
  }
  return evaluated.get(sha)
}

/**
 * @param {string} commit
 * @param {string[]} refs tried in order
 * @returns {string | null} where `commit` meets the first ref that resolves
 */
function mergeBase(commit, refs) {
  for (const ref of refs) {
    const base = git(['merge-base', commit, ref])
    if (base) return base
  }
  return null
}

/** @param {string} branch a branch name or `refs/heads/` ref @returns {string[]} its upstream */
function upstreamOf(branch) {
  const upstream = git([
    'rev-parse',
    '--symbolic-full-name',
    `${branch.replace(/^refs\/heads\//, '')}@{upstream}`,
  ])
  return upstream ? [upstream] : []
}

/**
 * @typedef {{
 *   what: string,
 *   current: Promise<Record<string, unknown> | null>,
 *   base: string | null,
 *   against: string,
 * }} Comparison
 */

const workingTree = evaluate(join(root, CONFIG))
/** @type {Comparison[]} */
const comparisons = [
  { what: 'the working tree', current: workingTree, base: 'HEAD', against: 'the last commit' },
]

if (process.argv.includes('--pushed')) {
  for (const ref of parsePushedRefs(readFileSync(0, 'utf8'))) {
    const remote =
      !isMissingCommit(ref.remoteSha) &&
      git(['cat-file', '-e', `${ref.remoteSha}^{commit}`]) !== null
    comparisons.push({
      what: ref.localRef,
      current: configAt(ref.localSha),
      base: remote
        ? ref.remoteSha
        : mergeBase(ref.localSha, [...upstreamOf(ref.localRef), ...MAINLINE]),
      against: remote ? `${ref.remoteRef} on the remote` : 'its branch base',
    })
  }
} else {
  comparisons.push({
    what: 'the working tree',
    current: workingTree,
    base: mergeBase('HEAD', [...upstreamOf('HEAD'), ...MAINLINE]),
    against: 'the branch base',
  })
}

const named = process.env.COVERAGE_BASE_REF
if (named && !isMissingCommit(named)) {
  comparisons.push({
    what: 'the working tree',
    current: workingTree,
    base: mergeBase('HEAD', [named]),
    against: 'where HEAD meets COVERAGE_BASE_REF',
  })
}

let failed = false
/** @type {string[]} */
const compared = []
try {
  for (const { what, current, base, against } of comparisons) {
    const baseConfig = base === null ? null : await configAt(base)
    if (baseConfig === null) {
      console.log(`Coverage settings: nothing to compare ${what} with at ${against}, skipped`)
      continue
    }
    compared.push(against)
    for (const line of loosenedCoverage((await current) ?? {}, baseConfig)) {
      console.error(`${what}: ${line}, against ${against} (${base.slice(0, 8)})`)
      failed = true
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

if (failed) {
  console.error(
    'Coverage only ratchets up. Add tests rather than lowering a threshold or measuring less.',
  )
  process.exit(1)
}
console.log(`Coverage settings: nothing loosened against ${[...new Set(compared)].join(', ')}`)
