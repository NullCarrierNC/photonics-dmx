/**
 * Counts what knip reports as unused files, unused exports, unused exported types and duplicate
 * exports against metrics/knip-budget.txt, so none of them grows without a budget update. The same
 * counts in production mode, where an export only tests reach is unused, are advisory: they are
 * printed beside the budget and never fail the check.
 */
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runCountBudget } from './ruleBudgetCore.mjs'

const require = createRequire(import.meta.url)
const { tallyKnipReport, knipArgs, productionReportLine } = require('./knipReportCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * @param {{ production: boolean }} options
 * @returns {Map<string, number>} knip's counts in that mode
 */
function knipCounts(options) {
  // `--no` runs the knip package.json pins and never fetches one.
  const raw = execFileSync('npx', ['--no', '--', 'knip', ...knipArgs(options)], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  return tallyKnipReport(JSON.parse(raw))
}

console.log(productionReportLine(knipCounts({ production: true })))

runCountBudget({
  counts: knipCounts({ production: false }),
  budgetFile: 'metrics/knip-budget.txt',
  label: 'Knip',
  counted:
    'knip issues by type: unused files, unused exports, unused exported types and duplicate exports.',
  note: 'Lower these when removing dead code. Do not raise them without a deliberate pass.',
})
