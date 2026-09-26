/**
 * Runs every bundled non-motion cue through the simulator and holds each timeline's fingerprint to
 * metrics/cue-sim-fingerprints.txt, and refuses a bundled cue or effect file changed since where
 * HEAD meets development without a higher cueVersion. `--write` rewrites the fingerprint list.
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
} = require('./cueSimCore.cjs')
const { runCues } = require('./cueSimWatchdog.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIST = 'metrics/cue-sim-fingerprints.txt'
const NODE_DATA = 'resources/defaults/node-data'
const WRITE = 'npm run cue-sim:check -- --write'
/** Where a branch meets the mainline. */
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

/** @returns {string[]} problems with bundled files changed since the base without a cueVersion bump */
function checkCueVersions() {
  const base = MAINLINE.map((ref) => git(['merge-base', 'HEAD', ref])?.trim()).find(Boolean)
  if (!base) {
    console.log('cueVersion guard skipped: HEAD has no merge base with development')
    return []
  }
  const changed = (git(['diff', '--name-only', base, '--', NODE_DATA]) ?? '')
    .split('\n')
    .filter((path) => path.endsWith('.json'))
  return cueVersionProblems(
    changed.map((path) => ({
      path,
      base: git(['show', `${base}:${path}`]),
      current: existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null,
    })),
  )
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

const versionProblems = checkCueVersions()
if (versionProblems.length > 0) {
  for (const problem of versionProblems) console.error(problem)
  console.error('Raise the top-level cueVersion of each file, or installs keep their old copy.')
  process.exit(1)
}

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
