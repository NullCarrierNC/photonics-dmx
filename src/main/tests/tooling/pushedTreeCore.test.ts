import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const { pushedTreeProblems } = require('../../../../tools/pushedTreeCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const head = 'a'.repeat(40)
const older = 'c'.repeat(40)
const remote = 'b'.repeat(40)
const zero = '0'.repeat(40)

const ref = (localRef: string, commit: string, remoteSha = remote) => ({
  localRef,
  localSha: commit,
  remoteSha,
  commit,
})

describe('pushedTreeProblems', () => {
  it('passes a push of HEAD from a clean tree', () => {
    expect(
      pushedTreeProblems({
        pushed: [ref('refs/heads/feature', head), ref('refs/heads/new', head, zero)],
        head,
        changes: [],
      }),
    ).toEqual([])
  })

  it('names a pushed commit that is not HEAD', () => {
    expect(
      pushedTreeProblems({ pushed: [ref('refs/heads/other', older)], head, changes: [] }),
    ).toEqual(['refs/heads/other pushes cccccccc, and the checks read HEAD aaaaaaaa'])
  })

  it('reads an annotated tag by the commit it names', () => {
    const tag = {
      localRef: 'refs/tags/v1',
      localSha: 'd'.repeat(40),
      remoteSha: zero,
      commit: head,
    }

    expect(pushedTreeProblems({ pushed: [tag], head, changes: [] })).toEqual([])
  })

  it('names uncommitted and untracked changes the push does not carry', () => {
    const changes = [' M src/a.ts', '?? src/b.test.ts']

    expect(
      pushedTreeProblems({ pushed: [ref('refs/heads/feature', head)], head, changes }),
    ).toEqual([
      'the working tree has changes the push does not carry: M src/a.ts, ?? src/b.test.ts',
    ])
  })

  it('leaves out a ref the remote already has, and a push that sends nothing', () => {
    const tag = { localRef: 'refs/tags/v0', localSha: older, remoteSha: older, commit: older }

    expect(pushedTreeProblems({ pushed: [tag], head, changes: [' M src/a.ts'] })).toEqual([])
    expect(pushedTreeProblems({ pushed: [], head, changes: [' M src/a.ts'] })).toEqual([])
  })
})
