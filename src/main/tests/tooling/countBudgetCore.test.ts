import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const { readBudget, budgetVerdict } = require('../../../../tools/countBudgetCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const file = 'metrics/example-budget.txt'
const one = (count: number) => new Map([['Explicit any', count]])
const several = (files: number, exports: number) =>
  new Map([
    ['files', files],
    ['exports', exports],
  ])

const verdict = (
  counts: Map<string, number>,
  recordedText: string | null,
  write = false,
): { ok: boolean; lines: string[]; write?: string } =>
  budgetVerdict({
    counts,
    recordedText,
    write,
    label: counts.size === 1 ? 'Explicit any' : 'Knip',
    file,
    counted: 'reports of the rule.',
    note: 'Lower this when removing them.',
  })

describe('budgetVerdict', () => {
  it('passes a count at or below its budget', () => {
    expect(verdict(one(21), '21\nAuto-generated: x\nnote\n')).toEqual({
      ok: true,
      lines: ['Explicit any: 21 (budget 21) - ok'],
    })
    expect(verdict(one(3), '21\n').ok).toBe(true)
  })

  it('fails a count above its budget', () => {
    const result = verdict(one(22), '21\n')

    expect(result.ok).toBe(false)
    expect(result.lines[0]).toBe(`Explicit any count 22 exceeds budget 21 (file ${file})`)
  })

  it('fails when there is no budget file', () => {
    expect(verdict(one(0), null)).toEqual({
      ok: false,
      lines: [`Missing ${file}. Run the same command with --write`],
    })
  })

  it('fails a budget file that does not start with a non-negative integer', () => {
    expect(verdict(one(0), 'twenty\n').ok).toBe(false)
    expect(verdict(one(0), '-1\n').ok).toBe(false)
  })

  it('records a lower count with --write', () => {
    const result = verdict(one(19), '21\n', true)

    expect(result.ok).toBe(true)
    expect(result.write).toBe(
      '19\nAuto-generated: reports of the rule.\nLower this when removing them.\n',
    )
  })

  it('records a first budget with --write', () => {
    expect(verdict(one(40), null, true).write).toMatch(/^40\n/)
  })

  it('refuses to raise the budget with --write', () => {
    const result = verdict(one(22), '21\n', true)

    expect(result.ok).toBe(false)
    expect(result.write).toBeUndefined()
    expect(result.lines[0]).toBe(`Explicit any count 22 is above the recorded 21 (file ${file})`)
  })

  it('holds each of several counts to its own line', () => {
    const recorded = 'files 4\nexports 115\nAuto-generated: x\nnote\n'

    expect(verdict(several(4, 110), recorded).ok).toBe(true)
    expect(verdict(several(5, 100), recorded)).toEqual({
      ok: false,
      lines: [
        `Knip files count 5 exceeds budget 4 (file ${file})`,
        expect.stringContaining('Fix the new reports'),
      ],
    })
  })

  it('writes several counts one per line, and refuses to raise any of them', () => {
    expect(verdict(several(3, 115), 'files 4\nexports 115\n', true).write).toMatch(
      /^files 3\nexports 115\nAuto-generated: /,
    )
    expect(verdict(several(3, 116), 'files 4\nexports 115\n', true).ok).toBe(false)
  })
})

describe('readBudget', () => {
  it('reads a budget of several counts only when it records every one', () => {
    expect(readBudget('files 4\nexports 115\n', ['files', 'exports'])).toEqual(
      new Map([
        ['files', 4],
        ['exports', 115],
      ]),
    )
    expect(readBudget('files 4\n', ['files', 'exports'])).toBeNull()
  })
})
