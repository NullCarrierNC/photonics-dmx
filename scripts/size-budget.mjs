/**
 * Measures line counts of non-test sources under `src/` and compares them to
 * metrics/size-budget.txt so files at or over the limit cannot grow further and no new file
 * crosses it. Files already over the limit are listed with the size they may not exceed;
 * that list only ever ratchets down, via `node scripts/size-budget.mjs --write`.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const BUDGET_FILE = join(root, 'metrics', 'size-budget.txt')
const SRC_DIR = join(root, 'src')
const LIMIT = 600

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
 * @param {Map<string, number>} sizes
 * @returns {Array<[string, number]>} files at or over the limit, largest first
 */
function overLimit(sizes) {
  return [...sizes].filter(([, lines]) => lines > LIMIT).sort(([, a], [, b]) => b - a)
}

const sizes = measureSources()

if (process.argv.includes('--write')) {
  mkdirSync(join(root, 'metrics'), { recursive: true })
  const listed = overLimit(sizes)

  // Regenerating must never launder a file that grew. Raising an allowance is a deliberate act, so
  // it is done by editing the entry, not by running this.
  if (existsSync(BUDGET_FILE)) {
    /** @type {string[]} */
    const grown = []
    for (const line of readFileSync(BUDGET_FILE, 'utf8').trim().split('\n').slice(1)) {
      const match = /^(\d+) (.+)$/.exec(line)
      if (!match) continue
      const cap = parseInt(match[1], 10)
      const now = sizes.get(match[2])
      if (now !== undefined && now > cap) {
        grown.push(`${match[2]} is ${now} lines, over its ${cap} line allowance`)
      }
    }
    if (grown.length > 0) {
      for (const entry of grown) {
        console.error(entry)
      }
      console.error(
        `Refusing to raise an allowance. Shrink the file, or edit its entry in ${BUDGET_FILE} if the growth is intended.`,
      )
      process.exit(1)
    }
  }

  const header = [
    `limit ${LIMIT}`,
    'Auto-generated: non-test sources under src/ that exceed the line limit.',
    'Entries may only shrink. Regenerate after a split with: node scripts/size-budget.mjs --write',
  ]
  const body = listed.map(([path, lines]) => `${lines} ${path}`)
  writeFileSync(BUDGET_FILE, `${[...header, ...body].join('\n')}\n`, 'utf8')
  console.log(`Wrote ${BUDGET_FILE} with ${listed.length} entries over ${LIMIT}`)
  process.exit(0)
}

if (!existsSync(BUDGET_FILE)) {
  console.error(`Missing ${BUDGET_FILE}, run: node scripts/size-budget.mjs --write`)
  process.exit(1)
}

const budgetLines = readFileSync(BUDGET_FILE, 'utf8').trim().split('\n')
const limitMatch = /^limit (\d+)$/.exec(budgetLines[0])
if (!limitMatch) {
  console.error('Budget file must start with a `limit <number>` line')
  process.exit(1)
}
const fileLimit = parseInt(limitMatch[1], 10)

/** @type {Map<string, number>} */
const allowed = new Map()
for (const line of budgetLines.slice(1)) {
  const match = /^(\d+) (.+)$/.exec(line)
  if (match) {
    allowed.set(match[2], parseInt(match[1], 10))
  }
}

/** @type {string[]} */
const failures = []
/** @type {string[]} */
const slack = []

for (const [path, lines] of sizes) {
  const cap = allowed.get(path)
  if (cap === undefined) {
    if (lines > fileLimit) {
      failures.push(`${path} is ${lines} lines, over the ${fileLimit} line limit for new files`)
    }
    continue
  }
  if (lines > cap) {
    failures.push(`${path} grew to ${lines} lines, over its ${cap} line allowance`)
  } else if (lines < cap) {
    slack.push(`${path} is ${lines} lines, allowance ${cap}`)
  }
}

for (const path of allowed.keys()) {
  if (!sizes.has(path)) {
    slack.push(`${path} no longer exists`)
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure)
  }
  console.error(
    'Split the file, or if the growth is deliberate run: node scripts/size-budget.mjs --write',
  )
  process.exit(1)
}

if (slack.length > 0) {
  console.log(
    `Size budget: ${allowed.size} listed, ${slack.length} below allowance, tighten with --write`,
  )
  for (const entry of slack) {
    console.log(`  ${entry}`)
  }
} else {
  console.log(`Size budget: ${allowed.size} files listed, none over allowance, limit ${fileLimit}`)
}
