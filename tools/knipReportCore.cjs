/**
 * Reading knip's JSON report for the knip budget: how many unused files, unused exports, unused
 * exported types and duplicate exports it names.
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

module.exports = { KNIP_ISSUE_TYPES, tallyKnipReport }
