/**
 * Counts explicit `any` usage in src (`as any` and type annotations `: any`) and
 * compares to metrics/explicit-any-budget.txt so new PRs must not increase the
 * count without an intentional budget update.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { glob } from 'glob'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const BUDGET_FILE = join(root, 'metrics', 'explicit-any-budget.txt')

function countExplicitAnys(source) {
  const asAny = source.match(/\bas any\b/g)?.length ?? 0
  const colonAny = source.match(/:\s*any\b/g)?.length ?? 0
  return asAny + colonAny
}

const files = (await glob('src/**/*.ts', { cwd: root })).concat(
  await glob('src/**/*.tsx', { cwd: root }),
)
let current = 0
for (const rel of files) {
  const text = readFileSync(join(root, rel), 'utf8')
  current += countExplicitAnys(text)
}

if (process.argv.includes('--write')) {
  mkdirSync(join(root, 'metrics'), { recursive: true })
  const lines = [
    String(current),
    'Auto-generated: total matches for `as any` and typed `: any` in src/**/*.ts(x).',
    'Lower this when reducing explicit any; do not increase without a deliberate pass.',
  ]
  writeFileSync(BUDGET_FILE, `${lines.join('\n')}\n`, 'utf8')
  console.log(`Wrote ${BUDGET_FILE} with count ${current}`)
  process.exit(0)
}

if (!existsSync(BUDGET_FILE)) {
  console.error(`Missing ${BUDGET_FILE} — run: node scripts/any-budget.mjs --write`)
  process.exit(1)
}

const budgetLine = readFileSync(BUDGET_FILE, 'utf8').trim().split('\n')[0]
const budget = parseInt(budgetLine, 10)
if (Number.isNaN(budget)) {
  console.error('Budget file must start with a non-negative integer on line 1')
  process.exit(1)
}

if (current > budget) {
  console.error(`Explicit any count ${current} exceeds budget ${budget} (file ${BUDGET_FILE})`)
  console.error('If this increase is intended, run: node scripts/any-budget.mjs --write')
  process.exit(1)
}

console.log(`Explicit any: ${current} (budget ${budget}) — ok`)
