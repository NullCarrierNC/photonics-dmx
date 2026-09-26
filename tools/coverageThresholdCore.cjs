/**
 * The coverage ratchet's pure core: reading the settings that decide what coverage measures, how
 * much of it has to pass and which tests run out of an evaluated Jest config, naming each one a
 * config loosens against a base, reading the refs the pre-push hook is given, and finding coverage
 * options on a command line and coverage ignore hints in source. The CLI in
 * coverage-threshold-check.mjs owns git, reading the files, evaluating jest.config.js and the exit
 * code.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this core
const { posix } = require('node:path')
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the tests require this core
const ts = require('typescript')

/** What Jest leaves out of coverage when a config names nothing. */
const DEFAULT_IGNORE_PATTERNS = ['/node_modules/']
/** The test files Jest runs when a config sets neither testMatch nor testRegex. */
const DEFAULT_TEST_MATCH = [
  '**/__tests__/**/*.?([mc])[jt]s?(x)',
  '**/?(*.)+(spec|test).?([mc])[jt]s?(x)',
]
/** Where Jest looks for tests when a config names no roots. */
const DEFAULT_ROOTS = ['<rootDir>']

/**
 * @typedef {{
 *   thresholds: Map<string, number>,
 *   collectFrom: string[] | null,
 *   ignorePatterns: string[],
 * }} CoverageSettings
 */

/**
 * The config and each inline project, since a project can carry its own coverage settings.
 * @param {Record<string, unknown>} config
 * @returns {Array<Record<string, unknown>>}
 */
function scopesOf(config) {
  const projects = Array.isArray(config.projects) ? config.projects : []
  return [config, ...projects.filter((project) => project !== null && typeof project === 'object')]
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringsIn(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []
}

/**
 * @param {Record<string, unknown> | null | undefined} config an evaluated Jest config
 * @returns {CoverageSettings} every threshold by `<path> <metric>`, the collectCoverageFrom
 *   entries across the config and its projects (null when none sets any), and the ignore patterns
 *   across them with Jest's default included
 */
function coverageSettings(config) {
  const scopes = scopesOf(config ?? {})

  /** @type {Map<string, number>} */
  const thresholds = new Map()
  const byPath = config?.coverageThreshold ?? {}
  for (const [path, metrics] of Object.entries(byPath)) {
    for (const [metric, value] of Object.entries(metrics ?? {})) {
      if (typeof value === 'number') thresholds.set(`${path} ${metric}`, value)
    }
  }

  const collecting = scopes.filter((scope) => Array.isArray(scope.collectCoverageFrom))
  const collectFrom =
    collecting.length === 0
      ? null
      : [...new Set(collecting.flatMap((scope) => stringsIn(scope.collectCoverageFrom)))]

  const ignorePatterns = [
    ...new Set([
      ...DEFAULT_IGNORE_PATTERNS,
      ...scopes.flatMap((scope) => stringsIn(scope.coveragePathIgnorePatterns)),
    ]),
  ]

  return { thresholds, collectFrom, ignorePatterns }
}

/**
 * @param {Record<string, unknown> | null | undefined} current the evaluated config being checked
 * @param {Record<string, unknown> | null | undefined} base the evaluated config it may not loosen,
 *   or null when there is nothing to compare with
 * @returns {string[]} one line per threshold set lower or dropped, per collectCoverageFrom entry
 *   dropped, per exclusion added to collectCoverageFrom, per ignore pattern added and per change
 *   that stops a test running or narrows the run
 */
function loosenedCoverage(current, base) {
  if (!base) return []
  const now = coverageSettings(current)
  const then = coverageSettings(base)
  /** @type {string[]} */
  const loosened = []

  for (const [key, floor] of then.thresholds) {
    const value = now.thresholds.get(key)
    if (value === undefined) {
      loosened.push(`${key} threshold is gone, and the base sets ${floor}`)
    } else if (value < floor) {
      loosened.push(`${key} threshold ${value} is below the base ${floor}`)
    }
  }

  const collected = now.collectFrom ?? []
  for (const entry of then.collectFrom ?? []) {
    if (!collected.includes(entry)) {
      loosened.push(`collectCoverageFrom drops '${entry}'`)
    }
  }
  for (const entry of collected) {
    if (entry.startsWith('!') && !(then.collectFrom ?? []).includes(entry)) {
      loosened.push(`collectCoverageFrom adds the exclusion '${entry}'`)
    }
  }

  for (const pattern of now.ignorePatterns) {
    if (!then.ignorePatterns.includes(pattern)) {
      loosened.push(`coveragePathIgnorePatterns adds '${pattern}'`)
    }
  }

  return [...loosened, ...narrowedTests(current ?? {}, base), ...narrowedRun(current ?? {}, base)]
}

/**
 * Top-level options that run some of the tests or none, whichever tests the projects select: a
 * name filter, only changed, failed or related tests, a filter module, or listing tests in place of
 * running them.
 */
const RUN_NARROWING = [
  'testNamePattern',
  'onlyChanged',
  'onlyFailures',
  'lastCommit',
  'changedFilesWithAncestor',
  'changedSince',
  'findRelatedTests',
  'filter',
  'listTests',
  'collectTests',
  'watch',
]

/**
 * @param {Record<string, unknown>} current
 * @param {Record<string, unknown>} base
 * @returns {string[]} one line per run-narrowing option the config sets to a value the base does
 *   not have
 */
function narrowedRun(current, base) {
  return RUN_NARROWING.filter((key) => current[key] && current[key] !== base[key]).map((key) => {
    const value = current[key]
    return `${key} is set to ${typeof value === 'string' ? `'${value}'` : String(value)}`
  })
}

/**
 * @param {unknown} value a string or a list of strings, as testRegex takes
 * @returns {string[]}
 */
function stringOrStrings(value) {
  return typeof value === 'string' ? [value] : stringsIn(value)
}

/**
 * @param {Record<string, unknown>} project an inline project or the config itself
 * @param {number} index its place in the projects list
 * @returns {string} the name a project is reported under
 */
function projectName(project, index) {
  const name = project.displayName
  if (typeof name === 'string') return name
  if (name !== null && typeof name === 'object' && typeof name.name === 'string') return name.name
  return `project ${index + 1}`
}

/**
 * The scopes whose settings decide which tests run. A config with projects runs only its projects,
 * and Jest reads no test selection from the top level then.
 * @param {Record<string, unknown>} config an evaluated Jest config
 * @returns {Map<string, Record<string, unknown>>} each project by name, a project given as a path
 *   under that path, or the config itself under '' when it has no projects
 */
function testScopesOf(config) {
  const projects = Array.isArray(config.projects) ? config.projects : []
  if (projects.length === 0) return new Map([['', config]])
  /** @type {Map<string, Record<string, unknown>>} */
  const scopes = new Map()
  projects.forEach((project, index) => {
    if (typeof project === 'string') scopes.set(project, {})
    else if (project !== null && typeof project === 'object') {
      scopes.set(projectName(project, index), project)
    }
  })
  return scopes
}

/**
 * @typedef {{
 *   ignore: string[],
 *   modules: string[],
 *   regex: string[],
 *   match: string[],
 *   roots: string[],
 * }} TestSelection
 */

/**
 * @param {Record<string, unknown>} scope
 * @returns {TestSelection} which test files the scope runs, with Jest's defaults filled in. A
 *   module path ignore pattern hides a test file from Jest as it hides any module.
 */
function testSelection(scope) {
  const regex = stringOrStrings(scope.testRegex)
  const match = stringOrStrings(scope.testMatch)
  return {
    ignore: Array.isArray(scope.testPathIgnorePatterns)
      ? stringsIn(scope.testPathIgnorePatterns)
      : DEFAULT_IGNORE_PATTERNS,
    modules: stringsIn(scope.modulePathIgnorePatterns),
    regex,
    match: match.length > 0 || regex.length > 0 ? match : DEFAULT_TEST_MATCH,
    roots: Array.isArray(scope.roots) ? stringsIn(scope.roots) : DEFAULT_ROOTS,
  }
}

/**
 * The settings that decide which tests run, since a test that stops running stops counting toward
 * coverage. A root is kept when a root that holds it remains.
 * @param {Record<string, unknown>} current
 * @param {Record<string, unknown>} base
 * @returns {string[]} one line per project dropped, test or module path ignore pattern added,
 *   testRegex or testMatch entry dropped and root dropped
 */
function narrowedTests(current, base) {
  const now = testScopesOf(current)
  const then = testScopesOf(base)
  /** @type {string[]} */
  const lines = []
  for (const [name, baseScope] of then) {
    if (now.has(name)) continue
    // Moving to or from projects renames the scopes, so the tests are compared across them all.
    if (name === '' || now.has('')) lines.push(...narrowedAcross(baseScope, now))
    else lines.push(`projects drops '${name}'`)
  }
  for (const [name, baseScope] of then) {
    const currentScope = now.get(name)
    if (currentScope === undefined) continue
    const prefix = name === '' ? '' : `${name}: `
    const was = testSelection(baseScope)
    const is = testSelection(currentScope)
    for (const pattern of is.ignore) {
      if (!was.ignore.includes(pattern)) {
        lines.push(`${prefix}testPathIgnorePatterns adds '${pattern}'`)
      }
    }
    lines.push(...addedModuleIgnores(was, is, prefix))
    for (const [key, field] of [
      ['testRegex', 'regex'],
      ['testMatch', 'match'],
    ]) {
      for (const entry of was[field]) {
        if (!is[field].includes(entry)) lines.push(`${prefix}${key} drops '${entry}'`)
      }
    }
    for (const root of was.roots) {
      if (!is.roots.some((kept) => root === kept || root.startsWith(`${kept}/`))) {
        lines.push(`${prefix}roots drops '${root}'`)
      }
    }
  }
  return lines
}

/**
 * @param {TestSelection} was
 * @param {TestSelection} is
 * @param {string} prefix the scope a line is reported under
 * @returns {string[]} one line per module path ignore pattern `is` adds
 */
function addedModuleIgnores(was, is, prefix) {
  return is.modules
    .filter((pattern) => !was.modules.includes(pattern))
    .map((pattern) => `${prefix}modulePathIgnorePatterns adds '${pattern}'`)
}

/** @param {string} pattern @returns {boolean} whether a regex matches only its own text */
const isLiteral = (pattern) => !/[.*+?^${}()|[\]\\]/.test(pattern)

/**
 * @param {string} root
 * @param {string} kept
 * @returns {boolean} whether `kept` is `root` or a folder that holds it
 */
const holds = (kept, root) => root === kept || root.startsWith(`${kept}/`)

/**
 * The base scope's tests against a set of scopes that replaced it. Each base root needs one scope
 * that holds it with every testRegex and testMatch entry. A test path ignore pattern that scope
 * adds only counts when it is not exactly the folder of another scope that runs those tests with
 * the base's selection and no added ignores. A module path ignore pattern counts in any scope that
 * runs some of a base root's tests.
 * @param {Record<string, unknown>} baseScope
 * @param {Map<string, Record<string, unknown>>} scopes
 * @returns {string[]} the lines for the first scope holding a root, or `roots drops` when none
 *   does, and the module path ignore patterns added
 */
function narrowedAcross(baseScope, scopes) {
  const was = testSelection(baseScope)
  const named = [...scopes].map(([name, scope]) => ({ name, is: testSelection(scope) }))
  const keepsEntries = (/** @type {TestSelection} */ is) =>
    was.regex.every((entry) => is.regex.includes(entry)) &&
    was.match.every((entry) => is.match.includes(entry))
  const runsAsBase = named.filter(
    ({ is }) =>
      keepsEntries(is) &&
      is.ignore.every((pattern) => was.ignore.includes(pattern)) &&
      is.modules.every((pattern) => was.modules.includes(pattern)),
  )

  /** @type {string[]} */
  const lines = []
  for (const root of was.roots) {
    const holding = named.filter(({ is }) => is.roots.some((kept) => holds(kept, root)))
    if (holding.length === 0) {
      lines.push(`roots drops '${root}'`)
      continue
    }
    const problems = holding.map(({ name, is }) => {
      const prefix = name === '' ? '' : `${name}: `
      /** @type {string[]} */
      const found = []
      for (const [key, field] of [
        ['testRegex', 'regex'],
        ['testMatch', 'match'],
      ]) {
        for (const entry of was[field]) {
          if (!is[field].includes(entry)) found.push(`${prefix}${key} drops '${entry}'`)
        }
      }
      for (const pattern of is.ignore) {
        if (was.ignore.includes(pattern)) continue
        const coveredElsewhere =
          isLiteral(pattern) &&
          runsAsBase.some(
            (other) =>
              other.name !== name &&
              other.is.roots.some(
                (otherRoot) => pattern === `${otherRoot}/` && holds(root, otherRoot),
              ),
          )
        if (!coveredElsewhere) found.push(`${prefix}testPathIgnorePatterns adds '${pattern}'`)
      }
      return found
    })
    if (!problems.some((found) => found.length === 0)) lines.push(...problems[0])
  }
  for (const { name, is } of named) {
    const overlaps = was.roots.some((root) =>
      is.roots.some((kept) => holds(kept, root) || holds(root, kept)),
    )
    if (overlaps) lines.push(...addedModuleIgnores(was, is, name === '' ? '' : `${name}: `))
  }
  return [...new Set(lines)]
}

/**
 * @param {string | null | undefined} sha
 * @returns {boolean} true for the all-zero id git gives a ref that does not exist, or no id at all
 */
function isMissingCommit(sha) {
  return !sha || /^0+$/.test(sha)
}

/**
 * @typedef {{ localRef: string, localSha: string, remoteRef: string, remoteSha: string }} PushedRef
 */

/**
 * The refs a pre-push hook is given on stdin, one `<local ref> <local sha> <remote ref> <remote
 * sha>` line each. A line that deletes a remote ref pushes nothing, so it is left out.
 * @param {string} text
 * @returns {PushedRef[]}
 */
function parsePushedRefs(text) {
  /** @type {PushedRef[]} */
  const refs = []
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 4) continue
    const [localRef, localSha, remoteRef, remoteSha] = fields
    if (isMissingCommit(localSha)) continue
    refs.push({ localRef, localSha, remoteRef, remoteSha })
  }
  return refs
}

/**
 * Jest options that change what coverage measures or how much of it has to pass, by the name the
 * command line takes with its dashes dropped and lower-cased. `--config` and `--rootDir` point Jest
 * at settings this guard does not read.
 */
const COVERAGE_OPTIONS = new Set([
  'coveragethreshold',
  'collectcoveragefrom',
  'coveragepathignorepatterns',
  'coverageprovider',
  'config',
  'rootdir',
])
/** Options that switch coverage off, with or without a `false` value. */
const COVERAGE_OFF = new Set(['nocoverage', 'nocollectcoverage'])
const COVERAGE_ON = new Set(['coverage', 'collectcoverage'])

/** A command that runs Jest, directly or through an npm script. */
const RUNS_JEST = /(?:^|[\s/])jest(?:\s|$)|\bnpm\s+(?:run\s+)?test(?::[\w-]+)?(?:\s|$)/

/**
 * @param {string} command one shell command
 * @returns {string[]} each option in it that changes what coverage measures or requires
 */
function overridesIn(command) {
  /** @type {string[]} */
  const found = []
  for (const token of command.split(/\s+/)) {
    const option = /^(-{1,2})([\w-]+)(?:=(.*))?$/.exec(token.replace(/^['"]|['"]$/g, ''))
    if (!option) continue
    const [, dashes, rawName, value] = option
    const name = rawName.replace(/-/g, '').toLowerCase()
    if (dashes === '-' ? name === 'c' : COVERAGE_OPTIONS.has(name) || COVERAGE_OFF.has(name)) {
      found.push(`${dashes}${rawName}`)
    } else if (dashes === '--' && COVERAGE_ON.has(name) && value === 'false') {
      found.push(token)
    }
  }
  return found
}

/**
 * The coverage options a script, hook or workflow passes to Jest on its command line, where Jest
 * lays them over jest.config.js.
 * @param {string} text shell text, one or more commands
 * @returns {string[]} one line per offending option, with the command that carries it
 */
function commandLineOverrides(text) {
  /** @type {string[]} */
  const lines = []
  for (const command of text.split(/&&|\|\||[;|\n]/)) {
    if (!RUNS_JEST.test(command)) continue
    for (const option of overridesIn(command)) {
      lines.push(`\`${command.trim()}\` passes ${option} to Jest`)
    }
  }
  return lines
}

/**
 * @param {Record<string, string> | undefined} scripts package.json's scripts
 * @returns {string[]} a line when `test:coverage` does not switch coverage on, since that script is
 *   what the pre-push hook and CI run to enforce the thresholds
 */
function testCoverageScriptProblems(scripts) {
  const script = scripts?.['test:coverage']
  if (typeof script !== 'string') return ['package.json has no test:coverage script']
  const on = script.split(/\s+/).some((token) => /^--(?:coverage|collect-?coverage)$/i.test(token))
  return on ? [] : [`test:coverage (\`${script}\`) does not run Jest with --coverage`]
}

/**
 * @param {string} text
 * @returns {string} the text with every regular expression character escaped
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The glob forms collectCoverageFrom entries use: `**` across directories, `*` and `?` within one,
 * and `{a,b}` alternatives.
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let pattern = ''
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]
    if (glob.startsWith('**/', i)) {
      pattern += '(?:.*/)?'
      i += 2
    } else if (glob.startsWith('**', i)) {
      pattern += '.*'
      i += 1
    } else if (char === '*') {
      pattern += '[^/]*'
    } else if (char === '?') {
      pattern += '[^/]'
    } else if (char === '{' && glob.indexOf('}', i) > i) {
      const end = glob.indexOf('}', i)
      pattern += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map(escapeRegExp)
        .join('|')})`
      i = end
    } else {
      pattern += escapeRegExp(char)
    }
  }
  return new RegExp(`^${pattern}$`)
}

/**
 * @param {Record<string, unknown> | null | undefined} config an evaluated Jest config
 * @returns {(path: string) => boolean} whether coverage counts a file, by its path from the
 *   repository root with forward slashes
 */
function coverageCollects(config) {
  const { collectFrom, ignorePatterns } = coverageSettings(config)
  const entries = collectFrom ?? ['**']
  const include = entries.filter((entry) => !entry.startsWith('!')).map(globToRegExp)
  const exclude = entries
    .filter((entry) => entry.startsWith('!'))
    .map((e) => globToRegExp(e.slice(1)))
  const ignore = ignorePatterns.map((p) => new RegExp(p.replace(/<rootDir>\/?/g, '/')))
  return (path) =>
    include.some((glob) => glob.test(path)) &&
    !exclude.some((glob) => glob.test(path)) &&
    !ignore.some((regex) => regex.test(`/${path}`))
}

/**
 * The modules a source file loads at runtime: static imports and re-exports that are not
 * type-only, `import()` and `require()` of a string literal.
 * @param {string} text
 * @param {string} fileName decides how the file is parsed, so a .tsx file reads as JSX
 * @returns {string[]}
 */
function runtimeImportsOf(text, fileName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest)
  /** @type {string[]} */
  const specifiers = []
  /** @param {import('typescript').Node} node */
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
      if (ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text)
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return specifiers
}

/**
 * The path aliases a Jest config maps, as [pattern, replacement from the repository root] pairs.
 * @param {Record<string, unknown> | null | undefined} config
 * @returns {Array<[RegExp, string]>}
 */
function aliasesOf(config) {
  /** @type {Map<string, string>} */
  const mapped = new Map()
  for (const scope of scopesOf(config ?? {})) {
    const mapper = scope.moduleNameMapper
    if (mapper === null || typeof mapper !== 'object') continue
    for (const [pattern, replacement] of Object.entries(mapper)) {
      if (typeof replacement === 'string') {
        mapped.set(pattern, replacement.replace(/^<rootDir>\/?/, ''))
      }
    }
  }
  return [...mapped].map(([pattern, replacement]) => [new RegExp(pattern), replacement])
}

/** What an import without an extension can name, in the order the bundler tries them. */
const RESOLVE_SUFFIXES = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '/index.ts',
  '/index.tsx',
]

/**
 * @param {string} from the importing file, from the repository root
 * @param {string} specifier
 * @param {Set<string>} files every source file, from the repository root
 * @param {Array<[RegExp, string]>} aliases
 * @returns {string | null} the source file the import names, or null for a package or a file
 *   outside the sources
 */
function resolveImport(from, specifier, files, aliases) {
  let target = null
  if (specifier.startsWith('.')) {
    target = posix.join(posix.dirname(from), specifier)
  } else {
    const alias = aliases.find(([pattern]) => pattern.test(specifier))
    if (alias) target = posix.normalize(specifier.replace(alias[0], alias[1]))
  }
  if (target === null) return null
  const found = RESOLVE_SUFFIXES.map((suffix) => target + suffix).find((path) => files.has(path))
  return found ?? null
}

/**
 * Source files coverage counts that load a file coverage leaves out, which is how code moved into
 * a tests directory or renamed to a test file keeps running while it leaves the count. A type
 * declaration file carries no runtime code and is not named.
 * @param {Map<string, string>} sources every source file's text by its path from the repository
 *   root, with forward slashes
 * @param {Record<string, unknown> | null | undefined} config the evaluated Jest config
 * @returns {string[]} one line per such import
 */
function importsOfUncounted(sources, config) {
  const collects = coverageCollects(config)
  const aliases = aliasesOf(config)
  const files = new Set(sources.keys())
  /** @type {string[]} */
  const lines = []
  for (const [path, text] of sources) {
    if (!collects(path)) continue
    for (const specifier of runtimeImportsOf(text, path)) {
      const target = resolveImport(path, specifier, files, aliases)
      if (target !== null && !target.endsWith('.d.ts') && !collects(target)) {
        lines.push(`${path} loads ${target}, which coverage leaves out`)
      }
    }
  }
  return lines
}

/**
 * The comments that tell a coverage provider to leave lines out: `c8`, `v8` and `istanbul` ignore
 * hints and `node:coverage` disable. The providers match them by line, strings included, so this
 * does too.
 */
const IGNORE_HINT = /\b(?:[cv]8|istanbul)\s+ignore\b|\bnode:coverage\s+(?:ignore|disable)\b/

/**
 * @param {Map<string, string>} sources every source file's text by its path from the repository
 *   root, with forward slashes
 * @param {Record<string, unknown> | null | undefined} config the evaluated Jest config
 * @returns {string[]} one line per coverage ignore hint in a file coverage counts
 */
function coverageIgnoreHints(sources, config) {
  const collects = coverageCollects(config)
  /** @type {string[]} */
  const lines = []
  for (const [path, text] of sources) {
    if (!collects(path)) continue
    text.split(/\r?\n/).forEach((line, index) => {
      if (IGNORE_HINT.test(line)) lines.push(`${path}:${index + 1} carries a coverage ignore hint`)
    })
  }
  return lines
}

module.exports = {
  coverageSettings,
  loosenedCoverage,
  isMissingCommit,
  parsePushedRefs,
  commandLineOverrides,
  testCoverageScriptProblems,
  importsOfUncounted,
  coverageIgnoreHints,
}
