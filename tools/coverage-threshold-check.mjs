/**
 * Refuses a jest.config.js that loosens coverage against a base: a threshold set lower or dropped,
 * a collectCoverageFrom entry dropped or an exclusion added to it, a coveragePathIgnorePatterns
 * entry added, or a change that stops tests running, which is a project, a testRegex, testMatch or
 * roots entry dropped, a testPathIgnorePatterns or modulePathIgnorePatterns entry added, or a
 * top-level option that narrows the run, such as testNamePattern, set. The config is evaluated, so
 * what is compared is the config Jest runs with. The Jest command lines in package.json scripts,
 * git hooks and workflows are held to the base's too: a test path pattern or an option that
 * narrows the tests Jest runs, such as --shard, that the base does not pass fails the check.
 *
 * The working tree is held to HEAD. With `--pushed`, as the pre-push hook runs it, the refs git is
 * pushing are read from stdin and each pushed commit is held to what the remote already has, or to
 * where it meets its upstream or `development` when the remote has nothing for it yet. Without it
 * the working tree is also held to where HEAD meets its upstream or `development`. Either way, a
 * `COVERAGE_BASE_REF` adds where HEAD meets that ref as one more base, which is how CI names the
 * commit a push or pull request starts from. The all-zero id a new branch or a tag push gives holds
 * HEAD to where it meets `development`, or to the release tag before HEAD when HEAD is on
 * `development`. A base that cannot be found fails the check, and a base commit with no
 * jest.config.js is skipped with a note.
 *
 * The routes around the config are checked in the working tree: a coverage option passed to Jest
 * by an npm script, a git hook or a workflow, a test:coverage script that does not collect
 * coverage, a counted source file that loads a file coverage leaves out, and a coverage ignore
 * hint in counted source.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  loosenedCoverage,
  isMissingCommit,
  parsePushedRefs,
  commandLineOverrides,
  narrowedCommandLines,
  testCoverageScriptProblems,
  importsOfUncounted,
  coverageIgnoreHints,
} = require('./coverageThresholdCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = 'jest.config.js'
/** Where a branch meets the mainline, for a branch with no upstream. */
const MAINLINE = ['development', 'origin/development']
/** Script and TypeScript sources, in every module flavour. */
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/

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

/** @param {string} ref @returns {string | null} the commit it names */
const commitOf = (ref) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])

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
  const sha = commitOf(commit)
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
 *   at: string | null,
 *   current: Promise<Record<string, unknown> | null>,
 *   base: string | null,
 *   against: string,
 * }} Comparison
 */

const workingTree = evaluate(join(root, CONFIG))
/** @type {Comparison[]} */
const comparisons = [
  {
    what: 'the working tree',
    at: null,
    current: workingTree,
    base: 'HEAD',
    against: 'the last commit',
  },
]

if (process.argv.includes('--pushed')) {
  for (const ref of parsePushedRefs(readFileSync(0, 'utf8'))) {
    const remote =
      !isMissingCommit(ref.remoteSha) &&
      git(['cat-file', '-e', `${ref.remoteSha}^{commit}`]) !== null
    comparisons.push({
      what: ref.localRef,
      at: ref.localSha,
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
    at: null,
    current: workingTree,
    base: mergeBase('HEAD', [...upstreamOf('HEAD'), ...MAINLINE]),
    against: 'the branch base',
  })
}

/**
 * The base COVERAGE_BASE_REF gives. An all-zero id names no commit, so HEAD is held to where it
 * meets `development`, and when HEAD is on `development` already, to the release tag before it.
 * @param {string} named
 * @returns {{ base: string | null, against: string }}
 */
function namedBase(named) {
  if (!isMissingCommit(named)) {
    return {
      base: commitOf(named) === null ? null : mergeBase('HEAD', [named]),
      against: 'where HEAD meets COVERAGE_BASE_REF',
    }
  }
  const branchBase = mergeBase('HEAD', MAINLINE)
  if (branchBase !== commitOf('HEAD')) {
    return { base: branchBase, against: 'where HEAD meets development' }
  }
  const release = git(['describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD^'])
  return {
    base: release === null ? null : commitOf(release),
    against: `the release before HEAD${release ? ` (${release})` : ''}`,
  }
}

const named = process.env.COVERAGE_BASE_REF
if (named) {
  comparisons.push({
    what: 'the working tree',
    at: null,
    current: workingTree,
    ...namedBase(named),
  })
}

/** Where a git hook or a workflow lives, the places beside package.json that run Jest. */
const HOOKS_AND_WORKFLOWS = /^(?:\.husky\/[^/]+|\.github\/workflows\/[^/]+\.ya?ml)$/

/**
 * @param {string} dir
 * @returns {string[]} the files directly inside it, from the repository root
 */
function filesIn(dir) {
  const full = join(root, dir)
  if (!existsSync(full)) return []
  return readdirSync(full, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${dir}/${entry.name}`)
}

/** @type {Map<string, Map<string, string>>} */
const commandTexts = new Map()

/**
 * The shell text that can run Jest, as a commit or the working tree has it.
 * @param {string | null} at a commit, or null for the working tree
 * @returns {Map<string, string>} each package.json script by `package.json <name>`, and each git
 *   hook and workflow by its path
 */
function commandTextsAt(at) {
  const key = at ?? ''
  const cached = commandTexts.get(key)
  if (cached !== undefined) return cached
  const read = (/** @type {string} */ path) =>
    at === null ? readFileSync(join(root, path), 'utf8') : git(['show', `${at}:${path}`])
  const listed =
    at === null
      ? [...filesIn('.husky'), ...filesIn('.github/workflows')]
      : (git(['ls-tree', '--name-only', at, '--', '.husky/', '.github/workflows/']) ?? '')
          .split('\n')
          .filter((path) => git(['cat-file', '-t', `${at}:${path}`]) === 'blob')

  /** @type {Map<string, string>} */
  const texts = new Map()
  const manifest = read('package.json')
  /** @type {Record<string, string>} */
  const scripts = manifest ? JSON.parse(manifest).scripts ?? {} : {}
  for (const [name, command] of Object.entries(scripts)) texts.set(`package.json ${name}`, command)
  for (const path of listed.filter((file) => HOOKS_AND_WORKFLOWS.test(file))) {
    const text = read(path)
    if (text !== null) texts.set(path, text)
  }
  commandTexts.set(key, texts)
  return texts
}

let failed = false
let unfound = false
/** @type {string[]} */
const compared = []
try {
  for (const { what, at, current, base, against } of comparisons) {
    if (!base) {
      console.error(`${what}: found no commit at ${against} to compare with`)
      unfound = true
      continue
    }
    const baseConfig = await configAt(base)
    if (baseConfig === null) {
      console.log(`Coverage settings: ${against} has no ${CONFIG} to compare ${what} with, skipped`)
      continue
    }
    compared.push(against)
    const lines = [
      ...loosenedCoverage((await current) ?? {}, baseConfig),
      ...narrowedCommandLines(commandTextsAt(at), commandTextsAt(base)),
    ]
    for (const line of lines) {
      console.error(`${what}: ${line}, against ${against} (${base.slice(0, 8)})`)
      failed = true
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

/** @type {string[]} */
const routes = []
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}
routes.push(...testCoverageScriptProblems(scripts))
for (const [where, text] of commandTextsAt(null)) {
  for (const line of commandLineOverrides(text)) routes.push(`${where}: ${line}`)
}

/** @type {Map<string, string>} */
const sources = new Map()
for (const entry of readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !SOURCE.test(entry.name)) continue
  const path = join(entry.parentPath ?? entry.path, entry.name)
  sources.set(relative(root, path).split(sep).join('/'), readFileSync(path, 'utf8'))
}
const config = (await workingTree) ?? {}
routes.push(...importsOfUncounted(sources, config), ...coverageIgnoreHints(sources, config))

for (const line of routes) {
  console.error(`the working tree: ${line}`)
  failed = true
}

if (unfound) {
  console.error('A check with no base holds nothing. Fetch the history that holds the base.')
}
if (failed) {
  console.error(
    'Coverage only ratchets up. Add tests rather than lowering a threshold or measuring less.',
  )
}
if (failed || unfound) process.exit(1)
console.log(`Coverage settings: nothing loosened against ${[...new Set(compared)].join(', ')}`)
