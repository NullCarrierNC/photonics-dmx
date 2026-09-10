/**
 * The ratchet behind the per-rule budgets: count how many times one ESLint rule reports under
 * `src/`, compare that to a budget file, and fail when the count has grown. `--write` records the
 * current count, which is how a budget comes down after a deliberate pass.
 *
 * Rules that cannot go clean in one sitting are set to warn in the ESLint config and held here
 * instead, so the backlog is visible and cannot grow.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** How many times the rule reports across src/. */
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
  /** @type {Array<{ messages: Array<{ ruleId?: string | null }> }>} */
  const fileReports = JSON.parse(raw)
  let count = 0
  for (const file of fileReports) {
    for (const message of file.messages) {
      if (message.ruleId === ruleId) {
        count++
      }
    }
  }
  return count
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
  const file = join(root, budgetFile)
  const current = countReports(ruleId)

  if (process.argv.includes('--write')) {
    mkdirSync(dirname(file), { recursive: true })
    const lines = [
      String(current),
      `Auto-generated: \`npx eslint src\` messages for ${ruleId}.`,
      note,
    ]
    writeFileSync(file, `${lines.join('\n')}\n`, 'utf8')
    console.log(`Wrote ${file} with count ${current}`)
    process.exit(0)
  }

  if (!existsSync(file)) {
    console.error(`Missing ${file}. Run the same command with --write`)
    process.exit(1)
  }

  const budget = parseInt(readFileSync(file, 'utf8').trim().split('\n')[0], 10)
  if (Number.isNaN(budget)) {
    console.error('Budget file must start with a non-negative integer on line 1')
    process.exit(1)
  }

  if (current > budget) {
    console.error(`${label} count ${current} exceeds budget ${budget} (file ${file})`)
    console.error('If this increase is intended, run the same command with --write')
    process.exit(1)
  }

  console.log(`${label}: ${current} (budget ${budget}) - ok`)
}
