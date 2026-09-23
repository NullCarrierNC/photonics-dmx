import { describe, expect, it } from '@jest/globals'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  parseRange,
  isWithin,
  resolveSpec,
  unneededOverrides,
} = require('../../../../tools/overridesCheckCore.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

describe('parseRange', () => {
  it.each([
    ['4.3.2', { low: [4, 3, 2], high: [4, 3, 3] }],
    ['^4.3.0', { low: [4, 3, 0], high: [5, 0, 0] }],
    ['^0.8.3', { low: [0, 8, 3], high: [0, 9, 0] }],
    ['^0.0.4', { low: [0, 0, 4], high: [0, 0, 5] }],
    ['~0.8.2', { low: [0, 8, 2], high: [0, 9, 0] }],
    ['>= 4.21.0', { low: [4, 21, 0], high: null }],
    ['*', { low: [0, 0, 0], high: null }],
  ])('reads %s as an interval', (range, interval) => {
    expect(parseRange(range)).toEqual(interval)
  })

  it.each(['1.x', '^1.0.0 || ^2.0.0', 'npm:other@1.0.0', '1.0.0-beta.1'])(
    'does not read %s',
    (range) => {
      expect(parseRange(range)).toBeNull()
    },
  )
})

describe('isWithin', () => {
  it.each([
    ['4.3.2', '^4.3.0', true],
    ['^4.3.2', '^4.3.0', true],
    ['^4.3.0', '4.3.2', false],
    ['~0.8.2', '^0.8.3', false],
    ['^0.7.8', '^0.8.0', false],
    ['30.0.0', '^30.2.0', false],
    ['>= 4.21.0', '^4.28.9', false],
    ['^4.30.0', '>= 4.21.0', true],
    ['1.x', '*', false],
  ])('%s inside %s is %s', (inner, outer, within) => {
    expect(isWithin(inner, outer)).toBe(within)
  })
})

describe('resolveSpec', () => {
  it('reads a $ reference from the root dev dependencies', () => {
    expect(resolveSpec('$jest', { devDependencies: { jest: '^30.2.0' } })).toBe('^30.2.0')
  })
})

describe('unneededOverrides', () => {
  const lockWith = (ranges: string[]) => ({
    packages: Object.fromEntries(
      ranges.map((range, i) => [`node_modules/dep-${i}`, { dependencies: { target: range } }]),
    ),
  })

  it('keeps an override some dependent asks for a wider range than', () => {
    expect(unneededOverrides({ overrides: { target: '^1.2.0' } }, lockWith(['^1.0.0']))).toEqual([])
  })

  it('names an override every dependent already asks inside', () => {
    expect(
      unneededOverrides({ overrides: { target: '^1.2.0' } }, lockWith(['^1.3.0', '1.2.5'])),
    ).toEqual([expect.stringContaining('target')])
  })

  it('names an override nothing depends on', () => {
    expect(unneededOverrides({ overrides: { target: '^1.2.0' } }, lockWith([]))).toEqual([
      expect.stringContaining('nothing'),
    ])
  })

  it('keeps an override when a dependent range is a form it does not read', () => {
    expect(unneededOverrides({ overrides: { target: '^1.2.0' } }, lockWith(['1.x']))).toEqual([])
  })

  it('compares a $ reference against the root range it names', () => {
    const manifest = { overrides: { target: '$root' }, devDependencies: { root: '^2.1.0' } }
    expect(unneededOverrides(manifest, lockWith(['2.0.0']))).toEqual([])
    expect(unneededOverrides(manifest, lockWith(['2.2.0']))).toHaveLength(1)
  })
})
