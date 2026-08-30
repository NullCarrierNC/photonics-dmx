/**
 * Measures line counts of non-test sources under `src/` and compares them to
 * metrics/size-budget.txt so files at or over the limit cannot grow further and no new file
 * crosses it. Files already over the limit are listed with the size they may not exceed;
 * that list only ever ratchets down, via `node scripts/size-budget.mjs --write`. A file that has
 * shrunk below its entry fails the check too, so the baseline cannot go stale and leave the file
 * room to grow back.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  parseBaseline,
  compareBudget,
  grownSinceBaseline,
  renderBaseline,
} = require('./sizeBudgetCore.cjs')

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const BUDGET_FILE = join(root, 'metrics', 'size-budget.txt')
const SRC_DIR = join(root, 'src')
const LIMIT = 600
const REGENERATE = 'node scripts/size-budget.mjs --write'

/**
 * @param {string} path
 * @returns {boolean} true when the file is a test or declaration file
 */
function isExcluded(path) {
  return (
    path.includes('/tests/') ||
    path.endsWith('.d.ts') ||
    /\.(test|spec)\.tsx?$/.test(path) ||
    /(^|\/)__tests__\//.test(path)
  )
}

/**
 * @returns {Map<string, number>} repo-relative posix path to line count, sorted by path
 */
function measureSources() {
  const entries = readdirSync(SRC_DIR, { recursive: true, withFileTypes: true })
  /** @type {Map<string, number>} */
  const sizes = new Map()
  for (const entry of entries) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) {
      continue
    }
    const absolute = join(entry.parentPath ?? entry.path, entry.name)
    const rel = relative(root, absolute).split(sep).join('/')
    if (isExcluded(rel)) {
      continue
    }
    const lines = readFileSync(absolute, 'utf8').split(/\r?\n/)
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }
    sizes.set(rel, lines.length)
  }
  return new Map([...sizes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * @param {string[]} messages
 * @param {string} advice
 */
function fail(messages, advice) {
  for (const message of messages) {
    console.error(message)
  }
  console.error(advice)
  process.exit(1)
}

const sizes = measureSources()

if (process.argv.includes('--write')) {
  mkdirSync(join(root, 'metrics'), { recursive: true })

  // Regenerating must never launder a file that grew. Raising an allowance is a deliberate act, so
  // it is done by editing the entry, not by running this.
  if (existsSync(BUDGET_FILE)) {
    const baseline = parseBaseline(readFileSync(BUDGET_FILE, 'utf8'))
    if (!baseline) {
      fail(
        [`Budget file must start with a \`limit <number>\` line: ${BUDGET_FILE}`],
        'Fix the header, or delete the file to regenerate it from scratch.',
      )
    }
    const grown = grownSinceBaseline(sizes, baseline)
    if (grown.length > 0) {
      fail(
        grown,
        `Refusing to raise an allowance. Shrink the file, or edit its entry in ${BUDGET_FILE} if the growth is intended.`,
      )
    }
  }

  writeFileSync(BUDGET_FILE, renderBaseline(sizes, LIMIT), 'utf8')
  const listed = renderBaseline(sizes, LIMIT).trim().split('\n').length - 3
  console.log(`Wrote ${BUDGET_FILE} with ${listed} entries over ${LIMIT}`)
  process.exit(0)
}

if (!existsSync(BUDGET_FILE)) {
  fail([`Missing ${BUDGET_FILE}`], `Generate it with: ${REGENERATE}`)
}

const baseline = parseBaseline(readFileSync(BUDGET_FILE, 'utf8'))
if (!baseline) {
  fail(
    ['Budget file must start with a `limit <number>` line'],
    `Fix the header, or regenerate it with: ${REGENERATE}`,
  )
}
if (baseline.malformed.length > 0) {
  fail(
    baseline.malformed.map((line) => `Unparseable budget entry: ${line}`),
    `Each entry must read \`<lines> <path>\`. Regenerate with: ${REGENERATE}`,
  )
}

const { overAllowance, overLimit, slack, removed } = compareBudget(sizes, baseline)

if (overAllowance.length > 0 || overLimit.length > 0) {
  fail(
    [...overAllowance, ...overLimit],
    `Split the file or shrink it. Allowances only ratchet down, so if the growth is deliberate edit its entry in ${BUDGET_FILE}.`,
  )
}

// A stale entry leaves the file room to grow back to a size it no longer needs, so ratcheting the
// baseline down is part of the change that shrank it.
if (slack.length > 0 || removed.length > 0) {
  fail([...slack, ...removed], `The baseline is out of date. Tighten it with: ${REGENERATE}`)
}

console.log(
  `Size budget: ${baseline.allowances.size} files listed, none over allowance, limit ${baseline.limit}`,
)
