/**
 * Checks that package-lock.json is the lock npm would write for package.json, without touching
 * either tracked file. Both are copied into a temporary directory, npm rewrites the lock there, and
 * the result is compared with the tracked lock. Line endings are ignored, so a Windows checkout
 * with CRLF files compares the same as any other.
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
/** What npm reads to resolve the tree. `.npmrc` is copied when the repository has one. */
const INPUTS = ['package.json', 'package-lock.json', '.npmrc']
/** Lines of context shown around the first difference. */
const CONTEXT = 3

/**
 * @param {string} path
 * @returns {string[]}
 */
function linesOf(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n')
}

const scratch = mkdtempSync(join(tmpdir(), 'lockfile-check-'))
let status = 0
try {
  for (const name of INPUTS) {
    if (existsSync(join(root, name))) {
      copyFileSync(join(root, name), join(scratch, name))
    }
  }
  const npm = spawnSync(
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts', '--no-fund', '--no-audit'],
    { cwd: scratch, stdio: 'inherit', shell: process.platform === 'win32' },
  )
  if (npm.status !== 0) {
    console.error('npm could not write a lock for package.json.')
    status = npm.status ?? 1
  } else {
    const tracked = linesOf(join(root, 'package-lock.json'))
    const written = linesOf(join(scratch, 'package-lock.json'))
    const first = tracked.findIndex((line, i) => line !== written[i])
    const differs = first !== -1 || tracked.length !== written.length
    if (differs) {
      const at = first === -1 ? Math.min(tracked.length, written.length) : first
      const from = Math.max(0, at - CONTEXT)
      console.error(`package-lock.json does not match package.json, from line ${at + 1}:`)
      console.error('--- tracked')
      console.error(tracked.slice(from, at + CONTEXT + 1).join('\n'))
      console.error('+++ what npm writes')
      console.error(written.slice(from, at + CONTEXT + 1).join('\n'))
      console.error('Run `npm install` and commit the lock it writes.')
      status = 1
    } else {
      console.log('package-lock.json matches package.json')
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
process.exit(status)
