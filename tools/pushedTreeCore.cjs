/**
 * The pre-push hook's rule for what its checks read. Every check it runs reads the working tree, so
 * the checks stand for a push only when each commit pushed is the checked-out HEAD and nothing is
 * uncommitted. The CLI in pushed-tree-check.mjs reads git and owns the exit code.
 */

/**
 * @typedef {{ localRef: string, localSha: string, remoteSha: string, commit: string }} PushedCommit
 *   one ref the push sends, with `commit` the commit it names (an annotated tag resolved to its
 *   commit)
 */

/**
 * @param {object} state
 * @param {PushedCommit[]} state.pushed
 * @param {string} state.head the checked-out commit
 * @param {string[]} state.changes `git status --porcelain` lines, untracked files included
 * @returns {string[]} one line per pushed commit the checks would not read, and one for
 *   uncommitted changes when the push sends anything
 */
function pushedTreeProblems({ pushed, head, changes }) {
  const sent = pushed.filter((ref) => ref.localSha !== ref.remoteSha)
  /** @type {string[]} */
  const lines = []
  for (const ref of sent) {
    if (ref.commit !== head) {
      lines.push(
        `${ref.localRef} pushes ${ref.commit.slice(0, 8)}, and the checks read HEAD ${head.slice(0, 8)}`,
      )
    }
  }
  if (sent.length > 0 && changes.length > 0) {
    const shown = changes.slice(0, 5).map((line) => line.trim())
    const more = changes.length > shown.length ? `, and ${changes.length - shown.length} more` : ''
    lines.push(`the working tree has changes the push does not carry: ${shown.join(', ')}${more}`)
  }
  return lines
}

module.exports = { pushedTreeProblems }
