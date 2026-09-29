/**
 * Runs every bundled non-motion cue through the simulator and holds each timeline's fingerprint to
 * metrics/cue-sim-fingerprints.txt, and refuses a bundled cue or effect file changed without a
 * higher cueVersion. The bases it compares with are cueVersionBases' in cueSimCore.cjs: `--pushed`
 * reads the refs of a push from stdin, and CI names its base in `CUE_VERSION_BASE_REF`. `--write`
 * rewrites the fingerprint list.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  DOMAINS,
  cuesInLibrary,
  reduceTimeline,
  fingerprintOf,
  renderList,
  parseList,
  compareFingerprints,
  describeMove,
  cueVersionProblems,
  cueVersionBases,
} = require('./cueSimCore.cjs')
const { parsePushedRefs } = require('./coverageThresholdCore.cjs')
const { runCues } = require('./cueSimWatchdog.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIST = 'metrics/cue-sim-fingerprints.txt'
const NODE_DATA = 'resources/defaults/node-data'
const WRITE = 'npm run cue-sim:check -- --write'
/** Where a branch with no upstream meets the mainline. */
const MAINLINE = ['development', 'origin/development']
/** A cue runs in well under a second, so one past this is stuck. */
const CUE_TIMEOUT_MS = 30_000
/** Loading the simulator compiles the engine through ts-node. */
const START_TIMEOUT_MS = 180_000

/** @param {string[]} args @returns {string | null} git's output, or null when git fails */
function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

/**
 * @param {string} commit
 * @param {string} ref the branch `commit` is pushed from, or HEAD
 * @returns {string | null} where `commit` meets the ref's upstream or, failing that, development
 */
function branchBase(commit, ref) {
  const upstream = git([
    'rev-parse',
    '--symbolic-full-name',
    `${ref.replace(/^refs\/heads\//, '')}@{upstream}`,
  ])?.trim()
  for (const other of [...(upstream ? [upstream] : []), ...MAINLINE]) {
    const base = git(['merge-base', commit, other])?.trim()
    if (base) return base
  }
  return null
}

/**
 * @returns {{ baseProblems: string[], versionProblems: string[] }} bases the guard could not
 *   compare with, and bundled files changed since a base without a cueVersion bump
 */
function checkCueVersions() {
  const { bases, problems: baseProblems } = cueVersionBases({
    pushed: process.argv.includes('--pushed') ? parsePushedRefs(readFileSync(0, 'utf8')) : null,
    namedBase: process.env.CUE_VERSION_BASE_REF,
    hasCommit: (sha) => git(['cat-file', '-e', `${sha}^{commit}`]) !== null,
    branchBase,
    mergeBase: (commit, other) => git(['merge-base', commit, other])?.trim() || null,
    commitOf: (ref) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])?.trim() || null,
    releaseBefore: () =>
      git(['describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD^'])?.trim() || null,
  })
  /** @type {string[]} */
  const versionProblems = []
  for (const { what, commit, base, against } of bases) {
    const diff = git(['diff', '--name-only', base, ...(commit ? [commit] : []), '--', NODE_DATA])
    if (diff === null) {
      baseProblems.push(`${what}: git could not diff it against ${against} (${base.slice(0, 8)})`)
      continue
    }
    const files = diff
      .split('\n')
      .filter((path) => path.endsWith('.json'))
      .map((path) => ({
        path,
        base: git(['show', `${base}:${path}`]),
        current: commit
          ? git(['show', `${commit}:${path}`])
          : existsSync(join(root, path))
            ? readFileSync(join(root, path), 'utf8')
            : null,
      }))
    for (const problem of cueVersionProblems(files)) {
      versionProblems.push(`${what}: ${problem}, against ${against} (${base.slice(0, 8)})`)
    }
  }
  return { baseProblems, versionProblems }
}

function bundledCues() {
  return DOMAINS.flatMap((/** @type {string} */ domain) => {
    const dir = join(root, NODE_DATA, 'cues', domain)
    return readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .flatMap((file) =>
        cuesInLibrary(domain, file, JSON.parse(readFileSync(join(dir, file), 'utf8'))),
      )
  })
}

const { baseProblems, versionProblems } = checkCueVersions()
for (const problem of [...baseProblems, ...versionProblems]) console.error(problem)
if (versionProblems.length > 0) {
  console.error('Raise the top-level cueVersion of each file, or installs keep their old copy.')
}
if (baseProblems.length + versionProblems.length > 0) process.exit(1)

const cues = bundledCues()
const results = await runCues({
  workerPath: require.resolve('./cue-sim-worker.cjs'),
  cues,
  cueTimeoutMs: CUE_TIMEOUT_MS,
  startTimeoutMs: START_TIMEOUT_MS,
})

const failed = results.filter(({ outcome }) => outcome !== 'done')
if (failed.length > 0) {
  for (const { key, outcome, message } of failed) console.error(`${key} ${outcome}: ${message}`)
  console.error('Every bundled cue must simulate to the end.')
  process.exit(1)
}

/** @type {Map<string, ReturnType<typeof reduceTimeline>>} */
const reduced = new Map(results.map(({ key, value }) => [key, reduceTimeline(value)]))
const actual = new Map([...reduced].map(([key, timeline]) => [key, fingerprintOf(timeline)]))

if (process.argv.includes('--write')) {
  writeFileSync(join(root, LIST), renderList(actual), 'utf8')
  console.log(`Wrote ${LIST} with ${actual.size} cues`)
  process.exit(0)
}

if (!existsSync(join(root, LIST))) {
  console.error(`Missing ${LIST}. Generate it with: ${WRITE}`)
  process.exit(1)
}
const committed = parseList(readFileSync(join(root, LIST), 'utf8'))
if (!committed.settingsMatch || committed.malformed.length > 0) {
  for (const line of committed.malformed) console.error(`Unparseable entry: ${line}`)
  if (!committed.settingsMatch) {
    console.error(`${LIST} was recorded with other simulation settings.`)
  }
  console.error(`Rewrite it with: ${WRITE}`)
  process.exit(1)
}

const { moved, added, missing } = compareFingerprints(committed.entries, actual)
if (moved.length + added.length + missing.length > 0) {
  for (const key of moved) {
    for (const line of describeMove(
      key,
      committed.entries.get(key),
      actual.get(key),
      reduced.get(key),
    )) {
      console.error(line)
    }
  }
  for (const key of added) console.error(`${key}: a bundled cue the list does not hold`)
  for (const key of missing) console.error(`${key}: listed, but no longer bundled`)
  console.error(
    `Cue timelines moved. If the change is intended, rewrite the list in the same commit: ${WRITE}`,
  )
  process.exit(1)
}

console.log(`Cue sim: ${actual.size} bundled cue timelines match ${LIST}`)
