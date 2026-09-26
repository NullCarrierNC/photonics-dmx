import { afterEach, describe, expect, it } from '@jest/globals'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const repository = join(__dirname, '../../../..')
const TOOLS = ['coverage-threshold-check.mjs', 'coverageThresholdCore.cjs']
const ZERO = '0'.repeat(40)

const jestConfig = (statements: number): string =>
  `module.exports = { coverageThreshold: { global: { statements: ${statements} } } }\n`

const manifest = JSON.stringify({ scripts: { 'test:coverage': 'jest --coverage' } })

const fixtures: string[] = []

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A repository holding the guard, with one commit on `branch` that sets the threshold to 80. */
function fixture(branch = 'development') {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'coverage-guard-')))
  fixtures.push(dir)
  const gitConfig = join(dir, '.gitconfig-empty')
  writeFileSync(gitConfig, '')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.test',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.test',
  }
  delete env.COVERAGE_BASE_REF

  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim()
  const write = (files: Record<string, string>): void => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
  }
  const commit = (files: Record<string, string>): string => {
    write(files)
    git('add', '-A')
    git('commit', '-q', '-m', 'change')
    return git('rev-parse', 'HEAD')
  }

  for (const tool of TOOLS) {
    mkdirSync(join(dir, 'tools'), { recursive: true })
    copyFileSync(join(repository, 'tools', tool), join(dir, 'tools', tool))
  }
  symlinkSync(join(repository, 'node_modules'), join(dir, 'node_modules'), 'junction')
  git('init', '-q', '-b', branch)
  commit({
    '.gitignore': 'node_modules\n.gitconfig-empty\n',
    'package.json': manifest,
    'jest.config.js': jestConfig(80),
    'src/index.ts': 'export const one = 1\n',
  })

  const run = (baseRef?: string, pushed?: string) => {
    const result = spawnSync(
      process.execPath,
      ['tools/coverage-threshold-check.mjs', ...(pushed === undefined ? [] : ['--pushed'])],
      {
        cwd: dir,
        env: baseRef === undefined ? env : { ...env, COVERAGE_BASE_REF: baseRef },
        input: pushed ?? '',
        encoding: 'utf8',
      },
    )
    return { status: result.status, out: `${result.stdout}${result.stderr}` }
  }

  return { git, write, commit, run }
}

describe('coverage-threshold-check against the base CI names', () => {
  it('fails when COVERAGE_BASE_REF names a commit the clone does not have', () => {
    const repo = fixture()

    const { status, out } = repo.run('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')

    expect(status).toBe(1)
    expect(out).toContain(
      'the working tree: found no commit at where HEAD meets COVERAGE_BASE_REF to compare with',
    )
  })

  it('holds a new branch to where it meets development', () => {
    const repo = fixture()
    repo.git('checkout', '-q', '-b', 'feature')
    repo.commit({ 'jest.config.js': jestConfig(70) })

    const { status, out } = repo.run(ZERO)

    expect(status).toBe(1)
    expect(out).toContain(
      'the working tree: global statements threshold 70 is below the base 80, against where HEAD meets development',
    )
  })

  it('holds a tag on development to the release tag before it', () => {
    const repo = fixture()
    repo.git('tag', 'v1.0.0')
    repo.commit({ 'jest.config.js': jestConfig(70) })
    repo.git('tag', 'v1.1.0')

    const { status, out } = repo.run(ZERO)

    expect(status).toBe(1)
    expect(out).toContain(
      'the working tree: global statements threshold 70 is below the base 80, against the release before HEAD (v1.0.0)',
    )
  })

  it('fails a tag on development with no release before it', () => {
    const repo = fixture()
    repo.commit({ 'src/index.ts': 'export const two = 2\n' })

    const { status, out } = repo.run(ZERO)

    expect(status).toBe(1)
    expect(out).toContain(
      'the working tree: found no commit at the release before HEAD to compare with',
    )
  })

  it('passes a push held to the commit before it with nothing loosened', () => {
    const repo = fixture()
    const before = repo.git('rev-parse', 'HEAD')
    repo.commit({ 'jest.config.js': jestConfig(85) })

    const { status, out } = repo.run(before)

    expect(status).toBe(0)
    expect(out).toContain('where HEAD meets COVERAGE_BASE_REF')
  })
})

describe('coverage-threshold-check without a branch base', () => {
  it('fails a local run when HEAD meets no upstream or development', () => {
    const repo = fixture('trunk')

    const { status, out } = repo.run()

    expect(status).toBe(1)
    expect(out).toContain('the working tree: found no commit at the branch base to compare with')
  })

  it('fails a pushed ref the remote lacks when it meets no upstream or development', () => {
    const repo = fixture('trunk')
    const head = repo.git('rev-parse', 'HEAD')

    const { status, out } = repo.run(
      undefined,
      `refs/heads/trunk ${head} refs/heads/trunk ${ZERO}\n`,
    )

    expect(status).toBe(1)
    expect(out).toContain('refs/heads/trunk: found no commit at its branch base to compare with')
  })
})
