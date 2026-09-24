/**
 * verify:quick's plan: which checks the changed files need, and whether they need the full set.
 * The CLI in verify-quick.mjs reads git and runs the plan.
 */

/** @typedef {{ status: string, path: string }} Change */
/**
 * @typedef {{
 *   mode: 'quick' | 'full',
 *   reasons: string[],
 *   formatFiles: string[],
 *   lintFiles: string[],
 *   typecheckProjects: string[],
 *   testFiles: string[],
 *   dependencyChecks: boolean,
 * }} Plan
 */

const CODE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const FORMATTED = /\.(?:[cm]?[jt]s|[jt]sx|json|md|ya?ml|css)$/

/** Paths whose effect on the suite a related-tests run cannot follow, each with the reason. */
const FULL_RUN_PATHS = [
  [/^package(?:-lock)?\.json$/, 'dependencies changed'],
  [
    /^(?:jest\.config|electron\.vite\.config|eslint\.config)\.[^/]+$/,
    'build or test configuration',
  ],
  [/^tsconfig[^/]*\.json$/, 'a tsconfig changed'],
  [/^tools\//, 'tooling changed'],
  [/^metrics\/explicit-any-budget\.txt$/, 'the any budget changed'],
  [/^\.husky\//, 'a git hook changed'],
  [/^\.github\//, 'a workflow changed'],
  [/^resources\//, 'bundled data is loaded by path'],
  [/(?:^|\/)__mocks__\//, 'an automatic mock changed'],
  [/(?:^|\/)jest\.setup\.[jt]s$|^src\/renderer\/src\/tests\/setup\.[jt]s$/, 'Jest setup changed'],
]

/**
 * The tsconfig projects a source path compiles under. Tests compile under the test project only,
 * and every source change also runs the test project, since the tests type against it.
 * @param {string} path
 * @returns {string[]}
 */
function projectsFor(path) {
  if (!path.startsWith('src/') || !CODE.test(path)) return []
  if (/\.(?:test|spec)\.[^/]+$/.test(path) || /(?:^|\/)(?:tests|__tests__)\//.test(path)) {
    return ['test']
  }
  if (path.startsWith('src/renderer/')) return ['web', 'test']
  if (path.startsWith('src/main/') || path.startsWith('src/preload/')) {
    return /^src\/preload\/[^/]+\.d\.ts$/.test(path) ? ['node', 'web', 'test'] : ['node', 'test']
  }
  return ['node', 'web', 'test']
}

/**
 * @param {Change[]} changes git name-status rows, status first letter as git prints it
 * @param {{ forceFull?: boolean }} [options]
 * @returns {Plan}
 */
function planChecks(changes, options = {}) {
  const reasons = []
  if (options.forceFull) reasons.push('asked for the full set')
  for (const { status, path } of changes) {
    for (const [pattern, reason] of FULL_RUN_PATHS) {
      if (pattern.test(path)) reasons.push(`${reason} (${path})`)
    }
    if ((status === 'D' || status === 'R') && path.startsWith('src/')) {
      reasons.push(`a module was deleted or renamed (${path})`)
    }
  }
  const present = changes.filter(({ status }) => status !== 'D').map(({ path }) => path)
  const projects = new Set(present.flatMap(projectsFor))
  return {
    mode: reasons.length > 0 ? 'full' : 'quick',
    reasons,
    formatFiles: present.filter((path) => FORMATTED.test(path) && !path.startsWith('docs/')),
    lintFiles: present.filter((path) => CODE.test(path) && !path.startsWith('scripts/')),
    typecheckProjects: ['node', 'web', 'test'].filter((project) => projects.has(project)),
    testFiles: present.filter((path) => path.startsWith('src/') && CODE.test(path)),
    dependencyChecks: changes.some(({ path }) => /^package(?:-lock)?\.json$/.test(path)),
  }
}

/**
 * Parse `git diff --name-status` output. A rename becomes its old path, marked R, and its new path
 * as added, so both halves are planned for.
 * @param {string} text
 * @returns {Change[]}
 */
function parseNameStatus(text) {
  const changes = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const [status, ...paths] = line.split('\t')
    const kind = status[0]
    if (kind === 'R' || kind === 'C') {
      if (kind === 'R') changes.push({ status: 'R', path: paths[0] })
      changes.push({ status: 'A', path: paths[1] })
    } else {
      changes.push({ status: kind, path: paths[0] })
    }
  }
  return changes
}

module.exports = { planChecks, parseNameStatus, projectsFor }
