/**
 * The ratchet behind the per-rule budgets: count how many times one ESLint rule reports under
 * `src/`, compare that to a budget file, and fail when the count has grown or fallen below it.
 * `--write` records the current count, which is how a budget comes down after a deliberate pass,
 * and refuses to record a higher one or any count over a missing or unreadable file. `--init`
 * creates a budget file that neither the working tree nor the last commit holds.
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
const { budgetVerdict } = require('./countBudgetCore.cjs')

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

/** Whether the last commit holds `path`, relative to the repository root. */
function isCommitted(path) {
  try {
    execFileSync('git', ['cat-file', '-e', `HEAD:${path}`], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Hold a count, or several named counts, to the budget a file records, exiting the process with
 * the result. countBudgetCore.cjs decides.
 *
 * @param {object} options
 * @param {number} [options.count] The count now, for a budget of one count.
 * @param {Map<string, number>} [options.counts] The counts now by name, for a budget of several.
 * @param {string} options.budgetFile Path under metrics/, relative to the repository root.
 * @param {string} options.label What the count is called on screen, e.g. "Explicit any".
 * @param {string} options.counted What is counted, written into the budget file.
 * @param {string} options.note One line written into the budget file saying how to lower it.
 */
export function runCountBudget({ count, counts, budgetFile, label, counted, note }) {
  const file = join(root, budgetFile)
  const verdict = budgetVerdict({
    tracked: isCommitted(budgetFile),
    counts: counts ?? new Map([[label, count]]),
    recordedText: existsSync(file) ? readFileSync(file, 'utf8') : null,
    write: process.argv.includes('--write'),
    init: process.argv.includes('--init'),
    label,
    file,
    counted,
    note,
  })
  if (verdict.write !== undefined) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, verdict.write, 'utf8')
  }
  for (const line of verdict.lines) {
    if (verdict.ok) console.log(line)
    else console.error(line)
  }
  process.exit(verdict.ok ? 0 : 1)
}
