/**
 * The referenced-paths check's pure core: finding the file paths that package.json scripts, the git
 * hooks and the workflows run, and deciding which of them git does not track. The CLI in
 * referenced-paths-check.mjs owns reading the files and asking git. Everything decidable from
 * text lives here.
 */

/** Extensions that mark a token as a file a command reads or runs. */
const FILE_EXTENSION = /\.(?:mjs|cjs|js|ts|tsx|json|ya?ml|sh|py)$/

/** A YAML block scalar indicator such as `|`, `>` or `|-`. */
const BLOCK_SCALAR = /^[|>][-+0-9]*$/

/**
 * Every value under `scripts` in a package.json.
 * @param {string} text contents of package.json
 * @returns {string[]}
 */
function commandsFromPackageJson(text) {
  const scripts = JSON.parse(text).scripts ?? {}
  return Object.values(scripts).filter((value) => typeof value === 'string')
}

/**
 * The command lines in a git hook, without comments or blank lines.
 * @param {string} text
 * @returns {string[]}
 */
function commandsFromHook(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

/**
 * The commands a workflow runs: each single-line `run:` value, and each line of a `run: |` block.
 *
 * Only `run:` values count, so a path named in a comment or a `uses:` line is not mistaken for one
 * the workflow executes.
 * @param {string} text contents of a workflow file
 * @returns {string[]}
 */
function commandsFromWorkflow(text) {
  const lines = text.split(/\r?\n/)
  const commands = []
  for (let i = 0; i < lines.length; i++) {
    const match = /^\s*(?:-\s+)?run:\s*(.*)$/.exec(lines[i])
    if (!match) {
      continue
    }
    const value = match[1].trim()
    if (!BLOCK_SCALAR.test(value)) {
      commands.push(value)
      continue
    }
    // Every following line indented past the key belongs to the block.
    const keyIndent = lines[i].indexOf('run:')
    while (i + 1 < lines.length) {
      const next = lines[i + 1]
      const trimmed = next.trim()
      if (trimmed !== '' && next.length - next.trimStart().length <= keyIndent) {
        break
      }
      i++
      if (trimmed !== '' && !trimmed.startsWith('#')) {
        commands.push(trimmed)
      }
    }
  }
  return commands
}

/**
 * The repo-relative file paths a command names.
 *
 * A token counts when it ends in a file extension and is not a flag, a URL, a glob, a variable or
 * anything under node_modules. The value of `--flag=path` counts, and a leading `./` is dropped so
 * the path matches what git lists.
 * @param {string} command
 * @returns {string[]}
 */
function pathsInCommand(command) {
  const paths = []
  for (const raw of command.split(/\s+/)) {
    let token = raw.replace(/^['"]+|['";,)]+$/g, '')
    if (token.startsWith('-')) {
      const equals = token.indexOf('=')
      if (equals === -1) {
        continue
      }
      token = token.slice(equals + 1)
    }
    token = token.replace(/^\.\//, '')
    if (
      token === '' ||
      /^[a-z]+:\/\//i.test(token) ||
      /[*{}$]/.test(token) ||
      token.includes('node_modules') ||
      !FILE_EXTENSION.test(token)
    ) {
      continue
    }
    paths.push(token)
  }
  return paths
}

/**
 * Paths the commands name that git does not track, each once, in the order first seen.
 * @param {string[]} commands
 * @param {Set<string>} tracked repo-relative paths git tracks
 * @returns {string[]}
 */
function untrackedPaths(commands, tracked) {
  const missing = []
  for (const command of commands) {
    for (const path of pathsInCommand(command)) {
      if (!tracked.has(path) && !missing.includes(path)) {
        missing.push(path)
      }
    }
  }
  return missing
}

module.exports = {
  commandsFromPackageJson,
  commandsFromHook,
  commandsFromWorkflow,
  pathsInCommand,
  untrackedPaths,
}
