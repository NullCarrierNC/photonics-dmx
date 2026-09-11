/**
 * Fails when package.json, a git hook or a workflow runs a file git does not track.
 *
 * A fresh clone carries only what git tracks, so a script naming an ignored or uncommitted file
 * works for whoever wrote it and fails for everyone else. This asks git rather than the working
 * tree, since the working tree is the one place such a file always exists.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const {
  commandsFromPackageJson,
  commandsFromHook,
  commandsFromWorkflow,
  pathsInCommand,
  untrackedPaths,
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
  ...filesIn('.husky').flatMap((file) => commandsFromHook(read(file))),
  ...filesIn('.github/workflows')
    .filter((file) => /\.ya?ml$/.test(file))
    .flatMap((file) => commandsFromWorkflow(read(file))),
]

const tracked = new Set(
  execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split(/\r?\n/)
    .filter((line) => line !== ''),
)

const missing = untrackedPaths(commands, tracked)
if (missing.length > 0) {
  console.error('Run by package.json, a git hook or a workflow, but not tracked by git:')
  for (const path of missing) {
    console.error(`  ${path}`)
  }
  console.error(
    'A fresh clone would not have these. Commit them from a tracked directory such as tools/.',
  )
  process.exit(1)
}

const checked = new Set(commands.flatMap(pathsInCommand)).size
console.log(`Referenced paths: ${checked} checked, all tracked by git`)
