/**
 * Refuses a push whose commits the pre-push checks would not read. The hook gives the refs it is
 * pushing on stdin, and every other check in it reads the working tree, so each pushed commit has
 * to be HEAD and the tree has to be clean.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parsePushedRefs } = require('./coverageThresholdCore.cjs')
const { pushedTreeProblems } = require('./pushedTreeCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** @param {string[]} args @returns {string} git's output */
function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

const pushed = parsePushedRefs(readFileSync(0, 'utf8')).map((ref) => ({
  ...ref,
  commit: git(['rev-parse', `${ref.localSha}^{commit}`]),
}))
const head = git(['rev-parse', 'HEAD'])
const changes = git(['status', '--porcelain', '--untracked-files=normal'])
  .split('\n')
  .filter((line) => line.trim() !== '')

const problems = pushedTreeProblems({ pushed, head, changes })
if (problems.length > 0) {
  for (const line of problems) console.error(line)
  console.error(
    'The pre-push checks read the working tree. Check out the commit being pushed, and commit or stash what is left, then push again.',
  )
  process.exit(1)
}
console.log('Pushed commits: the checks read what is pushed')
