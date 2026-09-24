/**
 * The count budgets' rules: reading what a budget file records, holding the counts now to it, and
 * deciding what `--write` may record. A budget of one count records it alone on line 1. A budget of
 * several records one `<name> <count>` line each. ruleBudgetCore.mjs owns counting, the file and
 * the exit code.
 */

/**
 * @param {string | null} text the budget file, or null when there is none
 * @param {string[]} names the counts the budget holds
 * @returns {Map<string, number> | null} each count the file records by name, or null when there is
 *   no file or it does not record every count as a non-negative integer
 */
function readBudget(text, names) {
  if (text === null) return null
  const lines = text.trim().split(/\r?\n/)
  /** @type {Map<string, number>} */
  const recorded = new Map()
  if (names.length === 1) {
    const first = /^(\d+)\s*$/.exec(lines[0] ?? '')
    if (first) recorded.set(names[0], Number(first[1]))
  } else {
    for (const line of lines) {
      const entry = /^(\S+) (\d+)\s*$/.exec(line)
      if (entry && names.includes(entry[1])) recorded.set(entry[1], Number(entry[2]))
    }
  }
  return names.every((name) => recorded.has(name)) ? recorded : null
}

/**
 * @param {Map<string, number>} counts
 * @param {string} counted what is counted
 * @param {string} note how to lower the budget
 * @returns {string} the budget file recording the counts
 */
function renderBudget(counts, counted, note) {
  const values =
    counts.size === 1 ? [String([...counts.values()][0])] : [...counts].map((e) => e.join(' '))
  return `${[...values, `Auto-generated: ${counted}`, note].join('\n')}\n`
}

/**
 * @typedef {{ ok: true, lines: string[], write?: string } | { ok: false, lines: string[] }} Verdict
 *   `write` is the budget file `--write` records
 */

/**
 * @param {object} options
 * @param {Map<string, number>} options.counts the counts now, by name
 * @param {string | null} options.recordedText the budget file, or null when there is none
 * @param {boolean} options.write whether to record the counts rather than check them
 * @param {string} options.label what the count is called on screen, e.g. "Explicit any"
 * @param {string} options.file the budget file's path, for the messages
 * @param {string} options.counted what is counted, written into the budget file
 * @param {string} options.note how to lower the budget, written into the budget file
 * @returns {Verdict}
 */
function budgetVerdict({ counts, recordedText, write, label, file, counted, note }) {
  const names = [...counts.keys()]
  const recorded = readBudget(recordedText, names)
  const title = (name) => (names.length === 1 ? label : `${label} ${name}`)
  const where = names.length === 1 ? `line 1 of ${file}` : file

  if (write) {
    // A ratchet holds only while writing it can lower a count and never raise one.
    const raised = names.filter(
      (name) => recorded !== null && counts.get(name) > recorded.get(name),
    )
    if (raised.length > 0) {
      return {
        ok: false,
        lines: [
          ...raised.map(
            (name) =>
              `${title(name)} count ${counts.get(name)} is above the recorded ${recorded.get(name)} (file ${file})`,
          ),
          `Refusing to raise the budget. Fix the new reports, or edit ${where} by hand if the increase is intended.`,
        ],
      }
    }
    return {
      ok: true,
      lines: [`Wrote ${file} with ${names.map((n) => `${title(n)} ${counts.get(n)}`).join(', ')}`],
      write: renderBudget(counts, counted, note),
    }
  }

  if (recordedText === null) {
    return { ok: false, lines: [`Missing ${file}. Run the same command with --write`] }
  }
  if (recorded === null) {
    return {
      ok: false,
      lines: [
        names.length === 1
          ? 'Budget file must start with a non-negative integer on line 1'
          : `Budget file must record ${names.map((n) => `\`${n} <count>\``).join(', ')}, one per line`,
      ],
    }
  }

  const over = names.filter((name) => counts.get(name) > recorded.get(name))
  if (over.length > 0) {
    return {
      ok: false,
      lines: [
        ...over.map(
          (name) =>
            `${title(name)} count ${counts.get(name)} exceeds budget ${recorded.get(name)} (file ${file})`,
        ),
        `Fix the new reports. --write will not raise the budget, so edit ${where} by hand if the increase is intended.`,
      ],
    }
  }
  return {
    ok: true,
    lines: names.map((n) => `${title(n)}: ${counts.get(n)} (budget ${recorded.get(n)}) - ok`),
  }
}

module.exports = { readBudget, renderBudget, budgetVerdict }
