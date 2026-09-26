import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  tallyKnipReport,
  knipArgs,
  productionReportLine,
} = require('../../../../tools/knipReportCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

describe('tallyKnipReport', () => {
  it('counts each issue type the budget holds across the report', () => {
    const report = {
      issues: [
        {
          file: 'src/a.css',
          files: [{ name: 'src/a.css' }],
          exports: [],
          types: [],
          duplicates: [],
        },
        {
          file: 'src/b.ts',
          files: [],
          exports: [{ name: 'one' }, { name: 'two' }],
          types: [{ name: 'Shape' }],
          duplicates: [[{ name: 'App' }, { name: 'default' }]],
        },
        { file: 'src/c.ts', exports: [{ name: 'three' }], enumMembers: [{ name: 'A' }] },
      ],
    }

    expect(tallyKnipReport(report)).toEqual(
      new Map([
        ['files', 1],
        ['exports', 3],
        ['types', 1],
        ['duplicates', 1],
      ]),
    )
  })

  it('reads a report with no issues as zero of each', () => {
    expect([...tallyKnipReport({ issues: [] }).values()]).toEqual([0, 0, 0, 0])
    expect([...tallyKnipReport({}).values()]).toEqual([0, 0, 0, 0])
  })
})

describe('knipArgs', () => {
  it('asks for the budgeted issue types as JSON in both modes', () => {
    const include = ['--include', 'files,exports,types,duplicates']

    expect(knipArgs({ production: false })).toEqual(
      expect.arrayContaining(['--reporter', 'json', ...include]),
    )
    expect(knipArgs({ production: true })).toEqual(
      expect.arrayContaining(['--production', '--reporter', 'json', ...include]),
    )
    expect(knipArgs({ production: false })).not.toContain('--production')
  })
})

describe('productionReportLine', () => {
  it('reports each production-mode count on one line', () => {
    const counts = new Map([
      ['files', 62],
      ['exports', 227],
      ['types', 157],
      ['duplicates', 15],
    ])

    expect(productionReportLine(counts)).toBe(
      'Knip in production mode, reported only: files 62, exports 227, types 157, duplicates 15',
    )
  })
})
