/**
 * Counts what knip reports as unused files, unused exports, unused exported types and duplicate
 * exports against metrics/knip-budget.txt, so none of them grows without a budget update.
 */
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runCountBudget } from './ruleBudgetCore.mjs'

const require = createRequire(import.meta.url)
const { KNIP_ISSUE_TYPES, tallyKnipReport } = require('./knipReportCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// `--no` runs the knip package.json pins and never fetches one.
const raw = execFileSync(
  'npx',
  [
    '--no',
    '--',
    'knip',
    '--reporter',
    'json',
    '--no-progress',
    '--no-exit-code',
    '--include',
    KNIP_ISSUE_TYPES.join(','),
  ],
  { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 },
)

runCountBudget({
  counts: tallyKnipReport(JSON.parse(raw)),
  budgetFile: 'metrics/knip-budget.txt',
  label: 'Knip',
  counted:
    'knip issues by type: unused files, unused exports, unused exported types and duplicate exports.',
  note: 'Lower these when removing dead code. Do not raise them without a deliberate pass.',
})
