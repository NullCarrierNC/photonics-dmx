/**
 * The count budgets' rules: reading what a budget file records, holding the counts now to it
 * exactly, and deciding what `--write` and `--init` may record. A budget of one count records it alone on line
 * 1. A budget of several records one `<name> <count>` line each. ruleBudgetCore.mjs owns counting,
 * the file and the exit code.
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
 *   `write` is the budget file `--write` or `--init` records
 */

/**
 * @param {string[]} names
 * @returns {string} what a budget file of these counts must record
 */
function unreadableBudget(names) {
  return names.length === 1
    ? 'Budget file must start with a non-negative integer on line 1'
    : `Budget file must record ${names.map((n) => `\`${n} <count>\``).join(', ')}, one per line`
}

/**
 * @param {object} options
 * @param {Map<string, number>} options.counts the counts now, by name
 * @param {string | null} options.recordedText the budget file, or null when there is none
 * @param {boolean} options.write whether to lower the recorded budget to the counts
 * @param {boolean} [options.init] whether to create a missing budget file from the counts
 * @param {boolean} [options.tracked] whether the last commit holds the budget file
 * @param {string} options.label what the count is called on screen, e.g. "Explicit any"
 * @param {string} options.file the budget file's path, for the messages
 * @param {string} options.counted what is counted, written into the budget file
 * @param {string} options.note how to lower the budget, written into the budget file
 * @returns {Verdict}
 */
function budgetVerdict({
  counts,
  recordedText,
  write,
  init = false,
  tracked = false,
  label,
  file,
  counted,
  note,
}) {
  const names = [...counts.keys()]
  const recorded = readBudget(recordedText, names)
  const title = (name) => (names.length === 1 ? label : `${label} ${name}`)
  const where = names.length === 1 ? `line 1 of ${file}` : file
  const listed = names.map((n) => `${title(n)} ${counts.get(n)}`).join(', ')

  if (init) {
    // Creating a budget records any count, so it is its own flag and never replaces a file, not
    // even one deleted since the last commit.
    if (tracked) {
      return {
        ok: false,
        lines: [
          `${file} is committed. --init only creates a new budget, so restore it from git and lower it with --write`,
        ],
      }
    }
    if (recordedText !== null) {
      return {
        ok: false,
        lines: [
          `${file} exists. --init only creates a missing budget, and --write lowers a recorded one`,
        ],
      }
    }
    return {
      ok: true,
      lines: [`Created ${file} with ${listed}`],
      write: renderBudget(counts, counted, note),
    }
  }

  if (write) {
    // A ratchet holds only while writing it can lower a count and never raise one, so there has to
    // be a recorded count for each name to hold the write to.
    if (recordedText === null) {
      return {
        ok: false,
        lines: [
          `Missing ${file}. --write only lowers a recorded budget. Run the same command with --init to create it`,
        ],
      }
    }
    if (recorded === null) {
      return {
        ok: false,
        lines: [
          unreadableBudget(names),
          `Refusing to rewrite ${file}. Fix it by hand or restore it from git`,
        ],
      }
    }
    const raised = names.filter((name) => counts.get(name) > recorded.get(name))
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
      lines: [`Wrote ${file} with ${listed}`],
      write: renderBudget(counts, counted, note),
    }
  }

  if (recordedText === null) {
    return { ok: false, lines: [`Missing ${file}. Run the same command with --init to create it`] }
  }
  if (recorded === null) {
    return { ok: false, lines: [unreadableBudget(names)] }
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
  // A budget above its count would let reports come back unseen, so it is lowered as they go.
  const slack = names.filter((name) => counts.get(name) < recorded.get(name))
  if (slack.length > 0) {
    return {
      ok: false,
      lines: [
        ...slack.map(
          (name) =>
            `${title(name)} count ${counts.get(name)} is below budget ${recorded.get(name)} (file ${file})`,
        ),
        'The budget is out of date. Lower it by running the same command with --write',
      ],
    }
  }
  return {
    ok: true,
    lines: names.map((n) => `${title(n)}: ${counts.get(n)} (budget ${recorded.get(n)}) - ok`),
  }
}

module.exports = { readBudget, budgetVerdict }
