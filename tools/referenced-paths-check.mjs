/**
 * Fails when package.json, lint-staged, a git hook or a workflow runs a file git does not track,
 * when jest.config.js or a tsconfig names a setup file, base, file or project git does not track,
 * and when a tsconfig include has files on this machine behind it and none committed.
 *
 * A fresh clone carries only what git tracks, so a script naming an ignored or uncommitted file
 * works for whoever wrote it and fails for everyone else. This reads the committed tree at HEAD,
 * since the working tree always has such a file and the index can hold one a push leaves behind.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const {
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
} = require('./referencedPathsCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** @param {string} path repo-relative */
function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

/**
 * The files directly inside a directory, as repo-relative paths, or none when it is absent.
 * @param {string} dir
 * @returns {string[]}
 */
function filesIn(dir) {
  if (!existsSync(join(root, dir))) {
    return []
  }
  return readdirSync(join(root, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${dir}/${entry.name}`)
}

const commands = [
  ...commandsFromPackageJson(read('package.json')),
  ...commandsFromLintStaged(read('package.json')),
  ...filesIn('.husky').flatMap((file) => commandsFromHook(read(file))),
  ...filesIn('.github/workflows')
    .filter((file) => /\.ya?ml$/.test(file))
    .flatMap((file) => commandsFromWorkflow(read(file))),
]

const jestExport = (await import(pathToFileURL(join(root, 'jest.config.js')).href)).default
const jestConfig = typeof jestExport === 'function' ? await jestExport() : jestExport

const tsconfigs = readdirSync(root)
  .filter((file) => /^tsconfig(\..+)?\.json$/.test(file))
  .map((file) => pathsFromTsconfig(read(file)))
const required = [
  ...pathsFromJestConfig(jestConfig),
  ...tsconfigs.flatMap((tsconfig) => tsconfig.required),
]
const included = tsconfigs.flatMap((tsconfig) => tsconfig.included)

const tracked = new Set(
  execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split(/\r?\n/)
    .filter((line) => line !== ''),
)

const missing = [
  ...untrackedPaths(commands, tracked),
  ...unmatchedPatterns(required, tracked),
  ...unmatchedIncludes(included, tracked, (path) => existsSync(join(root, path))),
]
if (missing.length > 0) {
  console.error(
    'Named by package.json, lint-staged, a git hook, a workflow, jest.config.js or a tsconfig, but not committed:',
  )
  for (const path of missing) {
    console.error(`  ${path}`)
  }
  console.error(
    'A fresh clone would not have these. Commit them from a tracked directory such as tools/.',
  )
  process.exit(1)
}

const checked = new Set([...commands.flatMap(pathsInCommand), ...required, ...included]).size
console.log(`Referenced paths: ${checked} checked, all committed`)
