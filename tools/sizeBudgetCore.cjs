/**
 * The size budget's pure core: parsing the baseline, comparing measurements against it, and
 * rendering a fresh baseline. The CLI in size-budget.mjs owns the filesystem walk and the exit
 * codes. Everything decidable from data lives here.
 */

/** @typedef {{ limit: number, allowances: Map<string, number>, malformed: string[] }} Baseline */

/**
 * @param {string} text contents of the baseline file
 * @returns {Baseline|null} null when the header line is missing or unparseable
 */
function parseBaseline(text) {
  const lines = text.trim().split('\n')
  const limitMatch = /^limit (\d+)$/.exec(lines[0] ?? '')
  if (!limitMatch) {
    return null
  }

  /** @type {Map<string, number>} */
  const allowances = new Map()
  /** @type {string[]} */
  const malformed = []
  for (const line of lines.slice(1)) {
    const match = /^(\d+) (.+)$/.exec(line)
    if (match) {
      allowances.set(match[2], parseInt(match[1], 10))
    } else if (line.trim() !== '' && !isHeaderNote(line)) {
      malformed.push(line)
    }
  }
  return { limit: parseInt(limitMatch[1], 10), allowances, malformed }
}

/**
 * Header notes sit between the limit line and the entries and carry no data.
 * @param {string} line
 */
function isHeaderNote(line) {
  return line.startsWith('Auto-generated:') || line.startsWith('Entries may only shrink')
}

/**
 * Compare measured sizes against a baseline.
 * @param {Map<string, number>} sizes repo-relative path to line count
 * @param {Baseline} baseline
 * @returns {{ overAllowance: string[], overLimit: string[], slack: string[], removed: string[] }}
 *   overAllowance: a listed file that grew past its entry.
 *   overLimit: an unlisted file that crossed the limit.
 *   slack: a listed file now under its entry, so the baseline is stale.
 *   removed: a listed file that no longer exists.
 */
function compareBudget(sizes, baseline) {
  /** @type {string[]} */
  const overAllowance = []
  /** @type {string[]} */
  const overLimit = []
  /** @type {string[]} */
  const slack = []
  /** @type {string[]} */
  const removed = []

  for (const [path, lines] of sizes) {
    const cap = baseline.allowances.get(path)
    if (cap === undefined) {
      if (lines > baseline.limit) {
        overLimit.push(
          `${path} is ${lines} lines, over the ${baseline.limit} line limit for new files`,
        )
      }
      continue
    }
    if (lines > cap) {
      overAllowance.push(`${path} grew to ${lines} lines, over its ${cap} line allowance`)
    } else if (lines < cap) {
      slack.push(`${path} is ${lines} lines, allowance ${cap}`)
    }
  }

  for (const path of baseline.allowances.keys()) {
    if (!sizes.has(path)) {
      removed.push(`${path} no longer exists`)
    }
  }

  return { overAllowance, overLimit, slack, removed }
}

/**
 * Files at or over the limit, largest first.
 * @param {Map<string, number>} sizes
 * @param {number} limit
 * @returns {Array<[string, number]>}
 */
function overLimitEntries(sizes, limit) {
  return [...sizes].filter(([, lines]) => lines > limit).sort(([, a], [, b]) => b - a)
}

/**
 * Files a rewrite would give more room than the baseline does: a listed file that grew past its
 * entry, or an unlisted file now over the limit. A rewrite refuses both, so it only lowers or
 * removes entries.
 * @param {Map<string, number>} sizes
 * @param {Baseline} baseline
 * @param {number} [limit] the tool's own limit, which a header edited by hand cannot loosen
 * @returns {string[]}
 */
function raisedByRewrite(sizes, baseline, limit = baseline.limit) {
  /** @type {string[]} */
  const raised = []
  for (const [path, lines] of sizes) {
    const cap = baseline.allowances.get(path)
    if (cap === undefined) {
      if (lines > limit) {
        raised.push(`${path} is ${lines} lines, over the ${limit} line limit and not listed`)
      }
    } else if (lines > cap) {
      raised.push(`${path} is ${lines} lines, over its ${cap} line allowance`)
    }
  }
  return raised
}

/**
 * The limit is the tool's, so a header that says otherwise was edited by hand to loosen it.
 * @param {Baseline} baseline
 * @param {number} limit
 * @returns {string|null} what is wrong, or null when the header matches
 */
function limitMismatch(baseline, limit) {
  return baseline.limit === limit
    ? null
    : `The budget file says limit ${baseline.limit}, but the limit is ${limit}`
}

/**
 * The baseline a rewrite may not raise: the working file, or the committed one when the working
 * file is gone, so deleting it cannot clear every allowance.
 * @param {string|null} workingText
 * @param {string|null} committedText
 * @returns {string|null}
 */
function rewriteGuard(workingText, committedText) {
  return workingText ?? committedText
}

/**
 * Render a baseline file from current measurements.
 * @param {Map<string, number>} sizes
 * @param {number} limit
 * @returns {string}
 */
function renderBaseline(sizes, limit) {
  const header = [
    `limit ${limit}`,
    'Auto-generated: non-test sources under src/ that exceed the line limit.',
    'Entries may only shrink. Regenerate after a split with: node tools/size-budget.mjs --write',
  ]
  const body = overLimitEntries(sizes, limit).map(([path, lines]) => `${lines} ${path}`)
  return `${[...header, ...body].join('\n')}\n`
}

module.exports = {
  parseBaseline,
  compareBudget,
  overLimitEntries,
  raisedByRewrite,
  renderBaseline,
  limitMismatch,
  rewriteGuard,
}
