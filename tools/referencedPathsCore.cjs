/**
 * The referenced-paths check's pure core: finding the file paths that package.json scripts,
 * lint-staged, the git hooks and the workflows run, and the ones jest.config.js and the tsconfigs
 * name, then deciding which of them git does not track. The CLI in referenced-paths-check.mjs owns
 * reading the files and asking git. Everything decidable from text lives here.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this core
const ts = require('typescript')

/** Extensions that mark a token as a file a command reads or runs. */
const FILE_EXTENSION = /\.(?:mjs|cjs|js|ts|tsx|json|ya?ml|sh|py)$/

/** A YAML block scalar indicator such as `|`, `>` or `|-`. */
const BLOCK_SCALAR = /^[|>][-+0-9]*$/

/** Jest options that name files to run around the tests. */
const JEST_SETUP_KEYS = ['setupFiles', 'setupFilesAfterEnv', 'globalSetup', 'globalTeardown']

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
 * Every command lint-staged runs, as package.json configures it.
 * @param {string} text contents of package.json
 * @returns {string[]}
 */
function commandsFromLintStaged(text) {
  const config = JSON.parse(text)['lint-staged'] ?? {}
  return Object.values(config)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value === 'string')
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
 * The files an evaluated Jest config runs around the tests, from the config and each inline
 * project. An entry under `<rootDir>` or starting `./` is a path, and anything else a package.
 * @param {Record<string, unknown>} config
 * @returns {string[]} repo-relative paths, each once
 */
function pathsFromJestConfig(config) {
  const projects = Array.isArray(config.projects) ? config.projects : []
  const scopes = [config, ...projects.filter((project) => project && typeof project === 'object')]
  const paths = []
  for (const scope of scopes) {
    for (const key of JEST_SETUP_KEYS) {
      for (const entry of [scope[key]].flat()) {
        if (typeof entry !== 'string') continue
        const path = entry.startsWith('<rootDir>/')
          ? entry.slice('<rootDir>/'.length)
          : entry.startsWith('./')
            ? entry.slice(2)
            : null
        if (path !== null && !paths.includes(path)) paths.push(path)
      }
    }
  }
  return paths
}

/**
 * What a tsconfig at the repository root names. `required` holds what TypeScript fails without: a
 * base it extends by relative path, its `files` entries and the projects it references. `included`
 * holds its `include` entries. Comments and trailing commas are read as TypeScript reads them.
 * @param {string} text contents of the tsconfig
 * @returns {{ required: string[], included: string[] }} repo-relative paths and include patterns
 */
function pathsFromTsconfig(text) {
  const config = ts.parseConfigFileTextToJson('tsconfig.json', text).config ?? {}
  /** @param {unknown} entry */
  const strings = (entry) => [entry].flat().filter((value) => typeof value === 'string')
  /** @param {string} path */
  const fromRoot = (path) => path.replace(/^\.\//, '')
  return {
    required: [
      ...strings(config.extends).filter((base) => base.startsWith('.')),
      ...strings(config.files),
      ...[config.references ?? []].flat().flatMap((reference) => strings(reference?.path)),
    ].map(fromRoot),
    included: strings(config.include).map(fromRoot),
  }
}

/**
 * @param {string} pattern a tsconfig-style glob, where `*` and `?` stay within one directory and a
 *   `**` segment spans any number of them
 * @returns {RegExp}
 */
function globRegExp(pattern) {
  const segments = pattern.split('/')
  const source = segments
    .map((segment, i) => {
      const last = i === segments.length - 1
      if (segment === '**') return last ? '.*' : '(?:[^/]+/)*'
      const body = segment
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
      return last ? body : `${body}/`
    })
    .join('')
  return new RegExp(`^${source}$`)
}

/**
 * @param {string} pattern
 * @param {Set<string>} tracked
 * @returns {boolean} whether git tracks the file, a file under the directory, or a file the glob
 *   matches
 */
function matchesTracked(pattern, tracked) {
  if (/[*?]/.test(pattern)) {
    const glob = globRegExp(pattern)
    return [...tracked].some((path) => glob.test(path))
  }
  const dir = `${pattern.replace(/\/+$/, '')}/`
  return tracked.has(pattern) || [...tracked].some((path) => path.startsWith(dir))
}

/**
 * Paths and patterns with nothing git tracks behind them, each once, in the order first seen.
 * @param {string[]} patterns repo-relative files, directories or globs
 * @param {Set<string>} tracked repo-relative paths git tracks
 * @returns {string[]}
 */
function unmatchedPatterns(patterns, tracked) {
  const missing = []
  for (const pattern of patterns) {
    if (!missing.includes(pattern) && !matchesTracked(pattern, tracked)) {
      missing.push(pattern)
    }
  }
  return missing
}

/**
 * @param {string} pattern
 * @returns {string} the directories before the first wildcard, or the whole path when it has none
 */
function includeBase(pattern) {
  const segments = pattern.split('/')
  const wild = segments.findIndex((segment) => /[*?]/.test(segment))
  return (wild === -1 ? segments : segments.slice(0, wild)).join('/')
}

/**
 * Include patterns that match nothing git tracks, where this machine has something at the pattern's
 * base. A typecheck here reads those files and one on a fresh clone does not. An include with
 * nothing behind it anywhere is read by no typecheck, so it passes.
 * @param {string[]} patterns tsconfig `include` entries
 * @param {Set<string>} tracked repo-relative paths git tracks
 * @param {(path: string) => boolean} exists whether the working tree has a repo-relative path
 * @returns {string[]}
 */
function unmatchedIncludes(patterns, tracked, exists) {
  return unmatchedPatterns(patterns, tracked).filter((pattern) => exists(includeBase(pattern)))
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
  commandsFromLintStaged,
  commandsFromHook,
  commandsFromWorkflow,
  pathsInCommand,
  pathsFromJestConfig,
  pathsFromTsconfig,
  untrackedPaths,
  unmatchedPatterns,
  unmatchedIncludes,
}
