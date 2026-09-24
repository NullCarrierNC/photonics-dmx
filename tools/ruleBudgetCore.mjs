/**
 * The ratchet behind the per-rule budgets: count how many times one ESLint rule reports under
 * `src/`, compare that to a budget file, and fail when the count has grown. `--write` records the
 * current count, which is how a budget comes down after a deliberate pass, and refuses to record a
 * higher one so the ratchet cannot be widened by rerunning the command the failure names.
 * runCountBudget holds any other count to a budget file by the same rules.
 *
 * Rules that cannot go clean in one sitting are set to warn in the ESLint config and held here
 * instead, so the backlog is visible and cannot grow.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { tallyRuleReports } = require('./ruleReportsCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * How many times the rule reports across src/, a report an `eslint-disable` hides included, and
 * where a disable gives no reason.
 */
function countReports(ruleId) {
  // Which files are linted is the flat config's to decide, so only src/ is named here.
  const args = [
    'eslint',
    'src',
    '--format',
    'json',
    '--no-error-on-unmatched-pattern',
    '--max-warnings',
    '1000000',
  ]
  // ESLint exits non-zero when anything reports as an error, and still writes its JSON, so the
  // report is read either way rather than the count depending on how a rule is configured.
  let raw
  try {
    raw = execFileSync('npx', args, {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (err) {
    raw = err?.stdout
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw err
    }
  }
  return tallyRuleReports(JSON.parse(raw), ruleId)
}

/**
 * The budget a file records, from its first line.
 *
 * @param {string} file
 * @returns {number | null} The recorded budget, or null when there is none to read.
 */
function readBudget(file) {
  if (!existsSync(file)) {
    return null
  }
  const first = parseInt(readFileSync(file, 'utf8').trim().split('\n')[0], 10)
  return Number.isNaN(first) || first < 0 ? null : first
}

/**
 * Run one rule's budget check, exiting the process with the result.
 *
 * @param {object} options
 * @param {string} options.ruleId ESLint rule to count.
 * @param {string} options.budgetFile Path under metrics/, relative to the repository root.
 * @param {string} options.label What the count is called on screen, e.g. "Explicit any".
 * @param {string} options.note One line written into the budget file saying how to lower it.
 */
export function runRuleBudget({ ruleId, budgetFile, label, note }) {
  const { count, unjustified } = countReports(ruleId)

  if (unjustified.length > 0) {
    for (const where of unjustified) {
      console.error(`${where}: eslint-disable of ${ruleId} gives no reason`)
    }
    console.error('Say why after `--` on the disable comment, or fix the report it hides.')
    process.exit(1)
  }

  runCountBudget({
    count,
    budgetFile,
    label,
    counted: `\`npx eslint src\` messages for ${ruleId}, suppressed ones included.`,
    note,
  })
}

/**
 * Hold a count to the budget a file records, exiting the process with the result.
 *
 * @param {object} options
 * @param {number} options.count The count now.
 * @param {string} options.budgetFile Path under metrics/, relative to the repository root.
 * @param {string} options.label What the count is called on screen, e.g. "Explicit any".
 * @param {string} options.counted What is counted, written into the budget file.
 * @param {string} options.note One line written into the budget file saying how to lower it.
 */
export function runCountBudget({ count: current, budgetFile, label, counted, note }) {
  const file = join(root, budgetFile)

  if (process.argv.includes('--write')) {
    // A ratchet holds only while writing it can lower a count and never raise one.
    const previous = readBudget(file)
    if (previous !== null && current > previous) {
      console.error(`${label} count ${current} is above the recorded ${previous} (file ${file})`)
      console.error(
        `Refusing to raise the budget. Fix the new reports, or edit line 1 of ${file} by hand if the increase is intended.`,
      )
      process.exit(1)
    }
    mkdirSync(dirname(file), { recursive: true })
    const lines = [String(current), `Auto-generated: ${counted}`, note]
    writeFileSync(file, `${lines.join('\n')}\n`, 'utf8')
    console.log(`Wrote ${file} with count ${current}`)
    process.exit(0)
  }

  if (!existsSync(file)) {
    console.error(`Missing ${file}. Run the same command with --write`)
    process.exit(1)
  }

  const budget = readBudget(file)
  if (budget === null) {
    console.error('Budget file must start with a non-negative integer on line 1')
    process.exit(1)
  }

  if (current > budget) {
    console.error(`${label} count ${current} exceeds budget ${budget} (file ${file})`)
    console.error(
      `Fix the new reports. --write will not raise the budget, so edit line 1 of ${file} by hand if the increase is intended.`,
    )
    process.exit(1)
  }

  console.log(`${label}: ${current} (budget ${budget}) - ok`)
}
