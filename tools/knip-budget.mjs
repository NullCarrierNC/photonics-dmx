/**
 * Counts what knip reports as unused files, unused exports, unused exported types and duplicate
 * exports against metrics/knip-budget.txt, so none of them grows without a budget update, and names
 * the unused files so a count that differs between machines shows which ones. The same counts in
 * production mode, where an export only tests reach is unused, are advisory: they are printed
 * beside the budget and never fail the check.
 */
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runCountBudget } from './ruleBudgetCore.mjs'

const require = createRequire(import.meta.url)
const {
  tallyKnipReport,
  unusedFilesReport,
  knipArgs,
  productionReportLine,
} = require('./knipReportCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * @param {{ production: boolean }} options
 * @returns {{ issues?: Array<Record<string, unknown>> }} knip's JSON report in that mode
 */
function knipReport(options) {
  // `--no` runs the knip package.json pins and never fetches one.
  const raw = execFileSync('npx', ['--no', '--', 'knip', ...knipArgs(options)], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(raw)
}

console.log(productionReportLine(tallyKnipReport(knipReport({ production: true }))))

const report = knipReport({ production: false })
const unusedFiles = unusedFilesReport(report)
if (unusedFiles) console.log(unusedFiles)

runCountBudget({
  counts: tallyKnipReport(report),
  budgetFile: 'metrics/knip-budget.txt',
  label: 'Knip',
  counted:
    'knip issues by type: unused files, unused exports, unused exported types and duplicate exports.',
  note: 'Lower these when removing dead code. Do not raise them without a deliberate pass.',
})
