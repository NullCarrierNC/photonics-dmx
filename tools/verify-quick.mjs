/**
 * A quick check of the staged changes for bulk commit runs, with the full set for a change
 * verifyQuickCore.cjs cannot judge. The any budget and tests the changed files do not reach wait
 * for `--full`, run at the end of a batch.
 *
 * Usage: node tools/verify-quick.mjs [--full] [--range <from>..<to>]
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { planChecks, parseNameStatus } = require('./verifyQuickCore.cjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const forceFull = args.includes('--full')
const rangeAt = args.indexOf('--range')
const range = rangeAt >= 0 ? args[rangeAt + 1] : null

const diffArgs = range
  ? ['diff', '--name-status', '-M', range]
  : ['diff', '--cached', '--name-status', '-M']
const changes = parseNameStatus(execFileSync('git', diffArgs, { cwd: root, encoding: 'utf8' }))
if (changes.length === 0 && !forceFull) {
  console.log(range ? `verify:quick: ${range} changes nothing` : 'verify:quick: nothing staged')
  process.exit(0)
}

const plan = planChecks(changes, { forceFull })
console.log(`verify:quick: ${plan.mode} set`)
for (const reason of plan.reasons) console.log(`  full because ${reason}`)

/** Run one step, stopping the whole check on its first failure. */
function step(name, command, commandArgs) {
  console.log(`== ${name}`)
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`verify:quick failed at ${name}`)
    process.exit(result.status ?? 1)
  }
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const workers = process.env.VERIFY_JEST_WORKERS ?? '50%'

if (plan.formatFiles.length > 0) step('prettier', npx, ['prettier', '--check', ...plan.formatFiles])
if (plan.lintFiles.length > 0) {
  step('eslint', npx, ['eslint', '--max-warnings', '0', ...plan.lintFiles])
}

if (plan.mode === 'full') {
  step('typecheck', npm, ['run', 'typecheck'])
  step('any budget', npm, ['run', 'any:budget'])
} else {
  for (const project of plan.typecheckProjects) {
    step(`typecheck ${project}`, npm, ['run', `typecheck:${project}`])
  }
}
step('type-escape budget', npm, ['run', 'type-escape:budget'])
step('size budget', npm, ['run', 'size:budget'])
step('referenced paths', npm, ['run', 'paths:check'])
step('coverage guard', npm, ['run', 'coverage:check'])
if (plan.dependencyChecks) {
  step('lockfile', npm, ['run', 'lockfile:check'])
  step('overrides', npm, ['run', 'overrides:check'])
}

if (plan.mode === 'full') {
  step('jest', npx, ['jest', '--ci', '--randomize', `--maxWorkers=${workers}`])
} else if (plan.testFiles.length > 0) {
  step('related jest', npx, [
    'jest',
    '--ci',
    '--passWithNoTests',
    `--maxWorkers=${workers}`,
    '--findRelatedTests',
    ...plan.testFiles,
  ])
}
console.log(`verify:quick: ${plan.mode} set passed`)
