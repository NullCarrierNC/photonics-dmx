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

const LIST = 'metrics/cue-sim-fingerprints.txt'

/** Commits the fingerprint list with these lines, and returns the commit. */
function commitList(lines: string[], message: string): string {
  writeFileSync(join(repo, LIST), `${lines.join('\n')}\n`)
  git('add', LIST)
  git('commit', '--quiet', '--no-verify', '-m', message)
  return git('rev-parse', 'HEAD')
}

/**
 * Merges `feature` into development with the fingerprint list as `resolved`, committing the merge
 * whether git merged the list itself or left it in conflict. Returns the merge.
 */
function mergeFeature(resolved?: string[]): string {
  try {
    git('merge', '--quiet', '--no-ff', '--no-edit', 'feature')
  } catch {
    // A conflict in the list, which the resolution below settles.
  }
  if (resolved) {
    writeFileSync(join(repo, LIST), `${resolved.join('\n')}\n`)
    git('add', LIST)
    git('commit', '--quiet', '--no-verify', '--no-edit')
  }
  return git('rev-parse', 'HEAD')
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

  it('holds development to the release before HEAD when CI names no commit', () => {
    commitLibrary(3, 'Red')
    git('tag', 'v0.1.0')
    commitLibrary(3, 'Blue')

    const result = check({ baseRef: ZERO })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('against the release before HEAD (v0.1.0)')
  })

  it('accepts a raised cueVersion against the release before HEAD', () => {
    commitLibrary(3, 'Red')
    git('tag', 'v0.1.0')
    commitLibrary(4, 'Blue')

    const result = check({ baseRef: ZERO })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('holds a branch to where it meets development when CI names no commit', () => {
    commitLibrary(3, 'Red')
    git('checkout', '--quiet', '-b', 'feature')
    commitLibrary(3, 'Blue')

    const result = check({ baseRef: ZERO })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('against the branch base')
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

  it('refuses development with no release before HEAD when CI names no commit', () => {
    commitLibrary(3, 'Red')

    const result = check({ baseRef: ZERO })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('CUE_VERSION_BASE_REF names no commit')
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

describe('fingerprints recorded in merges', () => {
  let remote: string

  beforeEach(() => {
    remote = commitList(['a 1', 'b 1', 'c 1'], 'List')
    git('checkout', '--quiet', '-b', 'feature')
  })

  it('refuses a pushed merge that records fingerprints neither side recorded', () => {
    commitList(['a 2', 'b 1', 'c 1'], 'Feature moves a')
    git('checkout', '--quiet', 'development')
    commitList(['a 3', 'b 1', 'c 1'], 'Development moves a')
    const merge = mergeFeature(['a 4', 'b 1', 'c 1'])

    const result = check({ args: ['--pushed'], stdin: pushLine('development', merge, remote) })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      `refs/heads/development: merge ${merge.slice(0, 8)} records cue fingerprints neither parent holds`,
    )
  })

  it('refuses the same merge in CI', () => {
    commitList(['a 2', 'b 1', 'c 1'], 'Feature moves a')
    git('checkout', '--quiet', 'development')
    commitList(['a 3', 'b 1', 'c 1'], 'Development moves a')
    const merge = mergeFeature(['a 4', 'b 1', 'c 1'])

    const result = check({ baseRef: remote })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`merge ${merge.slice(0, 8)} records cue fingerprints`)
  })

  it('accepts a merge git made of each side recording its own fingerprints', () => {
    commitList(['a 2', 'b 1', 'c 1'], 'Feature moves a')
    git('checkout', '--quiet', 'development')
    commitList(['a 1', 'b 1', 'c 3'], 'Development moves c')
    const merge = mergeFeature()

    const result = check({ args: ['--pushed'], stdin: pushLine('development', merge, remote) })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('accepts a merge that keeps a parent list in another order and spacing', () => {
    commitList(['settings', 'a 2', 'b 1', 'c 1'], 'Feature moves a')
    git('checkout', '--quiet', 'development')
    commitList(['settings', 'a 3', 'b 1', 'c 1'], 'Development moves a')
    const merge = mergeFeature(['settings', 'c 1', 'b 1 ', '', 'a 3'])

    const result = check({ args: ['--pushed'], stdin: pushLine('development', merge, remote) })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('accepts a conflicted merge that keeps a parent list, re-recorded after it', () => {
    commitList(['a 2', 'b 1', 'c 1'], 'Feature moves a')
    git('checkout', '--quiet', 'development')
    commitList(['a 3', 'b 1', 'c 1'], 'Development moves a')
    mergeFeature(['a 3', 'b 1', 'c 1'])
    const after = commitList(['a 4', 'b 1', 'c 1'], 'Re-record a after the merge')

    const result = check({ args: ['--pushed'], stdin: pushLine('development', after, remote) })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
})
