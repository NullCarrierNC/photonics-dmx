/**
 * Counts `@typescript-eslint/no-explicit-any` report instances under `src/` and compares
 * to metrics/explicit-any-budget.txt so new PRs must not increase the count without an
 * intentional budget update.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const BUDGET_FILE = join(root, 'metrics', 'explicit-any-budget.txt')
const RULE_ID = '@typescript-eslint/no-explicit-any'

/**
 * @returns {string} ESLint JSON output
 */
function eslintJsonForSrc() {
  const args = [
    'eslint',
    'src',
    '--ext',
    '.ts',
    '--ext',
    '.tsx',
    '--format',
    'json',
    '--no-error-on-unmatched-pattern',
    '--max-warnings',
    '1000000',
  ]
  return execFileSync('npx', args, { cwd: root, encoding: 'utf8' })
}

function countExplicitAnysEslint() {
  const raw = eslintJsonForSrc()
  /** @type {Array<{ messages: Array<{ ruleId?: string | null }> }>} */
  const fileReports = JSON.parse(raw)
  let count = 0
  for (const file of fileReports) {
    for (const m of file.messages) {
      if (m.ruleId === RULE_ID) {
        count++
      }
    }
  }
  return count
}

const current = countExplicitAnysEslint()

if (process.argv.includes('--write')) {
  mkdirSync(join(root, 'metrics'), { recursive: true })
  const lines = [
    String(current),
    'Auto-generated: `npx eslint src` messages for @typescript-eslint/no-explicit-any.',
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
