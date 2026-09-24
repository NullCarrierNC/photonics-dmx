/**
 * Reading one rule's reports out of ESLint's JSON output, for the per-rule budgets. A report an
 * `eslint-disable` comment suppresses still counts, and every such comment has to say why after
 * `--`.
 */

/**
 * @typedef {{ ruleId?: string | null, line?: number, suppressions?: Array<{ justification?: string }> }} Message
 * @typedef {{ filePath: string, messages: Message[], suppressedMessages?: Message[] }} FileReport
 */

/**
 * @param {FileReport[]} fileReports ESLint's JSON output
 * @param {string} ruleId
 * @returns {{ count: number, unjustified: string[] }} every report of the rule, suppressed or not,
 *   and `file:line` for each suppression that gives no reason
 */
function tallyRuleReports(fileReports, ruleId) {
  let count = 0
  /** @type {string[]} */
  const unjustified = []
  for (const file of fileReports) {
    for (const message of file.messages) {
      if (message.ruleId === ruleId) count++
    }
    for (const message of file.suppressedMessages ?? []) {
      if (message.ruleId !== ruleId) continue
      count++
      const reasons = (message.suppressions ?? []).map((s) => (s.justification ?? '').trim())
      if (!reasons.some((reason) => reason !== '')) {
        unjustified.push(`${file.filePath}:${message.line ?? 0}`)
      }
    }
  }
  return { count, unjustified }
}

module.exports = { tallyRuleReports }
