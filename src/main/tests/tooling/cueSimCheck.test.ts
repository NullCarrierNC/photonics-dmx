import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const REPO = join(__dirname, '../../../..')
const TOOLS = [
  'cue-sim-check.mjs',
  'cueSimCore.cjs',
  'cueSimWatchdog.cjs',
  'cue-sim-worker.cjs',
  'coverageThresholdCore.cjs',
]
const LIBRARY = 'resources/defaults/node-data/cues/yarg/yarg-test.json'
const ZERO = '0'.repeat(40)

/** The environment with git's own variables left out, so a hook's GIT_DIR never leaks in. */
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
)

let repo: string

function git(...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      `core.hooksPath=${join(repo, 'no-hooks')}`,
      ...args,
    ],
    { cwd: repo, env, encoding: 'utf8' },
  ).trim()
}

/** Commits the test library with this cueVersion and group name, and returns the commit. */
function commitLibrary(cueVersion: number, name: string): string {
  const library = { cueVersion, group: { id: 'yarg-test', name }, cues: [] }
  writeFileSync(join(repo, LIBRARY), `${JSON.stringify(library, null, 2)}\n`)
  git('add', LIBRARY)
  git('commit', '--quiet', '--no-verify', '-m', `${name} ${cueVersion}`)
  return git('rev-parse', 'HEAD')
}

/**
 * Runs the check in the scratch repository. `--write` ends the run once the cueVersion guard has
 * passed, since the scratch repository bundles no cues to simulate.
 */
function check(options: { args?: string[]; stdin?: string; baseRef?: string } = {}) {
  const result = spawnSync(
    process.execPath,
    ['tools/cue-sim-check.mjs', '--write', ...(options.args ?? [])],
    {
      cwd: repo,
      input: options.stdin ?? '',
      encoding: 'utf8',
      env: {
        ...env,
        NODE_PATH: join(REPO, 'node_modules'),
        CUE_VERSION_BASE_REF: options.baseRef ?? '',
      },
    },
  )
  return { status: result.status, stderr: result.stderr }
}

const pushLine = (ref: string, local: string, remote: string): string =>
  `refs/heads/${ref} ${local} refs/heads/${ref} ${remote}\n`

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'cue-sim-check-'))
  for (const file of TOOLS) {
    mkdirSync(join(repo, 'tools'), { recursive: true })
    copyFileSync(join(REPO, 'tools', file), join(repo, 'tools', file))
  }
  for (const domain of ['yarg', 'rb3', 'audio']) {
    mkdirSync(join(repo, 'resources/defaults/node-data/cues', domain), { recursive: true })
  }
  mkdirSync(join(repo, 'metrics'))
  mkdirSync(dirname(join(repo, LIBRARY)), { recursive: true })
  git('init', '--quiet', '-b', 'development')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('cueVersion guard on development', () => {
  it('refuses a pushed commit that edits a bundled file without a cueVersion bump', () => {
    const remote = commitLibrary(3, 'Red')
    const local = commitLibrary(3, 'Blue')

    const result = check({ args: ['--pushed'], stdin: pushLine('development', local, remote) })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`${LIBRARY}: content changed but cueVersion is 3`)
  })

  it('accepts a pushed commit that raises the cueVersion', () => {
    const remote = commitLibrary(3, 'Red')
    const local = commitLibrary(4, 'Blue')

    const result = check({ args: ['--pushed'], stdin: pushLine('development', local, remote) })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('refuses the edit in CI, held to the commit the push starts from', () => {
    const before = commitLibrary(3, 'Red')
    commitLibrary(3, 'Blue')

    const result = check({ baseRef: before })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('against where HEAD meets CUE_VERSION_BASE_REF')
  })

  it('holds a new branch to where it meets development', () => {
    commitLibrary(3, 'Red')
    git('checkout', '--quiet', '-b', 'feature')
    const local = commitLibrary(3, 'Blue')

    const result = check({ args: ['--pushed'], stdin: pushLine('feature', local, ZERO) })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('against its branch base')
  })

  it('checks only the branch base when CI names no commit, as for a tag', () => {
    commitLibrary(3, 'Red')

    const result = check({ baseRef: ZERO })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
})

describe('cueVersion guard without a base', () => {
  it('refuses a push whose remote commit this clone does not have', () => {
    const local = commitLibrary(3, 'Red')

    const result = check({
      args: ['--pushed'],
      stdin: pushLine('development', local, 'f'.repeat(40)),
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('which this clone does not have')
  })

  it('refuses a CI base this clone does not have', () => {
    commitLibrary(3, 'Red')

    const result = check({ baseRef: 'f'.repeat(40) })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('CUE_VERSION_BASE_REF names ffffffff')
  })

  it('refuses a working tree with no branch base to compare with', () => {
    commitLibrary(3, 'Red')
    git('checkout', '--quiet', '--orphan', 'unrelated')
    git('commit', '--quiet', '--no-verify', '-m', 'unrelated')
    git('branch', '--quiet', '-D', 'development')

    const result = check()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('the working tree: no commit where it meets')
  })
})
