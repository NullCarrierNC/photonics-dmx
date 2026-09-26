/**
 * Reading knip's JSON report for the knip budget: how many unused files, unused exports, unused
 * exported types and duplicate exports it names, in the budgeted default mode and in the
 * reported-only production mode, which leaves tests out and so sees exports only tests reach.
 */

/** The issue types the budget holds, by the key knip's JSON report gives each. */
const KNIP_ISSUE_TYPES = ['files', 'exports', 'types', 'duplicates']

/**
 * @param {{ issues?: Array<Record<string, unknown>> }} report knip's `--reporter json` output
 * @returns {Map<string, number>} each issue type's count, a duplicate export counted once per set
 *   of names that export the same thing
 */
function tallyKnipReport(report) {
  const counts = new Map(KNIP_ISSUE_TYPES.map((type) => [type, 0]))
  for (const row of report.issues ?? []) {
    for (const type of KNIP_ISSUE_TYPES) {
      const found = row[type]
      if (Array.isArray(found)) counts.set(type, counts.get(type) + found.length)
    }
  }
  return counts
}

/**
 * @param {{ production: boolean }} options
 * @returns {string[]} the arguments knip runs with, `--production` leaving out tests and the
 *   development entries
 */
function knipArgs({ production }) {
  return [
    ...(production ? ['--production'] : []),
    '--reporter',
    'json',
    '--no-progress',
    '--no-exit-code',
    '--include',
    KNIP_ISSUE_TYPES.join(','),
  ]
}

/**
 * @param {Map<string, number>} counts production-mode counts by issue type
 * @returns {string}
 */
function productionReportLine(counts) {
  const listed = [...counts].map(([type, count]) => `${type} ${count}`).join(', ')
  return `Knip in production mode, reported only: ${listed}`
}

module.exports = { tallyKnipReport, knipArgs, productionReportLine }
