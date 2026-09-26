import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  parseBaseline,
  compareBudget,
  overLimitEntries,
  raisedByRewrite,
  renderBaseline,
  limitMismatch,
  rewriteGuard,
  isMeasuredSource,
} = require('../../../../tools/sizeBudgetCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

type Baseline = {
  limit: number
  allowances: Map<string, number>
  malformed: string[]
}

const baselineText = (limit: number, entries: Array<[number, string]>): string =>
  [
    `limit ${limit}`,
    'Auto-generated: non-test sources under src/ that exceed the line limit.',
    'Regenerate after a split with node tools/size-budget.mjs --write, which only lowers or removes entries. Raise or add one by hand, in the commit whose code needs it.',
    ...entries.map(([lines, path]) => `${lines} ${path}`),
  ].join('\n') + '\n'

const sizesOf = (entries: Record<string, number>): Map<string, number> =>
  new Map(Object.entries(entries))

describe('isMeasuredSource', () => {
  it('measures every script and TypeScript extension', () => {
    for (const ext of ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs']) {
      expect(isMeasuredSource(`src/main/real/huge.${ext}`)).toBe(true)
    }
  })

  it('leaves out a test file by its suffix, whatever its extension', () => {
    expect(isMeasuredSource('src/main/huge.test.ts')).toBe(false)
    expect(isMeasuredSource('src/main/huge.spec.tsx')).toBe(false)
    expect(isMeasuredSource('src/main/huge.test.js')).toBe(false)
    expect(isMeasuredSource('src/main/huge.spec.mjs')).toBe(false)
  })

  it('leaves out anything under a tests folder', () => {
    expect(isMeasuredSource('src/main/tests/helpers/huge.ts')).toBe(false)
    expect(isMeasuredSource('src/main/__tests__/huge.js')).toBe(false)
  })

  it('leaves out declaration files and files that are not source', () => {
    expect(isMeasuredSource('src/env.d.ts')).toBe(false)
    expect(isMeasuredSource('src/env.d.mts')).toBe(false)
    expect(isMeasuredSource('src/data/huge.json')).toBe(false)
    expect(isMeasuredSource('src/styles/app.css')).toBe(false)
  })
})

describe('parseBaseline', () => {
  it('reads the limit and every entry, ignoring the header notes', () => {
    const baseline = parseBaseline(baselineText(600, [[700, 'src/a.ts']])) as Baseline

    expect(baseline.limit).toBe(600)
    expect(baseline.allowances.get('src/a.ts')).toBe(700)
    expect(baseline.malformed).toEqual([])
  })

  it('reports a missing or unparseable limit line as null', () => {
    expect(parseBaseline('')).toBeNull()
    expect(parseBaseline('600\nsrc/a.ts')).toBeNull()
    expect(parseBaseline('limit six hundred')).toBeNull()
  })

  it('collects entries that do not read as `<lines> <path>`', () => {
    const baseline = parseBaseline('limit 600\n700 src/a.ts\nsrc/b.ts is big\n') as Baseline

    expect(baseline.allowances.size).toBe(1)
    expect(baseline.malformed).toEqual(['src/b.ts is big'])
  })
})

describe('compareBudget', () => {
  const baseline = parseBaseline(
    baselineText(600, [
      [700, 'src/listed.ts'],
      [800, 'src/gone.ts'],
    ]),
  ) as Baseline

  it('passes a listed file sitting exactly on its allowance', () => {
    const result = compareBudget(sizesOf({ 'src/listed.ts': 700, 'src/gone.ts': 800 }), baseline)
    expect(result).toMatchObject({ overAllowance: [], overLimit: [], slack: [], removed: [] })
  })

  it('fails a listed file that grew past its allowance', () => {
    const result = compareBudget(sizesOf({ 'src/listed.ts': 701, 'src/gone.ts': 800 }), baseline)
    expect(result.overAllowance).toHaveLength(1)
    expect(result.overAllowance[0]).toContain('grew to 701 lines, over its 700 line allowance')
  })

  it('reports a listed file that shrank as slack', () => {
    const result = compareBudget(sizesOf({ 'src/listed.ts': 699, 'src/gone.ts': 800 }), baseline)
    expect(result.slack).toHaveLength(1)
    expect(result.slack[0]).toContain('is 699 lines, allowance 700')
  })

  it('reports a listed file that no longer exists', () => {
    const result = compareBudget(sizesOf({ 'src/listed.ts': 700 }), baseline)
    expect(result.removed).toEqual(['src/gone.ts no longer exists'])
  })

  it('passes an unlisted file sitting exactly on the limit and fails one over it', () => {
    const onLimit = compareBudget(
      sizesOf({ 'src/listed.ts': 700, 'src/gone.ts': 800, 'src/new.ts': 600 }),
      baseline,
    )
    expect(onLimit.overLimit).toEqual([])

    const overLimit = compareBudget(
      sizesOf({ 'src/listed.ts': 700, 'src/gone.ts': 800, 'src/new.ts': 601 }),
      baseline,
    )
    expect(overLimit.overLimit).toHaveLength(1)
    expect(overLimit.overLimit[0]).toContain('over the 600 line limit for new files')
  })
})

describe('raisedByRewrite', () => {
  const baseline = parseBaseline(baselineText(600, [[700, 'src/a.ts']])) as Baseline

  it('names a listed file that grew, so a rewrite can refuse to launder it', () => {
    expect(raisedByRewrite(sizesOf({ 'src/a.ts': 750 }), baseline)).toHaveLength(1)
  })

  it('names an unlisted file over the limit, so a rewrite can refuse to list it', () => {
    expect(raisedByRewrite(sizesOf({ 'src/a.ts': 700, 'src/b.ts': 601 }), baseline)).toEqual([
      expect.stringContaining('src/b.ts'),
    ])
  })

  it('stays silent for a file that shrank or held steady', () => {
    expect(raisedByRewrite(sizesOf({ 'src/a.ts': 700 }), baseline)).toEqual([])
    expect(raisedByRewrite(sizesOf({ 'src/a.ts': 10 }), baseline)).toEqual([])
  })

  it('stays silent for an unlisted file at the limit', () => {
    expect(raisedByRewrite(sizesOf({ 'src/b.ts': 600 }), baseline)).toEqual([])
  })

  it('stays silent for a listed file that no longer exists', () => {
    expect(raisedByRewrite(sizesOf({}), baseline)).toEqual([])
  })
})

describe('the ratchet against edits made by hand', () => {
  it('holds an unlisted file to the tool limit when the header was raised', () => {
    const loosened = parseBaseline(baselineText(2000, [])) as Baseline

    expect(raisedByRewrite(sizesOf({ 'src/b.ts': 700 }), loosened, 600)).toEqual([
      expect.stringContaining('src/b.ts'),
    ])
  })

  it('reports a header limit other than the tool limit', () => {
    expect(limitMismatch(parseBaseline(baselineText(2000, [])) as Baseline, 600)).toEqual(
      expect.stringContaining('2000'),
    )
    expect(limitMismatch(parseBaseline(baselineText(600, [])) as Baseline, 600)).toBeNull()
  })

  it('guards a rewrite with the committed baseline when the file is gone', () => {
    const committed = baselineText(600, [[700, 'src/a.ts']])

    expect(rewriteGuard(null, committed)).toBe(committed)
    expect(rewriteGuard('working', committed)).toBe('working')
    expect(rewriteGuard(null, null)).toBeNull()
  })
})

describe('overLimitEntries', () => {
  it('lists only files over the limit, largest first', () => {
    const entries = overLimitEntries(
      sizesOf({ 'src/a.ts': 601, 'src/b.ts': 900, 'src/c.ts': 600 }),
      600,
    )
    expect(entries).toEqual([
      ['src/b.ts', 900],
      ['src/a.ts', 601],
    ])
  })
})

describe('renderBaseline', () => {
  it('round-trips through parseBaseline', () => {
    const sizes = sizesOf({ 'src/a.ts': 900, 'src/b.ts': 601, 'src/small.ts': 10 })

    const rendered = renderBaseline(sizes, 600)
    const parsed = parseBaseline(rendered) as Baseline

    expect(parsed.limit).toBe(600)
    expect(parsed.malformed).toEqual([])
    expect([...parsed.allowances]).toEqual([
      ['src/a.ts', 900],
      ['src/b.ts', 601],
    ])
  })

  it('renders a header that says --write only lowers entries and a raise lands with its code', () => {
    const header = renderBaseline(sizesOf({ 'src/a.ts': 900 }), 600)
      .split('\n')
      .slice(0, 3)

    expect(header).toEqual([
      'limit 600',
      'Auto-generated: non-test sources under src/ that exceed the line limit.',
      'Regenerate after a split with node tools/size-budget.mjs --write, which only lowers or removes entries. Raise or add one by hand, in the commit whose code needs it.',
    ])
  })

  it('renders a header even when nothing is over the limit', () => {
    const parsed = parseBaseline(renderBaseline(sizesOf({ 'src/a.ts': 10 }), 600)) as Baseline
    expect(parsed.allowances.size).toBe(0)
  })
})
